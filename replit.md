# CaptionCraft — AI Social Media Caption Generator for Indian Creators

CaptionCraft is a full-stack AI-powered tool that scans uploaded images and generates viral, platform-perfect social media captions tailored to Indian creators.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENROUTER_API_KEY` — OpenRouter API key for AI models

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/caption-craft), dark creator dashboard theme
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- AI: OpenRouter API — Llama 4 Maverick (vision) + DeepSeek R1 (captions) + Llama 4 Scout (refinement)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- **OpenAPI spec**: `lib/api-spec/openapi.yaml`
- **DB schema**: `lib/db/src/schema/captions.ts`
- **AI pipeline**: `artifacts/api-server/src/lib/openrouter.ts`
- **Caption routes**: `artifacts/api-server/src/routes/captions.ts`
- **Frontend pages**: `artifacts/caption-craft/src/pages/`
- **Theme**: `artifacts/caption-craft/src/index.css`

## Architecture decisions

- Two-step AI pipeline: Llama 4 Maverick for image vision/analysis → DeepSeek R1 for caption generation + polishing in one shot. Llama 4 Scout used only on manual "Refine" button click.
- Images sent as base64 in JSON body (not multipart) for simplicity with Orval codegen and to avoid multer/streaming complexity.
- All free OpenRouter models with up to 3 retries + exponential backoff for reliability.
- DeepSeek R1 thinking tags (`<think>...</think>`) stripped from responses before JSON parsing.
- Saved captions stored in PostgreSQL. Gallery filterable by platform and tone.

## Product

- Upload an image → get 5 AI-crafted captions (Instagram/LinkedIn/YouTube × Desi/Funny/Professional/Savage)
- Multi-stage loading animation showing which AI model is active
- Copy, refine, or save any caption to gallery
- Gallery with filter by platform/tone and delete capability
- Stats dashboard in gallery showing caption counts by platform and tone

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run codegen after changing `lib/api-spec/openapi.yaml`
- DeepSeek R1 free model may include `<think>` tags in response — these are stripped in `openrouter.ts`
- Base64 images can be large; avoid storing full-res base64 in DB (imagePreviewBase64 is optional/thumbnail)
- The "Desi/Hinglish" tone string has a slash — always use exact string match

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
