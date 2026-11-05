# Robot planner API

Requires Node 20+ and `express`, `dotenv`. Start with `node server/index.js`.
Copy `.env.example` to `.env` and set `CEREBRAS_API_KEY` to enable live inference.
No key means labeled local demo mode; no provider call is made.

- `GET /api/health`: provider configuration (not a connectivity check), never a secret.
- `POST /api/plan`: JSON `{ "command": "Place the block on the platform" }`.
- Add `"mode":"local"` to explicitly use the local parser even with a key configured.
- Response: `{actions:[{type:"deliver"}],source:"local"|"cerebras",latencyMs,message}`.
- Exactly one action is accepted. Action vocabulary is `deliver`, `stop`, `reset`. The browser owns physical execution.
- Inference errors use non-2xx responses with `error`, `code`, `latencyMs`, `fallbackAvailable:true`. No actions execute implicitly on failure.
- Send command `__test_failure__` to exercise the deliberate 503 outage path without credentials or a real outage.

Requests have a 6-second inference deadline, 300-character command limit, 4-KiB body limit, and eight-request concurrency cap. This is a local MVP, not a publicly authenticated multi-user service. The server binds localhost. Never expose it publicly without authentication and rate limiting.

Default model `qwen-3.8-27b` uses no reasoning for low decision latency. It is configurable with `CEREBRAS_MODEL`; model availability remains account-dependent.
Official reference checked November 5, 2026: https://inference-docs.cerebras.ai/api-reference/chat-completions

Run checks with `node --test server/*.test.js`.

## Side-by-side providers

Set `OPENAI_API_KEY` to enable the OpenAI comparison baseline; `OPENAI_MODEL` defaults to `gpt-4.1`. Restart the server after editing `.env`. No key is created by the app.

`GET /api/health` also returns `providers.cerebras` and `providers.openai`, each with `configured` (key presence only) and `model`. It never exposes credentials.

Submit `{ "command": "Place the block on the platform", "provider": "openai" }` or provider `cerebras` for a real comparison. Explicit providers require their own key and return `503 NOT_CONFIGURED` if absent; they never fall back to local interpretation. Successful responses include `source` and configured `model`. Both use the same command prompt, JSON mode, token cap, action validator, and 15-second deadline. Cerebras disables reasoning on its supported default model; GPT-4.1 is a non-reasoning baseline. No artificial latency is added.

Ordinary single-scene requests without `provider` preserve the existing Cerebras/local behavior and six-second deadline. The shared concurrency limit remains eight in-flight requests.

OpenAI model reference: https://developers.openai.com/api/docs/models/gpt-4.1

## Same-model service-tier profiles

`GET /api/health` includes `profiles`, an allowlisted array with `id`, `label`, `provider`, `model`, `serviceTier`, `configured`, and `accessControlled`.

Use `POST /api/plan` with `{ "command":"Stack all blocks", "profile":"sol-ultrafast" }`. Available profiles:
- `sol-standard`: GPT-5.6 Sol via OpenAI Responses, `service_tier:default`.
- `sol-ultrafast`: the same GPT-5.6 Sol via OpenAI Responses, `service_tier:ultrafast`.
- `cerebras-direct`: existing configured Cerebras model via its Chat Completions API.
- `openai-default`: existing configured OpenAI model via Chat Completions.

The Sol profiles share the same prompt, token limit, `reasoning.effort:none`, and timeout. Both require `OPENAI_API_KEY`. Ultrafast is powered by Cerebras behind the OpenAI API; a direct Cerebras key cannot enable it. Access is restricted and key presence does not prove entitlement.

Responses report `requestedServiceTier`, `actualServiceTier`, and `tierVerified`. A missing or different actual tier is explicitly unverified; clients must not label that result as a verified Ultrafast run. A denied tier produces `TIER_UNAVAILABLE`. No tier fallback is fabricated by this app.

The bounded action vocabulary now includes `stack` to stack all spawned blocks. Model profiles use the same action contract.

Official references checked November 5, 2026:
- https://openai.com/index/previewing-ultrafast/
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://developers.openai.com/api/docs/models/gpt-5.6-sol
