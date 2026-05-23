import { logger } from "./logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const VISION_TIMEOUT_MS = 12000;
const TEXT_TIMEOUT_MS = 30000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

// ─── 2-key rotation pool with 429 cooldown ──────────────────────────────────────
const KEY_POOL: string[] = [
  process.env["OR_KEY_1"],
  process.env["OR_KEY_2"],
].filter(Boolean) as string[];

const cooldownMap = new Map<string, number>();

function getNextKey(): string {
  if (KEY_POOL.length === 0) throw new Error("No OpenRouter API keys configured");
  const now = Date.now();
  for (let i = 0; i < KEY_POOL.length; i++) {
    const key = KEY_POOL[i]!;
    const cooldownUntil = cooldownMap.get(key);
    if (!cooldownUntil || now >= cooldownUntil) return key;
  }
  logger.warn("All OpenRouter keys on cooldown — using least-recently-cooled key");
  let earliest = Infinity;
  let best = KEY_POOL[0]!;
  for (const key of KEY_POOL) {
    const until = cooldownMap.get(key) ?? 0;
    if (until < earliest) { earliest = until; best = key; }
  }
  return best;
}

function markRateLimited(key: string): void {
  cooldownMap.set(key, Date.now() + RATE_LIMIT_COOLDOWN_MS);
  logger.info({ keyHint: key.slice(-4) }, "Key rate-limited, 60s cooldown");
}

const CAPTION_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "minimax/minimax-m2.5:free",
];

const REFINE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-20b:free",
  "minimax/minimax-m2.5:free",
];

const VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

async function callModel(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  timeoutMs: number,
  stream = false
): Promise<Response | null> {
  const apiKey = getNextKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://captioncraft.replit.app",
        "X-Title": "CaptionCraft",
      },
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) markRateLimited(apiKey);
      logger.warn({ model, status, keyHint: apiKey.slice(-4) }, "OpenRouter non-OK");
      clearTimeout(timer);
      return null;
    }

    if (!stream) {
      const text = await response.text();
      clearTimeout(timer);
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    logger.warn({ model, isAbort }, "Model call failed");
    return null;
  }
}

async function callWithFallback(
  models: string[],
  messages: Array<{ role: string; content: unknown }>,
  timeoutMs: number
): Promise<string> {
  for (const model of models) {
    const resp = await callModel(model, messages, timeoutMs, false);
    if (!resp) continue;
    try {
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (content) {
        logger.info({ model }, "Succeeded");
        return content;
      }
    } catch {
      logger.warn({ model }, "Failed to parse response JSON");
    }
  }
  throw new Error(`All ${models.length} models failed`);
}

export interface VisualAnalysis {
  scene_description: string;
  mood: string;
  key_objects: string[];
  color_palette: string[];
  human_count: number;
}

export interface GeneratedCaption {
  text: string;
  hashtags: string[];
  cta: string;
}

const FALLBACK_VISUAL: VisualAnalysis = {
  scene_description: "An engaging photo shared by an Indian content creator",
  mood: "vibrant and expressive",
  key_objects: ["person", "setting", "moment"],
  color_palette: ["warm", "vivid"],
  human_count: 1,
};

export async function extractVisuals(
  imageBase64: string,
  imageType: string
): Promise<VisualAnalysis> {
  try {
    const content = await callWithFallback(
      VISION_MODELS,
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image. Return ONLY valid JSON — no markdown, no fences:
{"scene_description":"...","mood":"...","key_objects":["..."],"color_palette":["..."],"human_count":0}`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${imageType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      VISION_TIMEOUT_MS
    );
    const objMatch = content.replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(objMatch[0]) as VisualAnalysis;
    if (parsed.scene_description) return parsed;
    throw new Error("Missing scene_description");
  } catch (err) {
    logger.warn({ err }, "Vision extraction unavailable — using fallback");
    return FALLBACK_VISUAL;
  }
}

function buildCaptionPrompt(visual: VisualAnalysis, platform: string, tone: string): string {
  const toneMap: Record<string, string> = {
    "Desi/Hinglish": "Smooth Hinglish — natural blend of Hindi and English. No forced translations.",
    Funny: "Sharp wit and humor. Unexpected twists, self-deprecating observations.",
    Professional: "Polished, confident, insight-driven English. LinkedIn thought leadership.",
    Savage: "Bold, unapologetic, clever. The kind of caption people screenshot.",
  };
  const platformMap: Record<string, string> = {
    Instagram: "Visual storytelling, hook in first line, conversational.",
    LinkedIn: "Professional story with a lesson, thought leadership angle.",
    YouTube: "Catchy hook, searchable keywords, value proposition upfront.",
  };
  return `You are an elite social media strategist for Indian creators. Write exactly 5 viral captions.

IMAGE: ${visual.scene_description}
Mood: ${visual.mood} | Elements: ${visual.key_objects.join(", ")} | Colors: ${visual.color_palette.join(", ")} | People: ${visual.human_count}

PLATFORM: ${platform} — ${platformMap[platform] ?? platform}
TONE: ${tone} — ${toneMap[tone] ?? tone}

Rules:
- Scroll-stopping hook as first line
- Natural flow, no awkward phrasing
- 5-8 specific contextual hashtags (no #love #life generics)
- Exactly ONE strong call-to-action per caption

Output ONLY this JSON array — no markdown, no fences, nothing else:
[{"text":"caption without hashtags","hashtags":["tag1","tag2","tag3","tag4","tag5"],"cta":"call to action"},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."}]`;
}

function parseCaptions(raw: string): GeneratedCaption[] {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const jsonStr = arrayMatch ? arrayMatch[0] : cleaned;
  try {
    const parsed = JSON.parse(jsonStr) as GeneratedCaption[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 5);
    throw new Error("Empty array");
  } catch {
    logger.warn({ jsonStr: jsonStr.slice(0, 400) }, "Failed to parse captions JSON");
    const fallback: GeneratedCaption = {
      text: "AI returned an unexpected format. Please try generating again.",
      hashtags: ["#content", "#creator", "#india", "#viral"],
      cta: "Drop your thoughts in the comments!",
    };
    return Array(5).fill(fallback) as GeneratedCaption[];
  }
}

export async function generateCaptions(
  visual: VisualAnalysis,
  platform: string,
  tone: string
): Promise<GeneratedCaption[]> {
  const content = await callWithFallback(
    CAPTION_MODELS,
    [{ role: "user", content: buildCaptionPrompt(visual, platform, tone) }],
    TEXT_TIMEOUT_MS
  );
  return parseCaptions(content);
}

export type SSEEvent =
  | { type: "stage"; message: string }
  | { type: "thinking" }
  | { type: "done"; captions: GeneratedCaption[]; visualAnalysis: VisualAnalysis }
  | { type: "error"; message: string };

export async function* generateCaptionsStream(
  imageBase64: string,
  imageType: string,
  platform: string,
  tone: string,
  clientAbortSignal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  if (KEY_POOL.length === 0) {
    yield { type: "error", message: "No OpenRouter API keys configured" };
    return;
  }

  yield { type: "stage", message: "Maverick is scanning your visuals..." };
  let visual: VisualAnalysis;
  try {
    visual = await extractVisuals(imageBase64, imageType);
  } catch {
    visual = FALLBACK_VISUAL;
  }

  yield { type: "stage", message: "DeepSeek R1 is reasoning your captions..." };
  yield { type: "thinking" };

  const messages = [{ role: "user", content: buildCaptionPrompt(visual, platform, tone) }];

  for (const model of CAPTION_MODELS) {
    if (clientAbortSignal?.aborted) {
      logger.info("Client disconnected, aborting stream pipeline");
      return;
    }
    try {
      const apiKey = getNextKey();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEXT_TIMEOUT_MS);

      // Link client abort to this request's abort
      const onClientAbort = () => controller.abort();
      clientAbortSignal?.addEventListener("abort", onClientAbort);

      let streamResp: Response | null = null;
      try {
        const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://captioncraft.replit.app",
            "X-Title": "CaptionCraft",
          },
          body: JSON.stringify({ model, messages, stream: true }),
        });
        if (r.ok) streamResp = r;
        else {
          if (r.status === 429) markRateLimited(apiKey);
          logger.warn({ model, status: r.status }, "Stream model non-OK");
        }
      } catch (fetchErr) {
        logger.warn({ model, fetchErr }, "Stream fetch failed");
      } finally {
        clientAbortSignal?.removeEventListener("abort", onClientAbort);
      }

      clearTimeout(timer);
      if (!streamResp?.body) continue;

      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        if (clientAbortSignal?.aborted) {
          reader.cancel().catch(() => {});
          logger.info("Client disconnected mid-stream, releasing reader");
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) accumulated += delta;
          } catch { /* malformed chunk */ }
        }
      }

      if (accumulated.trim()) {
        yield {
          type: "done",
          captions: parseCaptions(accumulated),
          visualAnalysis: visual,
        };
        return;
      }
    } catch (err) {
      logger.warn({ model, err }, "Streaming model failed, trying next");
    }
  }

  yield { type: "error", message: "Servers are heavily loaded, please try again in a moment." };
}

export async function refineCaption(
  captionText: string,
  hashtags: string[],
  cta: string,
  platform: string,
  tone: string
): Promise<GeneratedCaption> {
  const prompt = `Polish this ${platform} caption (tone: ${tone}).

Caption: ${captionText}
Hashtags: ${hashtags.join(" ")}
CTA: ${cta}

Strengthen the hook, keep only 5-8 best hashtags, sharpen CTA, fix awkward phrasing.

Output ONLY this JSON — no markdown, no fences:
{"text":"refined caption","hashtags":["tag1","tag2","tag3","tag4","tag5"],"cta":"sharpened cta"}`;

  try {
    const content = await callWithFallback(REFINE_MODELS, [{ role: "user", content: prompt }], TEXT_TIMEOUT_MS);
    const objMatch = content.replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("No JSON found");
    return JSON.parse(objMatch[0]) as GeneratedCaption;
  } catch {
    return { text: captionText, hashtags, cta };
  }
}
