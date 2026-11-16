# TokenWise: Complete Technical Specification & Architectural Guide

Welcome to the definitive architectural and engineering documentation for **TokenWise** — a production-grade, developer-first LLM Observability, Metrics, Dynamic Pricing, and API Gateway platform inspired by Helicone.

This document covers every subsystem, data model, proxy workflow, background worker, API endpoint, frontend view, pricing algorithm, and security mechanism implemented in the codebase.

---

## Table of Contents

1. [Executive Overview & Vision](#1-executive-overview--vision)
2. [High-Level System Topology & Request Lifecycle](#2-high-level-system-topology--request-lifecycle)
3. [Repository Structure & Codebase Map](#3-repository-structure--codebase-map)
4. [Data Layer & Database Models (SQLAlchemy 2.0)](#4-data-layer--database-models-sqlalchemy-20)
5. [The LLM Gateway Proxy Subsystem](#5-the-llm-gateway-proxy-subsystem)
6. [OpenRouter Integration & Multi-Model Routing](#6-openrouter-integration--multi-model-routing)
7. [Dynamic Model Catalog & Pricing Synchronization](#7-dynamic-model-catalog--pricing-synchronization)
8. [Telemetry Ingestion & Durable Background Queue](#8-telemetry-ingestion--durable-background-queue)
9. [Analytics & Aggregation Engine](#9-analytics--aggregation-engine)
10. [Sessions, Workflow Tracing & Prompts](#10-sessions-workflow-tracing--prompts)
11. [REST API Reference & Data Contracts](#11-rest-api-reference--data-contracts)
12. [Frontend Architecture & User Interface](#12-frontend-architecture--user-interface)
13. [Security, Tenancy & Privacy Governance](#13-security-tenancy--privacy-governance)
14. [Local Development, Seeding & Production Deployment](#14-local-development-seeding--production-deployment)
15. [Troubleshooting & Verification Playbook](#15-troubleshooting--verification-playbook)

---

## 1. Executive Overview & Vision

Modern software applications increasingly depend on foundation models (e.g., GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, Llama 3.3). However, communicating directly with diverse model APIs introduces significant engineering challenges:
- **Cost Invisibility:** Engineering teams lack granular, real-time insight into which users, applications, or prompt versions drive token consumption and spend.
- **Provider Fragmentation:** Different providers expose varying pricing tiers (standard input, standard output, prompt caching discounts, and reasoning/thinking tokens) that evolve rapidly.
- **Debugging & Auditing Pain:** When an agent or chat pipeline yields unexpected answers or latency spikes, diagnosing root causes without unified request/response logs and session tracing is tedious.
- **Latency Overhead Risk:** Observability tools must never delay critical LLM completions. A synchronous telemetry call that fails or adds 200ms destroys user experience.

### What TokenWise Delivers:
1. **Drop-in OpenAI-Compatible Gateway (`/v1/chat/completions`):** Change only the base URL and API key in existing client SDKs (OpenAI, LangChain, LlamaIndex, Instructor, LiteLLM) to route traffic through TokenWise.
2. **Minimal Latency Impact (<15ms processing overhead):** Telemetry persistence is decoupled from the critical HTTP response path via non-blocking queues (Redis or bounded memory).
3. **OpenRouter Routing Across 450+ Models:** Single unified credential and endpoint supporting Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, and Cohere.
4. **Dynamic Catalog & Token Pricing Synchronization:** Synchronizes live catalog prices from OpenRouter into database tables, supporting exact versioned cost calculations down to micro-cents ($0.000001).
5. **Multi-Step Session Waterfall Tracing:** Correlates multi-step chains, agent loops, or conversations using `x-tw-session-id` and custom metadata headers (`x-tw-property-*`).
6. **Privacy-First Content Governance:** Fine-grained per-application controls allow toggling message content storage (`content_capture_enabled`) while maintaining aggregate token and financial metrics.
7. **Developer-First Aesthetic:** Warm, high-contrast, minimalist UI built with Next.js 15, Tailwind CSS, TanStack Table, and Recharts.

---

## 2. High-Level System Topology & Request Lifecycle

TokenWise operates across two distinct execution loops:
1. **Critical Path (The Proxy Loop):** Optimized for low latency. Reads headers, authenticates API keys, forwards payloads upstream, and streams or returns responses.
2. **Asynchronous Path (The Telemetry Loop):** Isolated from client latency. Normalizes token counts, resolves model pricing versions, records usage, and updates session lineages.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Client Application                              │
│              (OpenAI Python/TS SDK, LangChain, curl, backend)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 1. POST /v1/chat/completions
                                       │    Authorization: Bearer tw-live_...
                                       │    x-tw-session-id: sess_prod_441
                                       │    x-tw-user-id: usr_99
                                       v
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Gateway Router                              │
│              (apps/api/app/gateway/router.py & deps.py)                     │
│  - Constant-time SHA-256 API key validation (Organization & Application)     │
│  - Upstream provider resolution (OpenRouter / direct OpenAI fallback)       │
│  - Non-blocking telemetry event forking                                     │
└───────────────┬─────────────────────────────────────────────┬───────────────┘
                │                                             │
                │ 2. Forward Request                          │ 4. Non-blocking Enqueue
                v                                             v
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     Upstream LLM Provider     │             │    Telemetry Event Buffer     │
│  (OpenRouter / OpenAI API)    │             │  (Redis List or Async Queue)  │
└───────────────┬───────────────┘             └───────────────┬───────────────┘
                │                                             │
                │ 3. LLM Response                             │ 5. Dequeue & Process
                v                                             v
┌───────────────────────────────┐             ┌───────────────────────────────┐
│   Return to Client (<15ms)    │             │   Telemetry Background Worker │
│  + Headers:                   │             │   (apps/api/app/services/)    │
│    x-tokenwise-request-id     │             │  - Dynamic DB Cost Lookup     │
│    x-tokenwise-latency-ms     │             │  - Exact Decimal Arithmetic   │
│    x-tokenwise-cost-usd       │             │  - Content / Property Store   │
│    x-tokenwise-provider       │             └───────────────┬───────────────┘
└───────────────────────────────┘                             │
                                                              │ 6. Batch / ACID Write
                                                              v
                                              ┌───────────────────────────────┐
                                              │   Relational Database         │
                                              │   (PostgreSQL 16 / SQLite)    │
                                              └───────────────▲───────────────┘
                                                              │
                                                              │ 7. Query Analytics
                                                              │
                                              ┌───────────────┴───────────────┐
                                              │    TokenWise Web Dashboard    │
                                              │    (Next.js 15 App Router)    │
                                              └───────────────────────────────┘
```

---

## 3. Repository Structure & Codebase Map

TokenWise is organized as a clean full-stack monorepo with isolated concerns:

```
Tokenwise/
├── apps/
│   ├── api/                          # FastAPI Backend, Gateway & Workers
│   │   ├── alembic/                  # Database migration scripts
│   │   ├── app/
│   │   │   ├── api/                  # REST API Endpoints (v1)
│   │   │   │   ├── deps.py           # Dependency injection (Auth, Tenancy, Gateway)
│   │   │   │   └── v1/
│   │   │   │       ├── analytics.py  # Overview KPIs, timelines, distribution
│   │   │   │       ├── api_keys.py   # TokenWise API key generation & revocation
│   │   │   │       ├── applications.py # Tenancy apps & environment configs
│   │   │   │       ├── auth.py       # JWT Signup, Login, Profile
│   │   │   │       ├── models.py     # Catalog browser & manual sync triggers
│   │   │   │       ├── organizations.py # Org management & invitations
│   │   │   │       ├── playground.py # Interactive model testing endpoint
│   │   │   │       ├── prompts.py    # Immutable prompt versioning
│   │   │   │       ├── requests.py   # Telemetry explorer & request details
│   │   │   │       └── sessions.py   # Multi-step session waterfall tracing
│   │   │   ├── core/
│   │   │   │   ├── config.py         # Pydantic Settings & environment variables
│   │   │   │   └── security.py       # Password hashing, JWT, API Key SHA-256
│   │   │   ├── db/
│   │   │   │   └── session.py        # SQLAlchemy AsyncSession & engine factory
│   │   │   ├── gateway/
│   │   │   │   └── router.py         # OpenAI-compatible /v1/chat/completions proxy
│   │   │   ├── models/
│   │   │   │   └── __init__.py       # SQLAlchemy 2.0 ORM Declarative Models
│   │   │   ├── providers/
│   │   │   │   ├── base.py           # BaseProvider abstract interface
│   │   │   │   ├── openai.py         # Direct OpenAI upstream provider
│   │   │   │   └── openrouter.py     # OpenRouter multi-model provider adapter
│   │   │   ├── schemas/
│   │   │   │   └── __init__.py       # Pydantic request/response validation schemas
│   │   │   ├── services/
│   │   │   │   ├── catalog_sync.py   # OpenRouter model & pricing sync worker
│   │   │   │   ├── pricing.py        # Dynamic pricing engine (DB + fallback)
│   │   │   │   └── telemetry.py      # Background telemetry ingestion queue
│   │   │   └── main.py               # FastAPI application lifecycle & router mounting
│   │   ├── scripts/
│   │   │   └── seed_demo_data.py     # Database seeder with realistic telemetry
│   │   ├── tests/                    # Pytest test suites (Gateway, isolation, pricing)
│   │   ├── Dockerfile                # Production container for API
│   │   └── requirements.txt          # Python dependencies
│   │
│   └── web/                          # Next.js 15 Web Dashboard
│       ├── app/
│       │   ├── layout.tsx            # Global Root Layout & font setup
│       │   ├── page.tsx              # Overview Dashboard (KPIs, Charts)
│       │   ├── login/                # Authentication page (Sign in / Sign up)
│       │   ├── models/               # Model Catalog browser & sync UI
│       │   ├── playground/           # Interactive LLM testing playground
│       │   ├── prompts/              # Prompt registry & version lineage
│       │   ├── requests/             # Request Explorer & slide-out drawer
│       │   ├── sessions/             # Sessions list & trace waterfalls
│       │   └── settings/             # API Keys, Apps, and Org settings
│       ├── components/
│       │   └── layout/
│       │       ├── header.tsx        # Top navigation, status indicator, org info
│       │       └── sidebar.tsx       # Main navigation sidebar with active badges
│       ├── lib/
│       │   ├── api.ts                # TypeScript Typed API Client
│       │   └── auth-context.tsx      # React Context for session management
│       ├── types/
│       │   └── index.ts              # Frontend TypeScript Interfaces
│       ├── package.json              # Node dependencies (Next 15, Recharts, Lucide)
│       └── Dockerfile                # Production container for frontend
│
├── docs/                             # Engineering Documentation
│   ├── architecture.md               # Architecture design document
│   ├── implementation-plan.md        # Feature tracking & plan
│   └── TOKENWISE_COMPLETE_GUIDE.md   # This comprehensive guide
├── docker-compose.yml                # Multi-container orchestration
├── .env.example                      # Reference environment configuration
└── README.md                         # Project landing documentation
```

---

## 4. Data Layer & Database Models (SQLAlchemy 2.0)

All database entities are built using modern SQLAlchemy 2.0 `Mapped` and `mapped_column` type annotations. The schema enforces **strict multi-tenancy** across all tables, ensuring complete data isolation between organizations.

### Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : "has"
    USERS ||--o{ ORGANIZATION_MEMBERS : "belongs to"
    ORGANIZATIONS ||--o{ APPLICATIONS : "owns"
    ORGANIZATIONS ||--o{ API_KEYS : "issues"
    APPLICATIONS ||--o{ API_KEYS : "scoped to"
    ORGANIZATIONS ||--o{ LLM_REQUESTS : "records"
    APPLICATIONS ||--o{ LLM_REQUESTS : "groups"
    LLM_REQUESTS ||--o| REQUEST_CONTENT : "stores payload"
    LLM_REQUESTS ||--o{ REQUEST_PROPERTIES : "tags"
    ORGANIZATIONS ||--o{ SESSIONS : "tracks"
    ORGANIZATIONS ||--o{ PROMPTS : "manages"
    PROMPTS ||--o{ PROMPT_VERSIONS : "versions"
    MODELS ||--o{ MODEL_PRICINGS : "versions pricing"
    MODEL_SYNC_RUNS ||--o{ MODELS : "discovers"
```

### Table Definitions & Column Specifications

#### 1. `organizations`
Represents an isolated tenant space (e.g. company or team).
- `id` (String(36), PK): UUID v4 identifier.
- `name` (String(255), Not Null): Human-readable organization name.
- `slug` (String(255), Unique, Indexed): URL-safe slug for multi-tenant routing.
- `created_at` / `updated_at` (DateTime with UTC timezone).

#### 2. `users` & `organization_members`
Handles identity and multi-tenant Role-Based Access Control (RBAC).
- `users`: Stores `email` (unique index), `hashed_password` (bcrypt/passlib), and `full_name`.
- `organization_members`: Junction table connecting `organization_id` and `user_id`. Supports `role` (`owner`, `admin`, `member`). Unique constraint on `(organization_id, user_id)`.

#### 3. `applications`
Logical environments or services within an organization (e.g. "Customer Support Bot - Production", "Internal Copilot - Dev").
- `id` (String(36), PK): UUID v4.
- `organization_id` (String(36), FK): Organization owner.
- `name` (String(255)): Name of the application.
- `environment` (String(50)): `production`, `staging`, `development`.
- `content_capture_enabled` (Boolean, Default True): Governs whether request/response payloads are stored in `request_content`. If `False`, only token counts and latency metrics are retained.

#### 4. `api_keys`
High-entropy credentials issued to client applications to authenticate with the TokenWise Gateway.
- `id` (String(36), PK): UUID v4.
- `organization_id` / `application_id` (String(36), FK): Tenancy bindings.
- `name` (String(255)): Descriptive label (e.g., "prod-backend-cluster").
- `key_prefix` (String(32)): First 8 characters of the secret key (e.g., `tw-live_a8f9`). Displayed in dashboard tables.
- `key_hash` (String(128), Unique, Indexed): SHA-256 cryptographic digest of the raw key. Raw keys are never persisted.
- `last_used_at` (DateTime, Nullable): Timestamp of the most recent gateway invocation.
- `revoked_at` (DateTime, Nullable): Revocation timestamp for instant invalidation.

#### 5. `llm_requests`
The core telemetry repository. Every completion proxied through the gateway records a row here.
- `id` (String(36), PK): Internal UUID v4.
- `request_id` (String(128), Unique, Indexed): Client or upstream ID (e.g., `tw-req-c8d10b71f92e4ab7` or `gen-abc123`).
- `organization_id` / `application_id`: Tenancy identifiers.
- `provider` (String(50)): `openrouter`, `openai`, `anthropic`, or `simulated`.
- `model` (String(100), Indexed): Requested model ID (e.g., `meta-llama/llama-3.3-70b-instruct`).
- `resolved_model` (String(100), Nullable): The exact upstream model or routing target resolved by OpenRouter.
- `is_streaming` (Boolean, Default False): Indicates if the call used Server-Sent Events (SSE).
- `user_id` (String(128), Nullable, Indexed): External end-user ID passed via `x-tw-user-id` header or payload `user`.
- `session_id` (String(128), Nullable, Indexed): Multi-step workflow identifier from `x-tw-session-id`.
- `prompt_name` / `prompt_version`: Associated prompt lineage metadata.
- `input_tokens` / `output_tokens` / `total_tokens` (Integer): Standard usage counts.
- `cached_input_tokens` (Integer, Default 0): Number of prompt tokens served from provider cache (e.g., Claude prompt caching or OpenAI cache read).
- `reasoning_tokens` (Integer, Default 0): Output tokens spent on chain-of-thought/thinking (e.g., OpenAI o1/o3, DeepSeek R1).
- `estimated_cost` (Float, Default 0.0): Calculated USD cost based on catalog pricing.
- `provider_reported_cost` (Float, Nullable): Raw cost reported by upstream provider when available.
- `cost_status` (String(50)): `exact_usage_reported`, `provider_reported`, `estimated`, `unavailable`, `recalculation_required`.
- `pricing_version_id` (String(36), Nullable): Foreign reference to the exact `model_pricings.id` used for auditing.
- `latency_ms` (Float): Total roundtrip gateway latency in milliseconds.
- `status` (String(50), Indexed): `success` or `error`.
- `error_type` (String(255), Nullable): Normalized error code (e.g., `rate_limit_exceeded`, `insufficient_quota`).
- `started_at` / `completed_at` / `created_at` (DateTime with UTC timezone).
- **Compound Indexes:** `(organization_id, created_at)`, `(organization_id, model)`, `(organization_id, status)`.

#### 6. `models` & `model_pricings` (Dynamic Catalog)
- `models`: Canonical model definitions.
  - `id` (String(128), PK): E.g. `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`.
  - `name`, `provider_name`, `description`, `context_length`, `modalities`.
  - `is_active` (Boolean), `raw_metadata` (JSON), `last_synced_at`.
- `model_pricings`: Immutable, versioned pricing snapshots.
  - `id` (String(36), PK): UUID v4.
  - `model_id` (String(128), FK): Foreign key to `models.id`.
  - `version` (Integer, Default 1): Incremental pricing revision.
  - `is_active` (Boolean): Flag indicating the currently effective pricing schedule.
  - `input_price_per_million` (Float): USD cost per 1M prompt tokens.
  - `output_price_per_million` (Float): USD cost per 1M completion tokens.
  - `cached_input_price_per_million` (Float, Nullable): Discounted rate for cached input tokens.
  - `reasoning_price_per_million` (Float, Nullable): Rate for reasoning tokens.
  - `request_flat_price` (Float, Nullable): Per-call surcharge.
  - `pricing_source`: `openrouter_catalog`, `official_provider`, `manual_override`.
  - `validation_status`: `valid`, `incomplete`, `malformed`.

#### 7. `request_content`
Segregated table storing full message inputs and model outputs.
- `id` (String(36), PK): UUID v4.
- `request_id` (String(128), Unique FK to `llm_requests.request_id`, On Delete Cascade).
- `input_content` (Text, Nullable): Serialized JSON array of prompt messages.
- `output_content` (Text, Nullable): Serialized JSON array of choices/completions.
- *Why segregated?* Prevents table bloating in `llm_requests` for high-throughput metric queries and allows compliance routines to truncate message text while preserving financial and token counters.

#### 8. `request_properties`
Arbitrary metadata tags attached to any request via `x-tw-property-<key>: <value>` HTTP headers.
- `id` (String(36), PK).
- `request_id` (String(128), FK).
- `key` (String(128), Indexed), `value` (String(512)).
- Indexed on `(organization_id, key, value)` for fast faceted filtering.

#### 9. `sessions`
Groups individual requests into higher-level workflows (e.g. conversational turns, agent trajectories).
- `id` (String(36), PK).
- `external_session_id` (String(128), Indexed): User-defined ID from `x-tw-session-id`.
- `user_id` (String(128), Nullable).
- Unique constraint on `(organization_id, external_session_id)`.

#### 10. `prompts` & `prompt_versions`
Collaborative prompt engineering registry.
- `prompts`: `name`, `description`, `organization_id`.
- `prompt_versions`: Immutable versions (`version = 1, 2, ...`), containing the raw `template`, default `model`, and hyperparameters (`temperature`, `top_p`).

---

## 5. The LLM Gateway Proxy Subsystem

The gateway resides in `apps/api/app/gateway/router.py` and implements an **OpenAI-compatible chat completions interface** mounted at both `/v1/chat/completions` and `/chat/completions`.

### Authentication & Tenant Resolution (`app/api/deps.py`)
When a request enters the gateway:
1. The dependency `get_gateway_context` inspects headers:
   - `Authorization: Bearer tw-live_<prefix>_<secret>` or `x-tokenwise-api-key: tw-live_...`
2. Validates that the key begins with the mandated `tw-live_` prefix.
3. Computes the SHA-256 hash:
   ```python
   hash_val = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
   ```
4. Executes a single optimized SQL join:
   ```python
   select(ApiKey, Application, Organization)\
       .join(Application, Application.id == ApiKey.application_id)\
       .join(Organization, Organization.id == ApiKey.organization_id)\
       .where(ApiKey.key_hash == computed_hash, ApiKey.revoked_at.is_(None))
   ```
5. If found, updates `last_used_at` asynchronously and returns a `GatewayContext` carrying the resolved tenant entities.

### Header Extraction
The gateway extracts contextual metadata from the request:
| Header | Description | Target Column |
|---|---|---|
| `x-provider-api-key` | Optional direct upstream key override | Upstream provider auth |
| `x-tw-session-id` | Multi-step workflow or session correlation ID | `llm_requests.session_id` |
| `x-tw-user-id` | External end-user ID | `llm_requests.user_id` |
| `x-tw-prompt-name` | Associated registered prompt name | `llm_requests.prompt_name` |
| `x-tw-prompt-version` | Associated registered prompt version | `llm_requests.prompt_version` |
| `x-tw-property-<key>` | Arbitrary metadata tag (e.g. `x-tw-property-env: prod`) | `request_properties` table |

### Provider Resolution Logic
The gateway resolves the upstream execution target in `_resolve_provider(model, explicit_key)`:
1. **Primary Route:** If `OPENROUTER_API_KEY` is configured in the environment, all requests route via `openrouter_provider` (`https://openrouter.ai/api/v1`).
2. **Explicit Upstream Key:** If the caller provides `x-provider-api-key: sk-...` in the request, traffic routes directly to `openai_provider`.
3. **OpenAI Fallback:** If `OPENAI_API_KEY` is configured, OpenAI models route to OpenAI.
4. **Development Simulation:** In `development` mode when no upstream provider keys are present, the gateway automatically falls back to an intelligent mock responder. It calculates approximate token lengths and produces valid OpenAI-formatted responses so UI workflows and tests function seamlessly out-of-the-box.

### Response Telemetry Headers
Every response returned by TokenWise includes correlation headers:
- `x-tokenwise-request-id`: Unique telemetry identifier.
- `x-tokenwise-latency-ms`: Roundtrip upstream latency in milliseconds.
- `x-tokenwise-cost-usd`: Calculated micro-dollar cost.
- `x-tokenwise-provider`: Target upstream provider (`openrouter` / `openai`).
- `x-tokenwise-model`: Model executed.

---

## 6. OpenRouter Integration & Multi-Model Routing

TokenWise leverages OpenRouter as its unified upstream aggregator. This eliminates the need for separate client libraries for Anthropic, Google Gemini, Meta, and OpenAI.

### Adapter Implementation (`apps/api/app/providers/openrouter.py`)
The `OpenRouterProvider` class manages communication with OpenRouter:
- **Upstream Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`
- **Catalog Endpoint:** `GET https://openrouter.ai/api/v1/models`
- **Attribution Headers:** Every request includes `HTTP-Referer` (`https://tokenwise.ai`) and `X-Title` (`TokenWise Observability`).
- **Configurable Timeouts:** Default 120 seconds (`OPENROUTER_TIMEOUT_SECONDS`) accommodating deep reasoning models (e.g., `o1`, `deepseek-r1`).

### Telemetry & Usage Extraction
OpenRouter returns extended usage objects that TokenWise parses:
```json
{
  "usage": {
    "prompt_tokens": 1200,
    "completion_tokens": 350,
    "total_tokens": 1550,
    "prompt_tokens_details": {
      "cached_tokens": 800
    },
    "completion_tokens_details": {
      "reasoning_tokens": 150
    },
    "cost": 0.00342
  },
  "model": "anthropic/claude-3.5-sonnet:beta"
}
```
TokenWise normalizes:
- `input_tokens = prompt_tokens`
- `output_tokens = completion_tokens`
- `cached_input_tokens = prompt_tokens_details.cached_tokens`
- `reasoning_tokens = completion_tokens_details.reasoning_tokens`
- `provider_cost = usage.cost` (preferred when present)
- `resolved_model = response["model"]` (captures dynamic routing targets)

---

## 7. Dynamic Model Catalog & Pricing Synchronization

To maintain exact cost calculations as providers continuously adjust rates, TokenWise features an automated synchronization engine in `apps/api/app/services/catalog_sync.py` and `pricing.py`.

### Synchronization Workflow

```mermaid
sequenceDiagram
    autonumber
    participant Worker as Background Sync Task
    participant OR as OpenRouter API (/api/v1/models)
    participant DB as TokenWise Database
    
    Worker->>OR: GET /api/v1/models
    OR-->>Worker: 450+ Model Objects with raw pricing
    Worker->>DB: Begin Transaction
    loop For Each Model
        Worker->>Worker: Normalize pricing to Per-Million Tokens (PPM)
        Worker->>Worker: Validate pricing (valid / incomplete / malformed)
        Worker->>DB: Upsert into models table
        alt Price Changed or New Model
            Worker->>DB: Deactivate previous ModelPricing (is_active = False)
            Worker->>DB: Insert new ModelPricing (version = N + 1, is_active = True)
        end
    end
    Worker->>DB: Record ModelSyncRun (stats, duration, failures)
    Worker->>DB: Commit Transaction
```

### Price Normalization
OpenRouter returns pricing per individual token (e.g. `0.000003` USD). TokenWise converts these to standardized **Price Per Million (PPM)** tokens:
$$\text{PricePerMillion} = \text{PricePerToken} \times 1,000,000$$
This preserves high numerical precision without sub-penny rounding loss.

### Validation States
Each pricing record is tagged with a validation status:
- `valid`: Both prompt and completion prices are present and non-negative.
- `incomplete`: One or both rates are missing or zero.
- `malformed`: Rates contain negative numbers or invalid values.

### The Dynamic Pricing Calculation Engine (`apps/api/app/services/pricing.py`)
Cost calculation uses exact Python `Decimal` arithmetic:
$$\text{Cost} = \left(\frac{I \times P_I}{10^6}\right) + \left(\frac{O \times P_O}{10^6}\right) + \left(\frac{C \times P_C}{10^6}\right) + \left(\frac{R \times P_R}{10^6}\right) + F$$
Where:
- $I$: Standard (uncached) input tokens
- $P_I$: Input price per million
- $O$: Standard output tokens
- $P_O$: Output price per million
- $C$: Cached input tokens
- $P_C$: Cached input price per million (if null, falls back to $P_I$)
- $R$: Reasoning tokens
- $P_R$: Reasoning price per million (if null, falls back to $P_O$)
- $F$: Request flat fee

If the database lookup cannot find a matching model, the system gracefully falls back to a built-in static reference table (`FALLBACK_PRICING`) covering major models across OpenAI, Anthropic, Google, and Meta.

---

## 8. Telemetry Ingestion & Durable Background Queue

Telemetry ingestion is designed to be completely **non-blocking** to ensure zero gateway latency degradation.

### Architecture (`apps/api/app/services/telemetry.py`)
1. **Queue Buffer:**
   - **Distributed Mode:** If `REDIS_URL` is set, events are pushed to Redis list `tokenwise:telemetry:events` using `RPUSH`.
   - **Standalone Mode:** Uses a bounded in-memory `asyncio.Queue(maxsize=10000)`.
2. **Non-blocking Enqueue:**
   The gateway calls `await telemetry_service.enqueue(event)`. If the memory queue reaches full capacity under catastrophic load, events drop cleanly with logged warnings rather than causing gateway backpressure.
3. **Background Worker Loop:**
   An asynchronous loop continuously executes `_dequeue()` and `_persist_telemetry_event(event)`:
   - Validates existence of the parent session and creates one if missing.
   - Inserts the `llm_requests` record with all token, latency, and cost fields.
   - If `content_capture_enabled` is active, writes prompt and completion payloads to `request_content`.
   - Writes all `x-tw-property-*` tags to `request_properties`.
   - Commits the transaction.

---

## 9. Analytics & Aggregation Engine

The analytics subsystem (`apps/api/app/api/v1/analytics.py`) powers the dashboard charts and KPI summary cards. All queries enforce strict tenant boundary filtering (`where organization_id == current_org.id`).

### Time Ranges
All analytical endpoints accept a `time_range` query parameter:
- `24h`: Cutoff 24 hours ago.
- `7d` (Default): Cutoff 7 days ago.
- `30d`: Cutoff 30 days ago.
- `all`: No date cutoff.

### Analytical Endpoints & Calculations
1. **`/api/v1/analytics/overview` (KPIs):**
   Computes aggregated metrics in a single SQL query:
   - `total_requests`: `COUNT(id)`
   - `total_cost`: `SUM(estimated_cost)`
   - `total_tokens`: `SUM(total_tokens)` (with `input_tokens` and `output_tokens`)
   - `avg_latency`: `AVG(latency_ms)`
   - `error_rate`: `(COUNT(status == 'error') / total_requests) * 100`
2. **`/api/v1/analytics/volume` (Request Volume Timeline):**
   Groups request counts by timestamp intervals (hourly for 24h, daily for 7d/30d), separated by success and error status.
3. **`/api/v1/analytics/costs` (Cost Timeline):**
   Aggregates total USD cost per interval over the selected window.
4. **`/api/v1/analytics/tokens` (Token Volume Timeline):**
   Computes stacked token volume over time, breaking down input tokens vs. output tokens.
5. **`/api/v1/analytics/models` (Model Distribution Share):**
   Aggregates request count, total tokens, and total cost grouped by `model`. Computes `percentage` share for donut/pie charts.

---

## 10. Sessions, Workflow Tracing & Prompts

### Session Waterfall Tracing (`apps/api/app/api/v1/sessions.py`)
Modern AI applications execute multi-step chains (e.g. prompt rewrite $\rightarrow$ retrieval $\rightarrow$ synthesis $\rightarrow$ evaluation). By passing `x-tw-session-id: <id>` in each call, TokenWise links these executions into a unified session trace.

The session detail view provides:
- Aggregate duration, total cost, and total tokens across the entire session.
- A chronological step-by-step waterfall diagram displaying each step's latency, model, token counts, and cost.
- Direct click-through into each step's detailed request drawer.

### Prompt Registry & Version Lineage (`apps/api/app/api/v1/prompts.py`)
TokenWise enables teams to version and track prompt templates:
- **Immutable Versions:** Creating a new version increments the version counter (`v1`, `v2`, `v3`). Previous versions cannot be overwritten.
- **Production Correlation:** Tagging requests with `x-tw-prompt-name: summary_v2` links live production telemetry back to the prompt template.
- **Playground Export:** Prompts tested in the playground can be saved as new versions directly from the UI.

---

## 11. REST API Reference & Data Contracts

All endpoints (except the Gateway) are mounted under `/api/v1` and require `Authorization: Bearer <jwt_token>`.

### Summary of REST Endpoints

| Category | Method | Path | Description |
|---|---|---|---|
| **Health** | `GET` | `/health` | Service health, DB connectivity & telemetry queue metrics |
| **Gateway** | `POST` | `/v1/chat/completions` | OpenAI-compatible Gateway Proxy |
| **Auth** | `POST` | `/api/v1/auth/signup` | Register new user and auto-create organization |
| | `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT token |
| | `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |
| **Organizations** | `GET` | `/api/v1/organizations/current` | Get active tenant organization |
| **Applications** | `GET` | `/api/v1/applications/` | List applications within the organization |
| | `POST` | `/api/v1/applications/` | Create application (set name, env, content toggle) |
| **API Keys** | `GET` | `/api/v1/api-keys/` | List issued API keys (shows prefix only) |
| | `POST` | `/api/v1/api-keys/` | Generate new `tw-live_` key (revealed once) |
| | `DELETE` | `/api/v1/api-keys/{id}` | Revoke an API key immediately |
| **Requests** | `GET` | `/api/v1/requests/` | Paginated, filterable telemetry request stream |
| | `GET` | `/api/v1/requests/{id}` | Deep inspection of single request (with payloads) |
| **Analytics** | `GET` | `/api/v1/analytics/overview` | Summary KPI metrics card data |
| | `GET` | `/api/v1/analytics/volume` | Request volume time-series |
| | `GET` | `/api/v1/analytics/costs` | Spend time-series |
| | `GET` | `/api/v1/analytics/tokens` | Token volume time-series |
| | `GET` | `/api/v1/analytics/models` | Model usage distribution breakdown |
| **Sessions** | `GET` | `/api/v1/sessions/` | List correlated multi-step sessions |
| | `GET` | `/api/v1/sessions/{id}` | Get session details and chronological waterfall |
| **Models** | `GET` | `/api/v1/models/` | Searchable, paginated model catalog browser |
| | `GET` | `/api/v1/models/{id}/pricing` | Retrieve active pricing schedule for a model |
| | `POST` | `/api/v1/models/sync` | Manually trigger catalog sync from OpenRouter |
| | `GET` | `/api/v1/models/providers` | List model providers and their model counts |
| **Prompts** | `GET` | `/api/v1/prompts/` | List prompt templates |
| | `POST` | `/api/v1/prompts/` | Create new prompt with initial version (v1) |
| | `GET` | `/api/v1/prompts/{id}/versions` | List all historical versions of a prompt |
| | `POST` | `/api/v1/prompts/{id}/versions` | Append an immutable new version |
| **Playground** | `POST` | `/api/v1/playground/run` | Execute ad-hoc prompt with live token & cost preview |

---

## 12. Frontend Architecture & User Interface

The TokenWise web application (`apps/web`) is built with **Next.js 15 (App Router)** and TypeScript.

### Visual Design System
TokenWise adheres to a bespoke, warm minimalist developer design language:
- **Backgrounds:** Warm beige surfaces (`#F5F0E8` canvas, `#FFFFFF` cards, `#EAE1D5` hover states).
- **Accents:** Warm orange hues (`#F4A261` brand, `#E98945` hover, `#D97732` active).
- **Typography:** High-contrast charcoal/black (`#171717` primary, `#525252` muted secondary).
- **Borders & Dividers:** Soft, crisp sand borders (`#E3DBD0`).
- **Data Display:** Monospace / tabular numerals for cost figures, latency values, and token counts.

### Key Screens & Components

#### 1. Overview Dashboard (`apps/web/app/page.tsx`)
- **Metric Cards:** 5 real-time KPI cards (Total Requests, Total Cost, Total Tokens with Input/Output split, Average Latency, Error Rate).
- **Time Range Selector:** `24h`, `7d`, `30d`, and `All Time` filters that update all charts simultaneously.
- **Area & Bar Charts (Recharts):**
  - Request Volume (split by Success vs. Error).
  - Spend over time (USD).
  - Stacked token usage (Input vs. Output).
  - Model distribution breakdown.
- **Quick-Start Onboarding Banner:** Displays clear curl/Python setup snippets when zero requests have been recorded.

#### 2. Request Explorer (`apps/web/app/requests/page.tsx`)
- **Filterable Telemetry Table:** Dense table displaying Request ID, Time, Model, Status, Latency, Token counts, Cost, and User ID.
- **Faceted Filters:** Filter by model, status (`success` / `error`), time range, and full-text search across IDs and users.
- **Slide-out Inspection Drawer:**
  - Full request metadata overview (Session ID, User ID, Pricing status, API key prefix).
  - Token and Cost breakdown pill badges.
  - Interactive formatted JSON view of prompt messages and model response choices.
  - Custom properties tags table.

#### 3. Model Catalog & Pricing (`apps/web/app/models/page.tsx`)
- Interactive browser displaying 450+ models synced from OpenRouter.
- Search by model name or ID (e.g. `claude-3.5-sonnet`, `llama-3.3-70b`).
- Filter by provider (OpenAI, Anthropic, Meta, Google, Mistral, etc.).
- Displays per-million token rates: Input Price, Output Price, Cached Input Price, and Reasoning Price.
- **Sync Catalog Button:** Triggers an on-demand OpenRouter pricing sync with a live progress indicator.

#### 4. Interactive Playground (`apps/web/app/playground/page.tsx`)
- Testbed for evaluating models before deploying to production.
- Model selector connected directly to the synced catalog.
- System prompt and user message inputs.
- Hyperparameter controls (Temperature, Max Output Tokens).
- Real-time execution displaying latency, token breakdown, and exact cost calculation.
- **"Save as Prompt"** button to commit tested configurations into the prompt registry.

#### 5. Sessions Tracing (`apps/web/app/sessions/page.tsx`)
- Lists multi-step user workflows grouped by `session_id`.
- Shows aggregated session duration, total token volume, and combined cost.
- Chronological step sequence waterfall showing each sub-call within the workflow.

#### 6. Settings & Key Vault (`apps/web/app/settings/page.tsx`)
- Application management (name, environment, content capture toggle).
- API Key issuance modal displaying raw `tw-live_...` secrets (shown strictly once).
- Revocation controls for active API keys.

---

## 13. Security, Tenancy & Privacy Governance

### 1. Multi-Tenant Data Isolation
Every API query explicitly scopes to `organization_id`:
```python
query = select(LLMRequest).where(LLMRequest.organization_id == current_org.id)
```
Cross-organization data access is prevented at the database and dependency injection layers. Automated tests (`tests/test_gateway_and_isolation.py`) continuously verify that Org A cannot view or manipulate requests belonging to Org B.

### 2. High-Entropy API Keys & Zero Secret Logging
- Keys are generated with 32 bytes of cryptographic randomness:
  `tw-live_<prefix>_<random>`
- Only the SHA-256 hash is saved in the database.
- The gateway scrubs all authorization headers and provider keys before recording telemetry. Sensitive credentials are never logged or stored in database tables.

### 3. Content Capture Governance
For organizations handling sensitive or regulated data (e.g. PII, HIPAA, financial data), applications provide a `content_capture_enabled` boolean switch:
- When `True`: Full message input and output JSON strings are persisted to `request_content`.
- When `False`: `request_content` is skipped entirely. Only token counts, latency metrics, and costs are stored, guaranteeing full observability without persisting user message text.

---

## 14. Local Development, Seeding & Production Deployment

### Option A: Local Development (Without Docker)

#### 1. Backend Setup
```bash
cd apps/api

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp ../../.env.example .env
# Edit .env to set your OPENROUTER_API_KEY (optional, gateway will simulate if empty)

# Run migrations / start API server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Seed Realistic Telemetry Data (Optional)
```bash
cd apps/api
PYTHONPATH=. python scripts/seed_demo_data.py
```
This populates the local SQLite/PostgreSQL database with:
- Demo User: `admin@tokenwise.ai` (Password: `password123`)
- Demo Organization & Application
- Valid TokenWise API Key: `tw-live_demo1234567890abcdef12345678`
- 300+ diverse LLM requests across GPT-4o, Claude 3.5 Sonnet, Llama 3.3, and Gemini Flash with realistic latencies, tokens, sessions, and error scenarios.

#### 3. Frontend Setup
```bash
cd apps/web

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Option B: Production Multi-Container Deployment (Docker Compose)

The root `docker-compose.yml` orchestrates the complete stack:
- **`tokenwise-db`:** PostgreSQL 16 Alpine
- **`tokenwise-redis`:** Redis 7 Alpine
- **`tokenwise-api`:** FastAPI backend running under Uvicorn
- **`tokenwise-web`:** Next.js production server

```bash
# From repository root:
docker-compose up -d --build
```
Services will become available at:
- Web Dashboard: `http://localhost:3000`
- API & Gateway: `http://localhost:8000`
- API Health Check: `http://localhost:8000/health`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

## 15. Troubleshooting & Verification Playbook

### Verifying the Gateway via cURL

You can test the TokenWise gateway directly with `curl`:

```bash
# 1. Send chat completion through TokenWise Gateway
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Authorization: Bearer tw-live_demo1234567890abcdef12345678" \
  -H "Content-Type: application/json" \
  -H "x-tw-session-id: test-session-001" \
  -H "x-tw-user-id: user-alice" \
  -H "x-tw-property-environment: staging" \
  -d '{
    "model": "meta-llama/llama-3.3-70b-instruct",
    "messages": [
      {"role": "user", "content": "Explain LLM observability in two concise bullet points."}
    ]
  }'
```

**Expected Response Headers:**
```http
x-tokenwise-request-id: tw-req-xxxxxxxxxxxxxxxx
x-tokenwise-latency-ms: 12.4
x-tokenwise-cost-usd: 0.000185
x-tokenwise-provider: openrouter
x-tokenwise-model: meta-llama/llama-3.3-70b-instruct
```

### Automated Test Suites
Run the backend automated test suite to verify tenant isolation, pricing math, and gateway proxying:

```bash
cd apps/api
pytest tests/ -v
```

### Common Questions & Issues

1. **"Failed to fetch" on frontend:**
   Ensure the backend is running at `http://localhost:8000` and `NEXT_PUBLIC_API_URL` in `apps/web/.env.local` points to `http://localhost:8000`. Verify CORS origins in `apps/api/app/core/config.py`.
2. **Missing Live OpenRouter Responses:**
   If requests return simulated responses, verify `OPENROUTER_API_KEY` is set in `apps/api/.env`. In development, TokenWise automatically simulates responses if the key is omitted so development is never blocked.
3. **Queue Monitoring:**
   Check `http://localhost:8000/health` to inspect the `telemetry_metrics` object (`events_enqueued`, `events_processed`, `events_failed`).
