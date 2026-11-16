# TokenWise Architecture Specification

TokenWise is a developer-centric, high-performance LLM Observability & Gateway platform inspired by Helicone. It enables engineering teams to monitor, debug, analyze, and optimize their LLM-powered applications through a unified proxy gateway and analytical dashboard.

---

## 1. System Topology & Core Components

```
                                      +------------------------------------+
                                      |          Client Application        |
                                      |   (OpenAI SDK, LangChain, etc.)    |
                                      +-----------------+------------------+
                                                        |
                                                        |  1. POST /v1/chat/completions
                                                        |     Bearer: tw-sk-... (TokenWise Key)
                                                        |     Header: x-provider-api-key: ...
                                                        v
                                      +------------------------------------+
                                      |       TokenWise Gateway (FastAPI)  |
                                      |  - Key Auth & Tenancy Resolution   |
                                      |  - Request Validation              |
                                      |  - Non-blocking Telemetry Fork     |
+-----------------------------------> |  - Streaming & Non-streaming Proxy |
|                                     +--------+------------------+--------+
|                                              |                  |
| 5. Direct Stream / Response                  | 2. Forward       | 4. Telemetry Event
|    (Low Latency)                             v                  v
|                             +----------------+---+      +-------+--------------------+
|                             |  Upstream Provider |      | Telemetry Queue            |
|                             |  (OpenAI / Anth.)  |      | (Redis / Async In-Memory)  |
|                             +--------------------+      +-------------+--------------+
|                                                                       |
|                                                                       | 6. Consume & Batch
|                                                                       v
|                                                         +-------------+--------------+
|                                                         | Telemetry Background Worker|
|                                                         | - Pricing & Cost Calc      |
|                                                         | - Token Normalization      |
|                                                         | - Request & Content Store  |
|                                                         +-------------+--------------+
|                                                                       |
|                                                                       v
|                                                         +-------------+--------------+
|                                                         | PostgreSQL (SQLAlchemy 2.x)|
|                                                         | - Multi-tenant Schemas     |
|                                                         | - Requests, Metrics, Prompts|
|                                                         +-------------+--------------+
|                                                                       ^
|                                                                       |
|                                     +---------------------------------+------+
|                                     | TokenWise Web Dashboard (Next.js 15)   |
|                                     | - Overview Analytics & Charts          |
|                                     | - Real-time Request Explorer           |
|                                     | - Session & Trace Timelines            |
|                                     | - Prompt Playground & Versioning       |
|                                     +----------------------------------------+
```

---

## 2. Core Subsystems

### A. The LLM Gateway (`apps/api/app/gateway`)
1. **Authentication & Tenancy:**
   - Client sends TokenWise API Key formatted as `tw-live_<prefix>_<random>`.
   - The gateway validates the cryptographic SHA-256 hash against `api_keys` in constant time.
   - Resolves `organization_id` and `application_id`.
2. **Provider Orchestration:**
   - Abstract provider interface (`BaseProvider`) with implementations (`OpenAIProvider`, `AnthropicProvider`).
   - Provider credentials can be supplied via header (`x-provider-api-key`) or tenant provider configuration in vault.
   - Forwards request with configurable read/connect timeouts.
3. **Telemetry Decoupling:**
   - Latency, token usage, prompts, outputs, status codes, and custom headers (`x-tw-session-id`, `x-tw-user-id`, `x-tw-properties-*`) are captured.
   - Telemetry payload is enqueued asynchronously to the durable telemetry buffer.
   - Client response is returned with minimal gateway overhead (<15ms processing latency).

### B. Model Catalog & Dynamic Pricing Synchronization (`apps/api/app/services/catalog_sync.py` & `pricing.py`)
1. **OpenRouter Integration:**
   - OpenRouter acts as primary multi-model routing hub, providing OpenAI-compatible access to 450+ models from OpenAI, Anthropic, Meta, Google, Mistral, Cohere, and more.
   - Preserves model aliases and maps resolved models (e.g. `meta-llama/llama-3.3-70b-instruct`).
2. **Catalog Synchronization:**
   - Synchronizes model registry and detailed token pricing on startup and recurring intervals (default: 24h).
   - Validates pricing ranges, sets version numbers, and preserves pricing history for auditability.
3. **Multi-Tiered Pricing Engine:**
   - Accurately computes costs across standard input, standard output, prompt caching discounts, and reasoning token rates.
   - Seamlessly blends provider-reported native costs (via OpenRouter generation stats) with local dynamic catalog rates.
   - Cost status indicator flags exact calculation, provider reported, or fallback estimates.

### C. Telemetry Ingestion & Persistence (`apps/api/app/services/telemetry.py`)
1. **Idempotency & Decoupled Processing:**
   - Every request has a unique `request_id` (either upstream ID or generated prefix `tw-req-...`).
   - Telemetry payload is enqueued into an asynchronous worker queue (in-memory or Redis-backed).
   - Gateway returns upstream responses to clients with negligible latency overhead (<10ms).
2. **Comprehensive Observability Schema:**
   - Persists requested model, resolved model, streaming flags, prompt and completion tokens, cached input tokens, and reasoning tokens.
   - Retains full conversation messages, system instructions, and completion responses when content capture is enabled.
   - Associates custom user IDs, session workflow timelines, prompt names, versions, and arbitrary metadata tags (`x-tw-property-*`).

### D. Web Application (`apps/web`)
1. **Model Catalog (`/models`):** Interactive searchable, sortable browser for 450+ models across providers with per-million token rates and manual sync triggers.
2. **Interactive Playground (`/playground`):** Test prompts directly against any catalog model with live token estimation and pricing previews.
3. **Request Explorer (`/requests`):** Real-time telemetry log with multi-model filtering, status chips, token breakdown badges, and deep drawer inspection.
4. **Analytics & Sessions (`/`, `/sessions`):** Aggregated cost, token volume, error rates, latency distribution, and end-to-end multi-step workflow tracing.
   - Deduplication prevents double-counting on retries.
2. **Pricing Engine (`apps/api/app/services/pricing.py`):**
   - Model pricing table with input token rate, output token rate, cache read/write rates.
   - Precise decimal financial calculation.
3. **Content Capture Governance:**
   - Per-application setting to enable/disable input/output logging.
   - Segregated `request_content` table allows strict data retention and compliance purges.

### C. Multi-Tenant Relational Storage (`apps/api/app/models`)
- **Tenancy:** All queries and mutations enforce `organization_id` tenancy checks.
- **Entities:**
  - `organizations`
  - `users`
  - `organization_members`
  - `applications`
  - `api_keys` (stores `key_prefix`, `key_hash`, `last_used_at`)
  - `llm_requests` (indexed on `(organization_id, created_at)`, `request_id`, `model`, `status`)
  - `request_content` (separated for payload size and privacy controls)
  - `request_properties` (key-value metadata tags)
  - `sessions` (multi-step workflow groupings)
  - `prompts` and `prompt_versions` (immutable version lineage)

### D. Analytical & Management API (`apps/api/app/api/v1`)
- Structured REST endpoints for Overview Metrics, Time-series aggregations (Request volume, Token usage, Cost over time), Request Table Filtering & Search, Session Tracing, Prompts, and Playground.

### E. Frontend Application (`apps/web`)
- Next.js App Router with TypeScript.
- Warm, developer-first aesthetic adhering to the TokenWise design specification:
  - Warm beige background (`#F5F0E8`, `#EAE1D5`)
  - Accent light/interactive orange (`#F4A261`, `#E98945`, `#D97732`)
  - Contrast black (`#171717`, `#262626`)
  - Clean card borders (`#E3DBD0`), modern sans-serif typography, crisp tabular figures.
- TanStack Table for dense, searchable, filterable telemetry streams.
- Recharts with custom warm-orange themed tooltips and area charts.

---

## 3. Reliability & Security Posture
- **Never Log Secrets:** Headers like `Authorization` and provider keys are scrubbed before storage or serialization.
- **Fail-open vs. Fail-closed:** Gateway returns provider responses cleanly; telemetry ingestion failures are isolated from the critical request path.
- **Resilient Fallback:** Works in production with PostgreSQL and Redis, and supports self-contained local development out-of-the-box.
