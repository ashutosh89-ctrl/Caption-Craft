import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, savedCaptionsTable } from "@workspace/db";
import {
  GenerateCaptionsBody,
  RefineCaptionBody,
  SaveCaptionBody,
  DeleteCaptionParams,
  ListSavedCaptionsQueryParams,
} from "@workspace/api-zod";
import {
  extractVisuals,
  generateCaptions,
  generateCaptionsStream,
  refineCaption,
} from "../lib/openrouter";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Streaming endpoint (SSE) ────────────────────────────────────────────────
router.post("/captions/stream", async (req, res): Promise<void> => {
  const parsed = GenerateCaptionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, imageType, platform, tone } = parsed.data;

  // Set up SSE headers — keeps connection alive through long AI calls
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Helper to write an SSE event
  function send(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Heartbeat every 5s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 5000);

  req.log.info({ platform, tone }, "Starting streaming pipeline");

  try {
    for await (const event of generateCaptionsStream(imageBase64, imageType, platform, tone)) {
      send(event);
      if (event.type === "done" || event.type === "error") break;
    }
  } catch (err) {
    req.log.error({ err }, "Stream pipeline error");
    send({ type: "error", message: "Pipeline failed unexpectedly. Please try again." });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ─── Non-streaming fallback ───────────────────────────────────────────────────
router.post("/captions/generate", async (req, res): Promise<void> => {
  const parsed = GenerateCaptionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageBase64, imageType, platform, tone } = parsed.data;

  try {
    req.log.info({ platform, tone }, "Starting visual extraction");
    const visual = await extractVisuals(imageBase64, imageType);

    req.log.info({ platform, tone, mood: visual.mood }, "Starting caption generation");
    const captions = await generateCaptions(visual, platform, tone);

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
    req.log.error({ err }, "Caption generation pipeline failed");
    res.status(500).json({ error: "AI pipeline failed. Please try again." });
  }
});

// ─── Refine ───────────────────────────────────────────────────────────────────
router.post("/captions/refine", async (req, res): Promise<void> => {
  const parsed = RefineCaptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { captionText, platform, tone, hashtags, cta } = parsed.data;

  try {
    req.log.info({ platform, tone }, "Refining caption with Scout");
    const refined = await refineCaption(captionText, hashtags, cta, platform, tone);
    res.json(refined);
  } catch (err) {
    req.log.error({ err }, "Caption refinement failed");
    res.status(500).json({ error: "Refinement failed. Please try again." });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/captions/stats", async (req, res): Promise<void> => {
  try {
    const [total, byPlatform, byTone] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(savedCaptionsTable)
        .then((rows) => rows[0]?.count ?? 0),
      db.select({ label: savedCaptionsTable.platform, count: sql<number>`count(*)::int` })
        .from(savedCaptionsTable).groupBy(savedCaptionsTable.platform),
      db.select({ label: savedCaptionsTable.tone, count: sql<number>`count(*)::int` })
        .from(savedCaptionsTable).groupBy(savedCaptionsTable.tone),
    ]);
    res.json({ totalSaved: total, byPlatform, byTone });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Gallery list ─────────────────────────────────────────────────────────────
router.get("/captions", async (req, res): Promise<void> => {
  const parsed = ListSavedCaptionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { platform, tone, limit } = parsed.data;

  try {
    let query = db.select().from(savedCaptionsTable)
      .orderBy(desc(savedCaptionsTable.createdAt))
      .limit(limit ?? 50)
      .$dynamic();

    if (platform) query = query.where(eq(savedCaptionsTable.platform, platform));
    if (tone) query = query.where(eq(savedCaptionsTable.tone, tone));

    const rows = await query;
    res.json(rows.map((r) => ({
      id: r.id,
      text: r.text,
      hashtags: r.hashtags,
      cta: r.cta,
      platform: r.platform,
      tone: r.tone,
      imagePreviewBase64: r.imagePreviewBase64 ?? null,
      createdAt: r.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list captions");
    res.status(500).json({ error: "Failed to fetch gallery" });
  }
});

// ─── Save ─────────────────────────────────────────────────────────────────────
router.post("/captions", async (req, res): Promise<void> => {
  const parsed = SaveCaptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

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
router.delete("/captions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = DeleteCaptionParams.safeParse({ id: raw });
  if (!parsed.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  try {
    const [deleted] = await db.delete(savedCaptionsTable)
      .where(eq(savedCaptionsTable.id, parsed.data.id))
      .returning();

    if (!deleted) { res.status(404).json({ error: "Caption not found" }); return; }
    res.sendStatus(204);
  } catch (err) {
    logger.error({ err }, "Failed to delete caption");
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
