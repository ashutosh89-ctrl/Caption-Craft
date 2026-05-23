import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { supabase } from "@workspace/db";
import {
  GenerateCaptionsBody,
  RefineCaptionBody,
  SaveCaptionBody,
  DeleteCaptionParams,
  ListSavedCaptionsQueryParams,
} from "@workspace/api-zod";
import { extractVisuals, generateCaptions, generateCaptionsStream, refineCaption } from "../lib/openrouter";
import { AUTH_ENABLED } from "../lib/passport";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Auth & usage middleware ──────────────────────────────────────────────────
function requireAuthAndUsage(req: Request, res: Response, next: NextFunction): void {
  if (!AUTH_ENABLED) { next(); return; }
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    return;
  }
  const u = req.user as { status: string; usageCounter: number };
  if (u.status === "FREE" && u.usageCounter >= 10) {
    res.status(403).json({
      error: "Monthly caption limit reached. Join our premium waitlist to continue.",
      code: "LIMIT_REACHED",
    });
    return;
  }
  next();
}

async function incrementUsage(req: Request): Promise<void> {
  if (!AUTH_ENABLED || !req.user) return;
  const userId = (req.user as { id: number }).id;
  const { data: user } = await supabase.from("users").select("usage_counter").eq("id", userId).single();
  const current = user?.usage_counter ?? 0;
  await supabase.from("users").update({ usage_counter: current + 1 }).eq("id", userId);
}

async function decrementUsage(req: Request): Promise<void> {
  if (!AUTH_ENABLED || !req.user) return;
  const userId = (req.user as { id: number }).id;
  const { data: user } = await supabase.from("users").select("usage_counter").eq("id", userId).single();
  const current = user?.usage_counter ?? 0;
  await supabase.from("users").update({ usage_counter: Math.max(current - 1, 0) }).eq("id", userId);
}

async function atomicCreditLock(req: Request, res: Response): Promise<boolean> {
  if (!AUTH_ENABLED || !req.user) return true;
  const userId = (req.user as { id: number }).id;

  // Read current state
  const { data: user, error } = await supabase
    .from("users")
    .select("usage_counter, status")
    .eq("id", userId)
    .single();

  if (error || !user) {
    res.status(500).json({ error: "User not found", code: "USER_NOT_FOUND" });
    return false;
  }

  const newCounter = (user.usage_counter as number) + 1;

  // Check limit after increment
  if (user.status === "FREE" && newCounter > 10) {
    res.status(403).json({
      error: "Monthly caption limit reached. Join our premium waitlist to continue.",
      code: "LIMIT_REACHED",
    });
    return false;
  }

  // Atomically increment
  const { error: updateError } = await supabase
    .from("users")
    .update({ usage_counter: newCounter })
    .eq("id", userId);

  if (updateError) {
    res.status(500).json({ error: "Failed to lock credit", code: "CREDIT_LOCK_FAILED" });
    return false;
  }

  return true;
}

// ─── Streaming endpoint (SSE) ─────────────────────────────────────────────────
router.post("/captions/stream", requireAuthAndUsage, async (req: Request, res: Response): Promise<void> => {
  const parsed = GenerateCaptionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { imageBase64, imageType, platform, tone } = parsed.data;

  // Atomic credit lock: increment BEFORE calling OpenRouter
  const creditLocked = await atomicCreditLock(req, res);
  if (!creditLocked) return;

  // AbortController linked to client disconnect
  const clientAbort = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) {
      clientAbort.abort();
      logger.info("Client disconnected, aborting OpenRouter stream");
    }
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  function send(data: unknown): void {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": heartbeat\n\n"); }, 5000);
  req.log.info({ platform, tone }, "Starting streaming pipeline");

  let succeeded = false;
  try {
    for await (const event of generateCaptionsStream(imageBase64, imageType, platform, tone, clientAbort.signal)) {
      send(event);
      if (event.type === "done") { succeeded = true; break; }
      if (event.type === "error") break;
    }
  } catch (err) {
    req.log.error({ err }, "Stream pipeline error");
    send({ type: "error", message: "Pipeline failed unexpectedly. Please try again." });
  } finally {
    if (!succeeded) {
      try { await decrementUsage(req); } catch (err) { logger.warn({ err }, "Failed to refund credit"); }
    }
    clearInterval(heartbeat);
    res.end();
  }
});

// ─── Non-streaming fallback ───────────────────────────────────────────────────
router.post("/captions/generate", requireAuthAndUsage, async (req: Request, res: Response): Promise<void> => {
  const parsed = GenerateCaptionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { imageBase64, imageType, platform, tone } = parsed.data;
  try {
    const visual = await extractVisuals(imageBase64, imageType);
    const captions = await generateCaptions(visual, platform, tone);
    await incrementUsage(req);
    res.json({
      captions,
      visualAnalysis: {
        sceneDescription: visual.scene_description,
        mood: visual.mood,
        keyObjects: visual.key_objects,
        colorPalette: visual.color_palette,
        humanCount: visual.human_count,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Caption generation failed");
    res.status(500).json({ error: "AI pipeline failed. Please try again." });
  }
});

// ─── Refine ───────────────────────────────────────────────────────────────────
router.post("/captions/refine", async (req: Request, res: Response): Promise<void> => {
  const parsed = RefineCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { captionText, platform, tone, hashtags, cta } = parsed.data;
  try {
    const refined = await refineCaption(captionText, hashtags, cta, platform, tone);
    res.json(refined);
  } catch (err) {
    req.log.error({ err }, "Caption refinement failed");
    res.status(500).json({ error: "Refinement failed. Please try again." });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/captions/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { count: total } = await supabase.from("saved_captions").select("*", { count: "exact", head: true });
    const { data: byPlatform } = await supabase.from("saved_captions").select("platform");
    const { data: byTone } = await supabase.from("saved_captions").select("tone");

    const platformCounts: Record<string, number> = {};
    for (const r of byPlatform ?? []) {
      const p = r.platform as string;
      platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    }
    const toneCounts: Record<string, number> = {};
    for (const r of byTone ?? []) {
      const t = r.tone as string;
      toneCounts[t] = (toneCounts[t] ?? 0) + 1;
    }

    res.json({
      totalSaved: total ?? 0,
      byPlatform: Object.entries(platformCounts).map(([label, count]) => ({ label, count })),
      byTone: Object.entries(toneCounts).map(([label, count]) => ({ label, count })),
    });
  } catch (err) {
    _req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Gallery list ─────────────────────────────────────────────────────────────
router.get("/captions", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListSavedCaptionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { platform, tone, limit } = parsed.data;
  try {
    let query = supabase.from("saved_captions").select("*").order("created_at", { ascending: false }).limit(limit ?? 50);
    if (platform) query = query.eq("platform", platform);
    if (tone) query = query.eq("tone", tone);
    const { data: rows, error } = await query;
    if (error) throw error;
    res.json((rows ?? []).map((r: any) => ({
      id: r.id, text: r.text, hashtags: r.hashtags, cta: r.cta,
      platform: r.platform, tone: r.tone,
      imagePreviewBase64: r.image_preview_base64 ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list captions");
    res.status(500).json({ error: "Failed to fetch gallery" });
  }
});

// ─── Save ─────────────────────────────────────────────────────────────────────
router.post("/captions", async (req: Request, res: Response): Promise<void> => {
  const parsed = SaveCaptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { text, hashtags, cta, platform, tone, imagePreviewBase64 } = parsed.data;
  try {
    const { data: saved, error } = await supabase.from("saved_captions")
      .insert({ text, hashtags, cta, platform, tone, image_preview_base64: imagePreviewBase64 ?? null })
      .select()
      .single();
    if (error || !saved) { res.status(500).json({ error: "Failed to save" }); return; }
    const r = saved as any;
    res.status(201).json({
      id: r.id, text: r.text, hashtags: r.hashtags, cta: r.cta,
      platform: r.platform, tone: r.tone,
      imagePreviewBase64: r.image_preview_base64 ?? null,
      createdAt: new Date(r.created_at).toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to save caption");
    res.status(500).json({ error: "Failed to save caption" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/captions/:id", async (req: Request, res: Response): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = DeleteCaptionParams.safeParse({ id: raw });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    const { data: deleted, error } = await supabase.from("saved_captions")
      .delete()
      .eq("id", parsed.data.id)
      .select()
      .single();
    if (error || !deleted) { res.status(404).json({ error: "Caption not found" }); return; }
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "Failed to delete caption");
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
