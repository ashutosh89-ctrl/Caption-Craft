import { logger } from "./logger";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenRouter(
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  retries = MAX_RETRIES
): Promise<string> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://captioncraft.replit.app",
          "X-Title": "CaptionCraft",
        },
        body: JSON.stringify({
          model,
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.warn(
          { model, attempt, status: response.status, errText },
          "OpenRouter non-OK response"
        );
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`OpenRouter error ${response.status}: ${errText}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        logger.warn({ model, attempt, json }, "Empty content from OpenRouter");
        if (attempt < retries) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error("Empty response from OpenRouter after retries");
      }

      return content;
    } catch (err) {
      if (attempt < retries) {
        logger.warn({ model, attempt, err }, "OpenRouter call failed, retrying");
        await sleep(RETRY_DELAY_MS * attempt);
      } else {
        throw err;
      }
    }
  }

  throw new Error("OpenRouter: exceeded max retries");
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

export async function extractVisuals(
  imageBase64: string,
  imageType: string
): Promise<VisualAnalysis> {
  const content = await callOpenRouter("meta-llama/llama-4-maverick:free", [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this image and return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "scene_description": "a detailed description of the scene",
  "mood": "the overall mood/feeling",
  "key_objects": ["list", "of", "main", "objects"],
  "color_palette": ["dominant", "colors"],
  "human_count": 0
}`,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${imageType};base64,${imageBase64}`,
          },
        },
      ],
    },
  ]);

  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as VisualAnalysis;
  } catch {
    logger.warn({ cleaned }, "Failed to parse visual analysis JSON");
    return {
      scene_description: cleaned.slice(0, 200),
      mood: "vibrant",
      key_objects: [],
      color_palette: [],
      human_count: 0,
    };
  }
}

export async function generateCaptions(
  visual: VisualAnalysis,
  platform: string,
  tone: string
): Promise<GeneratedCaption[]> {
  const toneInstructions: Record<string, string> = {
    "Desi/Hinglish":
      "Write in smooth Hinglish — a natural blend of Hindi and English that sounds like how young Indians actually talk. No forced translations, no brackets. Keep it organic and relatable.",
    Funny:
      "Write with sharp wit and humor that lands. Include funny observations, unexpected twists, or self-deprecating jokes. Make people laugh out loud.",
    Professional:
      "Write in polished, confident professional English. Authority, insight, and value-driven. LinkedIn-ready. No slang.",
    Savage:
      "Write with bold, unapologetic energy. Clever, cutting, confident — the kind of caption that makes people screenshot it.",
  };

  const toneGuide =
    toneInstructions[tone] ||
    `Write in a ${tone} tone that feels authentic and engaging.`;

  const platformInstructions: Record<string, string> = {
    Instagram:
      "Optimize for Instagram: conversational, visual storytelling, high engagement hook in first line. Up to 2200 chars.",
    LinkedIn:
      "Optimize for LinkedIn: professional insights, personal story with a lesson, thought leadership. Up to 3000 chars.",
    YouTube:
      "Optimize for YouTube description: catchy hook, keywords, value proposition, timestamp hints. Up to 5000 chars.",
  };

  const platformGuide =
    platformInstructions[platform] ||
    `Optimize for ${platform} audience and format.`;

  const prompt = `You are an elite social media strategist for Indian creators. Generate exactly 5 viral captions.

VISUAL CONTEXT:
${JSON.stringify(visual, null, 2)}

PLATFORM: ${platform}
${platformGuide}

TONE: ${tone}
${toneGuide}

REQUIREMENTS for EACH caption:
- Start with a scroll-stopping hook line
- Clean grammar, natural flow
- 5-8 highly relevant contextual hashtags (no generic ones)
- Exactly ONE strong Call-To-Action (CTA)
- Platform-optimized length

Return ONLY a valid JSON array (no markdown, no explanation) with exactly 5 objects:
[
  {
    "text": "the full caption text without hashtags",
    "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
    "cta": "the call to action"
  }
]`;

  const content = await callOpenRouter("deepseek/deepseek-r1:free", [
    { role: "user", content: prompt },
  ]);

  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as GeneratedCaption[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.slice(0, 5);
    }
    throw new Error("Invalid captions array");
  } catch {
    logger.warn({ cleaned: cleaned.slice(0, 500) }, "Failed to parse captions JSON");
    const fallback: GeneratedCaption = {
      text: "Unable to generate caption. Please try again.",
      hashtags: ["#content", "#creator"],
      cta: "Share your thoughts below!",
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
  const prompt = `You are a precision editor for social media captions. Polish and refine this caption to perfection.

ORIGINAL CAPTION:
${captionText}

HASHTAGS: ${hashtags.join(" ")}
CTA: ${cta}
PLATFORM: ${platform}
TONE: ${tone}

Your job:
1. Fix any structural issues or awkward phrasing
2. Strengthen the hook line
3. Trim weak or irrelevant hashtags, keep only the best 5-8
4. Make the CTA sharper and more compelling
5. Ensure the tone is consistent and natural

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "text": "the refined caption text",
  "hashtags": ["best", "hashtags", "only"],
  "cta": "sharpened call to action"
}`;

  const content = await callOpenRouter("meta-llama/llama-4-scout:free", [
    { role: "user", content: prompt },
  ]);

  const cleaned = content
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as GeneratedCaption;
  } catch {
    return { text: captionText, hashtags, cta };
  }
}
