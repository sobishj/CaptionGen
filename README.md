# CaptionGen

Social media caption & hashtag generator for small businesses and content creators, with an admin panel for managing the AI models behind it.

Describe a product, offer or idea, pick a platform (Instagram, LinkedIn, Facebook) and a tone, and CaptionGen writes 3–5 ready-to-post drafts with hashtags. Admins choose which AI models do the writing: cloud models such as OpenAI, Claude, Gemini or Groq, or a self-hosted model such as **Qwen** on your own server.

> _Screenshot placeholders: add `docs/screenshot-generator.png` and `docs/screenshot-admin.png`._

## Features

**Generator (public)**
- Description (10–500 characters, live counter), platform, tone (Professional, Friendly, Promotional, Informative), 3/4/5 drafts and an emoji toggle that is off by default for LinkedIn
- **Writer** picker listing the models the admin made available. It is hidden when only one model is available.
- Platform-aware writing:
  - Instagram: hook in the first line and 15–25 hashtags
  - LinkedIn: professional tone, short paragraphs and 3–5 hashtags
  - Facebook: conversational, about 500 characters, 2–5 hashtags
- Result cards: numbered drafts, hashtag chips, character count with a warning above the platform's recommended length, the model that wrote the draft, and **Copy caption / Copy hashtags / Copy all** with a toast
- **Try another** rewrites a single card; **Rewrite all** regenerates the whole set
- **Animated "How it works" demo** in the empty state: a cursor types a description, picks platform and tone, writes and copies a draft. Respects reduced-motion settings and has a pause button.
- Slowly drifting Instagram / Facebook / LinkedIn icons in the background
- Loading skeletons (with a "local models can be slower" hint after 5 s), clickable example prompts, and friendly error states with **Try again**
- Responsive, keyboard accessible, `aria-live` results and toasts

**Admin panel (`/admin`)**
- Email/password sign-in. The **owner** account comes from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` secrets, so you can't lock yourself out, and the owner can add more admins.
- Sessions use signed (HMAC), httpOnly, `SameSite=Strict` cookies that last 8 hours. The cookie is marked Secure on HTTPS.
- Sign-in is rate-limited to 5 attempts per 15 minutes per IP. Cross-site writes are rejected.
- **AI models**:
  - Add, edit and delete models, starting from provider presets (cloud or self-hosted).
  - Each model has its own base URL, API key, model name, temperature, max tokens, timeout, JSON mode and optional extra headers (e.g. a Cloudflare Tunnel or reverse-proxy token).
  - After you enter a key, or a URL for keyless local servers, the provider's model list is **fetched automatically**. You can also type any model name.
  - **Test connection** writes a real sample caption from the unsaved form and shows the reply and latency. Each saved model also has its own **Test** button, and the last result is recorded.
  - **Available to users** toggle, **Make default**, and up/down ordering.
  - **Fallback**: if the chosen model fails (down, busy, timed out or garbled), CaptionGen retries once with the next available model in the list and tells the user which model answered.
- API keys and header values are **encrypted at rest** (AES-GCM, Web Crypto) with `ENCRYPTION_KEY`. They are decrypted only on the server when a request is made, and the browser only ever sees a masked hint such as `sk-••••••••a1b2`.
- **Admin users**: add, edit and remove admins. Changing a password signs that admin out everywhere.
- **Account**: change your own password.

**Robust AI layer**
- Two adapters cover almost everything:
  - the OpenAI-compatible Chat Completions adapter (OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Mistral, DeepInfra, Alibaba Qwen, Cloudflare Workers AI, Ollama, vLLM, LM Studio, llama.cpp…)
  - the Anthropic Messages API adapter
- Asks for strict JSON and parses defensively. It strips `<think>…</think>` reasoning blocks (Qwen, DeepSeek) and code fences, extracts and repairs the JSON, validates it with zod, and retries once with a "JSON only" reminder, so small 7B local models work reliably.
- Hashtags are normalised: a leading `#`, no spaces or punctuation, and no duplicates.
- Provider errors and keys are never shown to visitors. Admins get readable errors such as *"Cannot reach http://10.0.0.5:11434. Check the server is running and reachable from the app."*

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript** (strict), **Tailwind CSS 4**
- **zod** schemas shared by browser and server
- **Cloudflare Workers** via [OpenNext](https://opennext.js.org/cloudflare), with **Workers KV** for admin settings
- **Vitest** (107 tests)
- No external fonts or CDNs: the system font stack plus inline SVG icons

## Architecture

```
Browser (React)                                Server (Next.js routes on Cloudflare Workers)
────────────────                               ──────────────────────────────────────────────────
components/CaptionGenerator ── POST /api/generate ──▶ lib/generate-handler   rate limit, validation, fallback
components/HowItWorksDemo      GET  /api/models  ──▶ lib/model-selection    enabled models → targets
components/admin/*         ── /api/admin/*       ──▶ lib/admin/handler      auth, models, users
                                                       │
lib/schemas.ts  ◀─ shared contracts ─▶                 ├─ lib/caption-service  prompt → LLM → parse → retry
                                                       ├─ lib/llm/             openai.ts · anthropic.ts · catalog.ts
                                                       ├─ lib/admin/models     records, AES-GCM secrets
                                                       ├─ lib/auth · passwords · crypto   (Web Crypto only)
                                                       └─ lib/storage          KV (prod) · memory (tests/Node)
                                                lib/server-env.ts  ◀── the only Cloudflare-specific file
```

### Designed to be easy to change

Each layer depends on a small interface, so one technology can be swapped without touching the rest:

| To change… | Touch only… |
|---|---|
| Which AI models are used | Nothing in code: use **/admin** |
| Support a new kind of AI API | Add an adapter in `src/lib/llm/` implementing `LlmProvider`, and a preset in `src/lib/admin/providers.ts` |
| Storage (D1, Postgres, SQLite, Redis…) | Implement the 2-method `JsonStore` interface in `src/lib/storage.ts` |
| Hosting (Vercel, Node server, Docker) | `src/lib/server-env.ts` (bindings) plus `wrangler.jsonc` / `open-next.config.ts`. Off Cloudflare the app already falls back to `process.env` and in-memory storage. |
| Backend framework (Hono, Express…) | The handlers in `src/lib/*handler.ts` use standard `Request`/`Response`, so mount them anywhere |
| Front-end framework | Components are plain React with no Next.js imports. Point them at another backend with `NEXT_PUBLIC_API_BASE_URL`. |
| Rate limiting (e.g. Cloudflare Rate Limiting binding) | Implement `RateLimiter` in `src/lib/rate-limit.ts` |
| Prompt wording or platform rules | `src/lib/prompt.ts`, `src/lib/platforms.ts` |
| Colours and fonts | Tokens at the top of `src/app/globals.css` |

## Configuration

| Name | Kind | Required | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | secret | yes | Owner password for `/admin` |
| `ADMIN_EMAIL` | var | no (`admin`) | Owner sign-in name: an email or a plain username |
| `ENCRYPTION_KEY` | secret | yes | Encrypts stored API keys. Any long random string: `openssl rand -base64 32`. **Don't change it later**, or saved keys must be re-entered. |
| `SESSION_SECRET` | secret | no | Separate signing key for admin sessions (defaults to `ADMIN_PASSWORD`) |
| `RATE_LIMIT_PER_MINUTE` | var | no (`10`) | Caption requests per visitor IP per minute |
| `SETTINGS` | KV binding | yes on Cloudflare | Stores AI models and admin users |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_LABEL`, `LLM_TIMEOUT_MS`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `LLM_JSON_MODE` | var/secret | no | Optional **built-in model**, used only until a model is added in `/admin`, so the site works straight after deploy |
| `NEXT_PUBLIC_API_BASE_URL` | build var | no | Only if the UI should call a backend on another domain |

See `.dev.vars.example` (Cloudflare and local development) and `.env.example` (plain Node).

## Local development

Requirements: Node.js 20+ (22 recommended).

```bash
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD and ENCRYPTION_KEY
npm run dev                      # http://localhost:3000  (admin: http://localhost:3000/admin)
```

`npm run dev` uses a local, persistent copy of the KV namespace in `.wrangler/`, so models you add survive restarts and never touch production.

To run in the real Workers runtime locally:

```bash
npm run preview                  # http://localhost:8787
```

> Don't run `npm run build` / `npm run preview` while `npm run dev` is running: they share the `.next` folder.

## Deploying to Cloudflare Workers

```bash
npx wrangler login

# 1. Create the settings store, then paste the printed id into wrangler.jsonc
#    (replace REPLACE_WITH_KV_NAMESPACE_ID)
npx wrangler kv namespace create SETTINGS

# 2. Secrets
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ENCRYPTION_KEY      # paste the output of: openssl rand -base64 32
# optional: npx wrangler secret put SESSION_SECRET

# 3. Deploy
npm run deploy
```

Then open `https://<your-worker>.workers.dev/admin`, sign in as `admin` (or your `ADMIN_EMAIL`) and add a model. `GET /api/health` reports `modelsAvailable`.

Optional:
- **Custom domain:** Cloudflare dashboard → Workers & Pages → captiongen → Settings → Domains & Routes.
- **Owner email:** change `ADMIN_EMAIL` under `vars` in `wrangler.jsonc`.
- **Logs:** `npx wrangler tail`, or the dashboard (observability is enabled).
- Admin changes reach every Cloudflare location within about a minute, because KV is eventually consistent.

## Adding AI models in the admin panel

Go to **/admin → AI models → Add model** and pick a provider. The base URL is pre-filled for you.

| Provider | What to enter |
|---|---|
| OpenAI | API key → pick e.g. `gpt-4o-mini` from the fetched list |
| Anthropic Claude | API key → e.g. `claude-haiku-4-5` |
| Google Gemini | API key from Google AI Studio → e.g. `gemini-3.5-flash` or `gemini-3.5-flash-lite` (older 2.x models are closed to new keys) |
| Groq / OpenRouter / DeepSeek / Mistral | API key → pick a model |
| **Qwen, hosted** | *DeepInfra* (`Qwen/Qwen2.5-72B-Instruct`), *Alibaba Cloud Model Studio* (`qwen-plus`), *OpenRouter* (`qwen/qwen-2.5-72b-instruct`) or *Groq* |
| **Qwen, self-hosted** | *Ollama*, *vLLM*, *LM Studio* or *llama.cpp server*. Enter your server's URL; no key is usually needed. The model list loads automatically (e.g. `qwen2.5:7b-instruct` or `Qwen/Qwen2.5-7B-Instruct`). |
| Cloudflare Workers AI | Replace `ACCOUNT_ID` in the URL, use an API token with Workers AI permission, model e.g. `@cf/meta/llama-3.1-8b-instruct` |
| Anything else | *Other OpenAI-compatible server* with any base URL |

Click **Test connection** to generate a sample caption before saving. Use **Make default** and the ↑/↓ arrows to set the order: users get the default model, and the next one in the list is the automatic fallback.

### Self-hosted models and Cloudflare

Cloudflare's servers can't reach `localhost` or private network addresses (`10.x`, `192.168.x`…). To use a Qwen server on your own machine or LAN with the deployed site:

1. Expose it on a public HTTPS URL, for example with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `cloudflared tunnel --url http://localhost:11434`.
2. Protect it. With Cloudflare Access, add the service-token headers (`CF-Access-Client-Id`, `CF-Access-Client-Secret`) under **Advanced options → Extra headers**. They are stored encrypted.
3. Raise the model's **timeout** (up to 300 s) for slower local hardware.

During local development (`npm run dev`), local addresses such as `http://localhost:11434/v1` work directly.

## Tests

```bash
npm test            # 107 tests
npm run typecheck   # TypeScript strict
```

The tests cover:
- request schemas, the prompt builder's platform and tone rules
- JSON parsing and repair (`<think>` blocks, code fences, bare arrays, trailing commas)
- hashtag normalisation
- both provider adapters with `fetch` mocked (success, HTTP errors, 429, network failure, timeout, keyless local server)
- model discovery
- the generation service (retry, emoji stripping, hashtag caps)
- `/api/generate`: success, invalid input, bad AI output, disabled model, fallback, no secret leakage, rate limiting
- AES-GCM round trip and tamper detection, key masking, password hashing, session signing, expiry and invalidation, origin checks
- the admin API: route protection, login rate limiting, encrypted keys that are never returned, keep/remove key on edit, ordering and default, test and discover, admin user management

## API

`POST /api/generate`

```json
{ "description": "Handmade soy candles, lavender scent, launching this Friday",
  "platform": "instagram", "tone": "friendly", "count": 3, "emojis": true, "modelId": "optional" }
```

The response is `{ "model": "Qwen 2.5 7B", "variations": [{ "id", "caption", "hashtags", "model" }], "fallbackFrom"?: "GPT-4o mini" }`.

Errors are returned as `{ "error": { "code", "message" } }`:

| Code | Status |
|---|---|
| `INVALID_INPUT` | 400 |
| `MODEL_NOT_FOUND` | 400 |
| `RATE_LIMITED` | 429 |
| `BAD_OUTPUT` | 502 |
| `MODEL_UNAVAILABLE`, `NOT_CONFIGURED` | 503 |
| `TIMEOUT` | 504 |
| `INTERNAL` | 500 |

`GET /api/models` returns `{ "models": [{ "id", "label", "isDefault" }] }`, with no provider details or keys.

`GET /api/health` returns `{ "status", "modelsAvailable", "storage" }`.

## Out of scope (MVP)

Social account integrations, auto-posting, team collaboration, subscriptions, usage analytics and saved history.
