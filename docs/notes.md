# Build notes

## Token Factory / Nemotron observations
- Oct 25: Base URL https://api.tokenfactory.nebius.com/v1/ works with the openai npm package.
- Oct 25: Models used: Nano = nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B, Super = nvidia/nemotron-3-super-120b-a12b, Ultra = nvidia/Nemotron-3-Ultra-550b-a55b, Embed = Qwen/Qwen3-Embedding-8B.
- Oct 25: Nemotron models stream a separate `reasoning` field next to `content`. Reasoning tokens count toward max_tokens, so limits must be generous (1500+) or answers can come back empty.
- Oct 25: Qwen3-Embedding-8B returns 4096 dimensions by default. The `dimensions` parameter works, so we use 512 to keep payloads small.
- Oct 25: The only embedding model listed on Token Factory is Qwen (not an NVIDIA model). Nemotron handles all generation and judging.
- Oct 25: Prices checked in the console: Nano $0.06/$0.24, Super $0.30/$0.90, Ultra $1.00/$3.00 per 1M tokens (in/out). Trial credit: $1.00.
- Friction: model IDs differ in case and format (e.g. NVIDIA-Nemotron-3-Nano vs nemotron-3-super), so they are kept in env vars.

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
- (add as you go)

## Draft feedback for Nebius / NVIDIA
- (add as you go)