# Build notes

## Token Factory / Nemotron observations
- Oct 25: Base URL https://api.tokenfactory.nebius.com/v1/ works with the openai npm package.
- Oct 25: Models used: Nano = nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B, Super = nvidia/nemotron-3-super-120b-a12b, Ultra = nvidia/Nemotron-3-Ultra-550b-a55b, Embed = Qwen/Qwen3-Embedding-8B.
- Oct 25: Nemotron models stream a separate `reasoning` field next to `content`. Reasoning tokens count toward max_tokens, so limits must be generous (1500+) or answers can come back empty.
- Oct 25: Qwen3-Embedding-8B returns 4096 dimensions by default. The `dimensions` parameter works, so we use 512 to keep payloads small.
- Oct 25: The only embedding model listed on Token Factory is Qwen (not an NVIDIA model). Nemotron handles all generation and judging.
- Oct 25: Prices checked in the console: Nano $0.06/$0.24, Super $0.30/$0.90, Ultra $1.00/$3.00 per 1M tokens (in/out). Trial credit: $1.00.
- Friction: model IDs differ in case and format (e.g. NVIDIA-Nemotron-3-Nano vs nemotron-3-super), so they are kept in env vars.
-Oct 25: real /api/judge with Ultra returned verified, score 5, in 1,081 ms on a short example (answers from Super take about 1 to 1.4 s).
-Oct 26: Qwen3-Embedding-8B is the only embedding model listed on Token Factory. Latency for one short text varied from 0.5 s to 13.5 s, 4 parallel calls took about 20 s, and dimensions made no difference. Retrieval now combines vectors with BM25 keyword search, falls back to keywords after 3 s, and skips query embedding for small collections

## Decisions and why
- Session state (chunks, vectors, audit log) lives in the browser, so the server is stateless. This avoids serverless timeouts and makes Purge honest.
- MOCK_AI mode lets us build the UI and flows without spending tokens.
- Redaction is rule-based (regex + label heuristics) and runs on our server first. Only redacted text is ever sent to a model.
- Dollar amounts are not redacted on purpose, so questions about loan figures still work.

## Redaction limits (for the README)
- Names with no label or honorific (for example "Maria Garcia-Lopez" in a plain sentence) are not caught.
- Organizations are only caught after labels like "Employer:" or "Company:".
- Scanned (image-only) PDFs are not supported.

## Bugs / lessons
- Oct 28: Next.js only serves a file named `page.tsx`. A rename to `page-2.tsx` left the build with no `/` route (the route table listed only the API routes). Check the `next build` route table after any move of page files.
- Oct 28: a second copy of `redact.ts` at the repo root was not imported by anything, so the app ran an older `lib/redact.ts` that leaked a spaced IBAN and the Insurance Member ID. Keep one copy, and `npm test` now fails if a known synthetic identifier survives redaction.
- Oct 28: the eval prompts had drifted from the app's prompts, so the eval numbers did not describe the app. All prompts now live in `lib/prompts.ts`.
- Oct 28: text extracted from PDFs has single newlines and no blank lines, so the paragraph-only chunker returned the whole document as one chunk. Oversized paragraphs are now split again.
- Oct 28: loading `.ts` files from plain Node scripts needs Node 22.18 or newer. `next/font/google` fetches fonts at build time, so a build on a restricted network fails unless fonts are self-hosted (relevant if we containerise the app).

## Draft feedback for Nebius / NVIDIA
- Draft, confirm each point against what you saw before submitting.
- Embeddings: Qwen3-Embedding-8B was the only embedding model listed, and it is not an NVIDIA model. An NVIDIA embedding model on Token Factory would make an all-NVIDIA pipeline possible.
- Embedding latency: one short text took 0.5 s to 13.5 s, and 4 parallel calls took about 20 s, which was the slowest step of the whole pipeline. We added keyword search and a timeout fallback so the UI never waits on it.
- Reasoning models: Nemotron streams a separate `reasoning` field next to `content`, and reasoning tokens count toward `max_tokens`, so small limits return empty answers. This was not obvious from the first test. A documented example or a parameter to cap reasoning would help.
- Model IDs differ in case and format (for example `NVIDIA-Nemotron-3-Nano` and `nemotron-3-super`), so we keep them in env vars and list them live.
- Worked well: the OpenAI-compatible API (only `baseURL` changed), the embedding `dimensions` parameter, and the price per call (a full retrieve, answer and judge pass cost well under a cent).
- JSON from the judge: the model sometimes wraps JSON in code fences or adds reasoning text, so we validate with zod and extract from the first `{` to the last `}`.