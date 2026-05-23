import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, savedCaptionsTable, usersTable } from "@workspace/db";
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
  await db
    .update(usersTable)
    .set({ usageCounter: sql`${usersTable.usageCounter} + 1` })
    .where(eq(usersTable.id, userId));
}

async function decrementUsage(req: Request): Promise<void> {
  if (!AUTH_ENABLED || !req.user) return;
  const userId = (req.user as { id: number }).id;
  await db
    .update(usersTable)
    .set({ usageCounter: sql`greatest(${usersTable.usageCounter} - 1, 0)` })
    .where(eq(usersTable.id, userId));
}

async function atomicCreditLock(req: Request, res: Response): Promise<boolean> {
  if (!AUTH_ENABLED || !req.user) return true;
  const userId = (req.user as { id: number }).id;
  const result = await db
    .update(usersTable)
    .set({ usageCounter: sql`${usersTable.usageCounter} + 1` })
    .where(eq(usersTable.id, userId))
    .returning({ usageCounter: usersTable.usageCounter, status: usersTable.status });
  const row = result[0];
  if (!row) {
    res.status(500).json({ error: "User not found", code: "USER_NOT_FOUND" });
    return false;
  }
  if (row.status === "FREE" && row.usageCounter > 10) {
    await db
      .update(usersTable)
      .set({ usageCounter: sql`${usersTable.usageCounter} - 1` })
      .where(eq(usersTable.id, userId));
    res.status(403).json({
      error: "Monthly caption limit reached. Join our premium waitlist to continue.",
      code: "LIMIT_REACHED",
    });
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
  if (!creditLocked) return; // response already sent (403/500)

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
router.get("/captions/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const [total, byPlatform, byTone] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(savedCaptionsTable).then((r) => r[0]?.count ?? 0),
      db.select({ label: savedCaptionsTable.platform, count: sql<number>`count(*)::int` }).from(savedCaptionsTable).groupBy(savedCaptionsTable.platform),
      db.select({ label: savedCaptionsTable.tone, count: sql<number>`count(*)::int` }).from(savedCaptionsTable).groupBy(savedCaptionsTable.tone),
    ]);
    res.json({ totalSaved: total, byPlatform, byTone });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Gallery list ─────────────────────────────────────────────────────────────
router.get("/captions", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListSavedCaptionsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { platform, tone, limit } = parsed.data;
  try {
    let query = db.select().from(savedCaptionsTable).orderBy(desc(savedCaptionsTable.createdAt)).limit(limit ?? 50).$dynamic();
    if (platform) query = query.where(eq(savedCaptionsTable.platform, platform));
    if (tone) query = query.where(eq(savedCaptionsTable.tone, tone));
    const rows = await query;
    res.json(rows.map((r) => ({
      id: r.id, text: r.text, hashtags: r.hashtags, cta: r.cta,
      platform: r.platform, tone: r.tone,
      imagePreviewBase64: r.imagePreviewBase64 ?? null,
      createdAt: r.createdAt.toISOString(),
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
    const [saved] = await db.insert(savedCaptionsTable)
      .values({ text, hashtags, cta, platform, tone, imagePreviewBase64: imagePreviewBase64 ?? null })
      .returning();
    if (!saved) { res.status(500).json({ error: "Failed to save" }); return; }
    res.status(201).json({
      id: saved.id, text: saved.text, hashtags: saved.hashtags, cta: saved.cta,
      platform: saved.platform, tone: saved.tone,
      imagePreviewBase64: saved.imagePreviewBase64 ?? null,
      createdAt: saved.createdAt.toISOString(),
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
    const [deleted] = await db.delete(savedCaptionsTable).where(eq(savedCaptionsTable.id, parsed.data.id)).returning();
    if (!deleted) { res.status(404).json({ error: "Caption not found" }); return; }
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "Failed to delete caption");
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
