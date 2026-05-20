import { logger } from "./logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

// Per-model call timeout — avoids hanging on slow free models
const VISION_TIMEOUT_MS = 12000;
const TEXT_TIMEOUT_MS = 25000;

// Free text-only models for caption/refine — NOT rate-limited like vision models
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

// Free vision models — highly unreliable/rate-limited; vision step is best-effort only
const VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
];

async function callModel(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  timeoutMs: number
): Promise<string | null> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

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
      body: JSON.stringify({ model, messages }),
    });

    if (!response.ok) {
      const status = response.status;
      logger.warn({ model, status }, "OpenRouter non-OK");
      return null;
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      logger.warn({ model }, "Empty content");
      return null;
    }

    return content;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    logger.warn({ model, isAbort, err: isAbort ? "timeout" : err }, "Model call failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callWithFallback(
  models: string[],
  messages: Array<{ role: string; content: unknown }>,
  timeoutMs: number
): Promise<string> {
  for (const model of models) {
    const result = await callModel(model, messages, timeoutMs);
    if (result) {
      logger.info({ model }, "Succeeded");
      return result;
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
              text: `Analyze this image. Return ONLY valid JSON — no markdown, no fences, no text outside the JSON:
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
    if (!objMatch) throw new Error("No JSON object found");

    const parsed = JSON.parse(objMatch[0]) as VisualAnalysis;
    if (parsed.scene_description) {
      logger.info("Vision extraction succeeded");
      return parsed;
    }
    throw new Error("Missing scene_description");
  } catch (err) {
    logger.warn({ err }, "Vision extraction unavailable — using fallback context");
    return FALLBACK_VISUAL;
  }
}

export async function generateCaptions(
  visual: VisualAnalysis,
  platform: string,
  tone: string
): Promise<GeneratedCaption[]> {
  const toneInstructions: Record<string, string> = {
    "Desi/Hinglish":
      "Write in smooth Hinglish — natural blend of Hindi and English that sounds like how young Indians actually talk. No forced translations. Keep it organic.",
    Funny:
      "Write with sharp wit and humor. Unexpected twists, self-deprecating observations, make people laugh.",
    Professional:
      "Polished, confident, insight-driven English. Thought leadership. LinkedIn-ready.",
    Savage:
      "Bold, unapologetic, clever. The kind of caption people screenshot.",
  };

  const platformInstructions: Record<string, string> = {
    Instagram: "Instagram: visual storytelling, hook in first line, conversational.",
    LinkedIn: "LinkedIn: professional story with a lesson, thought leadership.",
    YouTube: "YouTube: catchy hook, searchable keywords, value proposition.",
  };

  const prompt = `You are an elite social media strategist for Indian creators. Write exactly 5 viral captions.

IMAGE: ${visual.scene_description}
Mood: ${visual.mood} | Elements: ${visual.key_objects.join(", ")} | Colors: ${visual.color_palette.join(", ")} | People: ${visual.human_count}

PLATFORM: ${platform} — ${platformInstructions[platform] ?? platform}
TONE: ${tone} — ${toneInstructions[tone] ?? tone}

Each caption must:
- Open with a scroll-stopping hook
- Flow naturally, no awkward phrasing
- Include 5-8 specific, contextual hashtags (no #love #life generics)
- End with exactly ONE strong call-to-action

Output ONLY this JSON array — no markdown, no fences, nothing else before or after:
[{"text":"caption without hashtags","hashtags":["tag1","tag2","tag3","tag4","tag5"],"cta":"call to action"},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."},{"text":"...","hashtags":["..."],"cta":"..."}]`;

  const content = await callWithFallback(
    CAPTION_MODELS,
    [{ role: "user", content: prompt }],
    TEXT_TIMEOUT_MS
  );

  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const jsonStr = arrayMatch ? arrayMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(jsonStr) as GeneratedCaption[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 5);
    throw new Error("Not an array or empty");
  } catch {
    logger.warn({ jsonStr: jsonStr.slice(0, 400) }, "Failed to parse captions");
    const fallback: GeneratedCaption = {
      text: "AI returned an unexpected format. Please try generating again.",
      hashtags: ["#content", "#creator", "#india", "#viral"],
      cta: "Drop your thoughts in the comments!",
    };
    return Array(5).fill(fallback) as GeneratedCaption[];
  }
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

Strengthen the hook, trim weak hashtags (keep 5-8 best), sharpen the CTA, fix any awkward phrasing.

Output ONLY this JSON — no markdown, no fences:
{"text":"refined caption","hashtags":["tag1","tag2","tag3","tag4","tag5"],"cta":"sharpened cta"}`;

  try {
    const content = await callWithFallback(
      REFINE_MODELS,
      [{ role: "user", content: prompt }],
      TEXT_TIMEOUT_MS
    );

    const objMatch = content.replace(/```[\s\S]*?```/g, "").match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error("No JSON found");
    return JSON.parse(objMatch[0]) as GeneratedCaption;
  } catch {
    return { text: captionText, hashtags, cta };
  }
}
