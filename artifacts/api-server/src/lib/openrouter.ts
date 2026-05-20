import { logger } from "./logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const VISION_TIMEOUT_MS = 12000;
const TEXT_TIMEOUT_MS = 30000;

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
      body: JSON.stringify({ model, messages, stream }),
    });

    if (!response.ok) {
      logger.warn({ model, status: response.status }, "OpenRouter non-OK");
      clearTimeout(timer);
      return null;
    }

    // For non-streaming, read body and return a resolved response
    if (!stream) {
      const text = await response.text();
      clearTimeout(timer);
      return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // For streaming, caller is responsible for clearing timer
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
    if (parsed.scene_description) return parsed;
    throw new Error("Missing scene_description");
  } catch (err) {
    logger.warn({ err }, "Vision extraction unavailable — using fallback");
    return FALLBACK_VISUAL;
  }
}

function buildCaptionPrompt(visual: VisualAnalysis, platform: string, tone: string): string {
  const toneInstructions: Record<string, string> = {
    "Desi/Hinglish": "Write in smooth Hinglish — natural blend of Hindi and English that sounds like how young Indians actually talk. No forced translations. Keep it organic.",
    Funny: "Write with sharp wit and humor. Unexpected twists, self-deprecating observations, make people laugh.",
    Professional: "Polished, confident, insight-driven English. Thought leadership. LinkedIn-ready.",
    Savage: "Bold, unapologetic, clever. The kind of caption people screenshot.",
  };
  const platformInstructions: Record<string, string> = {
    Instagram: "Instagram: visual storytelling, hook in first line, conversational.",
    LinkedIn: "LinkedIn: professional story with a lesson, thought leadership.",
    YouTube: "YouTube: catchy hook, searchable keywords, value proposition.",
  };
  return `You are an elite social media strategist for Indian creators. Write exactly 5 viral captions.

IMAGE: ${visual.scene_description}
Mood: ${visual.mood} | Elements: ${visual.key_objects.join(", ")} | Colors: ${visual.color_palette.join(", ")} | People: ${visual.human_count}

PLATFORM: ${platform} — ${platformInstructions[platform] ?? platform}
TONE: ${tone} — ${toneInstructions[tone] ?? tone}

Each caption must:
- Open with a scroll-stopping hook
- Flow naturally, no awkward phrasing
- Include 5-8 specific contextual hashtags (no #love #life generics)
- End with exactly ONE strong call-to-action

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
    throw new Error("Not an array");
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

export async function generateCaptions(
  visual: VisualAnalysis,
  platform: string,
  tone: string
): Promise<GeneratedCaption[]> {
  const prompt = buildCaptionPrompt(visual, platform, tone);
  const content = await callWithFallback(
    CAPTION_MODELS,
    [{ role: "user", content: prompt }],
    TEXT_TIMEOUT_MS
  );
  return parseCaptions(content);
}

// SSE-friendly streaming generator — yields events for stage updates and final result
export type SSEEvent =
  | { type: "stage"; message: string }
  | { type: "thinking" }
  | { type: "done"; captions: GeneratedCaption[]; visualAnalysis: VisualAnalysis }
  | { type: "error"; message: string };

export async function* generateCaptionsStream(
  imageBase64: string,
  imageType: string,
  platform: string,
  tone: string
): AsyncGenerator<SSEEvent> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    yield { type: "error", message: "OPENROUTER_API_KEY is not configured" };
    return;
  }

  // Stage 1: Visual analysis
  yield { type: "stage", message: "Maverick is scanning your visuals..." };

  let visual: VisualAnalysis;
  try {
    visual = await extractVisuals(imageBase64, imageType);
  } catch {
    visual = FALLBACK_VISUAL;
  }

  // Stage 2: Caption generation via streaming
  yield { type: "stage", message: "DeepSeek R1 is reasoning your captions..." };
  yield { type: "thinking" };

  const prompt = buildCaptionPrompt(visual, platform, tone);
  const messages = [{ role: "user", content: prompt }];

  // Try streaming with each model
  for (const model of CAPTION_MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEXT_TIMEOUT_MS);

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
          logger.warn({ model, status: r.status }, "Stream model non-OK");
        }
      } catch (fetchErr) {
        logger.warn({ model, fetchErr }, "Stream fetch failed");
      }

      clearTimeout(timer);

      if (!streamResp || !streamResp.body) continue;

      // Read streaming chunks and accumulate full text
      const reader = streamResp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let insideThink = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (!delta) continue;

            accumulated += delta;

            // Detect thinking blocks
            if (accumulated.includes("<think>") && !insideThink) {
              insideThink = true;
            }
            if (accumulated.includes("</think>") && insideThink) {
              insideThink = false;
            }
          } catch {
            // malformed chunk — skip
          }
        }
      }

      if (accumulated.trim()) {
        const captions = parseCaptions(accumulated);
        yield {
          type: "done",
          captions,
          visualAnalysis: {
            scene_description: visual.scene_description,
            mood: visual.mood,
            key_objects: visual.key_objects,
            color_palette: visual.color_palette,
            human_count: visual.human_count,
          },
        };
        return;
      }
    } catch (err) {
      logger.warn({ model, err }, "Streaming model failed, trying next");
    }
  }

  yield { type: "error", message: "All models are heavily loaded. Please try again in a moment." };
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

Strengthen the hook, trim weak hashtags (keep 5-8 best), sharpen the CTA, fix awkward phrasing.

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
