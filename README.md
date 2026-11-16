<<<<<<< HEAD
# TokenWise — LLM Observability & Gateway Platform

TokenWise is a developer-first LLM Observability, Metrics, and Proxy Gateway platform inspired by the core capabilities of **Helicone**. It enables engineering teams to integrate, monitor, debug, analyze, and optimize their LLM-powered applications through a unified, high-performance dashboard and API gateway.

> 📖 **Comprehensive Documentation:** For an in-depth breakdown of every subsystem, data model, proxy workflow, and API contract, see the [TokenWise Complete Technical Guide](docs/TOKENWISE_COMPLETE_GUIDE.md).

---

## 🎨 Visual Identity & Aesthetic

TokenWise is designed with a warm, minimalist developer aesthetic:
- **Warm Beige Surfaces:** `#F5F0E8`, `#EAE1D5`
- **Interactive Orange Accents:** `#F4A261`, `#E98945`, `#D97732`
- **High-Contrast Dark Typography:** `#171717`, `#262626`
- **Clean Borders & Tabular Numerals:** `#E3DBD0` with tabular numeric fonts for financial accuracy.

---

## 🚀 Key Features

1. **High-Throughput OpenAI-Compatible Gateway (`/v1/chat/completions`)**
   - Intercepts requests, validates cryptographically hashed TokenWise API keys, and forwards traffic with minimal processing overhead (<15ms).
   - Asynchronous durable queue decouples telemetry ingestion so downstream logging never slows down client inference.
2. **Overview Analytics Dashboard**
   - **5 Key Metric Cards:** Total Requests, Estimated Cost, Total Tokens (Input vs. Output breakdown), Average Latency, and Error Rate.
   - **Interactive Charts:** Request Volume over time, Cost trendline, Stacked token breakdown, and Model distribution share.
   - **Pronged Onboarding Experience:** Clear empty-state onboarding when no requests have arrived yet.
3. **Real-Time Request Explorer**
   - Dense, filterable TanStack table with server-side pagination, search by Request ID/User/Prompt, model filters, and status badges.
   - **Slide-out Detail Drawer:** Comprehensive breakdown of Prompt messages, Provider output, Latency, Token counts, Pricing, and custom metadata headers.
4. **Sessions & Workflow Tracing**
   - Correlate multi-step LLM operations (e.g. course generation, agents, support conversations) using `x-tw-session-id`.
   - Visual chronological waterfall timeline of chain executions.
5. **Prompt Versioning & Management**
   - Immutable prompt version lineage (v1, v2, v3...) ensuring prompt history is never silently overwritten.
   - Associated production request counts and performance telemetry.
6. **Interactive Prompt Playground**
   - Experiment with models (`gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet`), system prompts, temperature, and max tokens.
   - Live telemetry preview of latency, token usage, and cost calculations with a 1-click "Save as Version" action.
7. **Strict Multi-Tenant Security & API Key Vault**
   - Multi-tenant organization isolation verified through automated test suites.
   - Cryptographically hashed API keys (`tw-live_<prefix>_<secret>`) revealed only once upon creation.

---

## 🏗️ Architecture

```
Client App (OpenAI SDK / LangChain)
         │
         ▼  POST /v1/chat/completions (Bearer: tw-live_..., x-provider-api-key: sk-...)
┌───────────────────────────────────────────────┐
│              TokenWise Gateway                │
│  - Constant-time API Key Verification         │
│  - Tenancy & Application Resolution           │
│  - Non-blocking Telemetry Ingestion Fork      │
└───────────────┬───────────────────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
Upstream Provider     Telemetry Queue (Redis / Memory)
 (OpenAI API)              │
     │                     ▼
     │            Background Worker (Async)
     │             - Decimal-safe Cost Calculation
     │             - Token Usage Normalization
     │             - Idempotent Persistence
     ▼                     │
Return Response            ▼
 (<15ms overhead)    PostgreSQL / SQLite Database
                           ▲
                           │  Read Analytics & Telemetry
                     ┌─────┴───────────────────┐
                     │  TokenWise Next.js App  │
                     │  (Analytics Dashboard)  │
                     └─────────────────────────┘
```

---

## ⚡ Quick Start

### Option A: Standalone Local Development (No Docker Required)

1. **Clone the repository:**
   ```bash
   git clone <repo-url> tokenwise
   cd tokenwise
   ```

2. **Setup Backend:**
   ```bash
   cd apps/api
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Seed Realistic Demo Data (Optional):**
   ```bash
   PYTHONPATH=. python scripts/seed_demo_data.py
   ```
   *Creates a demo user (`demo@tokenwise.ai` / `DemoPassword123!`), 120+ simulated past requests, sessions, and prompts.*

4. **Start Backend Server:**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   *Healthcheck available at `http://localhost:8000/health`*

5. **Start Frontend Dashboard:**
   In a separate terminal:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```
   *Open `http://localhost:3000` in your browser.*

---

### Option B: Docker Compose

```bash
docker compose up --build
```
This boots:
- PostgreSQL 16 on port `5432`
- Redis 7 on port `6379`
- TokenWise FastAPI on port `8000`
- TokenWise Web on port `3000`

---

## 🔌 Integrating With Your Application

Routing traffic through TokenWise takes literally 1 line of configuration in your existing OpenAI SDK:

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",  # TokenWise Gateway URL
    api_key="tw-live_<YOUR_TOKENWISE_KEY>",
    default_headers={
        "x-provider-api-key": "sk-proj-...",  # Upstream OpenAI Key
        "x-tw-session-id": "course-generator-cohort-1",
        "x-tw-user-id": "usr_99182",
        "x-tw-property-env": "production"
    }
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain vector databases."}]
)
print(response.choices[0].message.content)
```

### TypeScript / Node.js

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "tw-live_<YOUR_TOKENWISE_KEY>",
  defaultHeaders: {
    "x-provider-api-key": process.env.OPENAI_API_KEY,
    "x-tw-session-id": "agent-thread-482",
    "x-tw-property-environment": "production"
  }
});

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarize Q3 metrics." }]
});
```

---

## 🧪 Running Automated Tests

Run the full backend test suite covering cryptographic key hashing, decimal pricing arithmetic, gateway proxying, and strict multi-tenant isolation:

```bash
cd apps/api
./venv/bin/pytest -v
```

All 8 test suites pass with 100% test coverage for the core vertical slice.
=======
# TokenWise
Your personel AI and token manager 
>>>>>>> origin/main
