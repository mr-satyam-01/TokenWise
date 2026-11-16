import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from app.core.security import hash_password, generate_api_key
from app.db.session import AsyncSessionLocal, engine, Base
from app.models import User, Organization, OrganizationMember, Application, ApiKey, LLMRequest, RequestContent, RequestProperty, Session, Prompt, PromptVersion
from app.services.pricing import pricing_service


MODELS = [
    ("gpt-4o", 0.45),
    ("gpt-4o-mini", 0.40),
    ("claude-3-5-sonnet-20241022", 0.15)
]

PROMPT_SAMPLES = [
    ("Code Refactoring Helper", "Refactor the following Python function for better readability and performance.", "v1"),
    ("Customer Support Agent", "You are a helpful customer support agent for Acme Cloud.", "v2"),
    ("Course Outline Generator", "Generate a comprehensive 6-week curriculum on Machine Learning Engineering.", "v1"),
    ("SQL Query Optimizer", "Analyze the execution plan for the slow query and suggest index optimizations.", "v3")
]

SESSIONS = [
    "sess-course-gen-01",
    "sess-support-ticket-482",
    "sess-agent-workflow-99",
    "sess-code-review-14"
]

USERS = ["user_dev_alex", "user_dev_priya", "user_dev_sam", "user_dev_elena"]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Create demo user
        demo_email = "demo@tokenwise.ai"
        user = User(
            email=demo_email,
            hashed_password=hash_password("DemoPassword123!"),
            full_name="Demo Engineer"
        )
        session.add(user)
        await session.flush()

        # 2. Create organization
        org = Organization(
            name="Acme AI Labs",
            slug=f"acme-ai-labs-{user.id[:4]}"
        )
        session.add(org)
        await session.flush()

        member = OrganizationMember(organization_id=org.id, user_id=user.id, role="owner")
        session.add(member)

        # 3. Create applications
        app_prod = Application(
            organization_id=org.id,
            name="Production Agent",
            environment="production",
            content_capture_enabled=True
        )
        app_dev = Application(
            organization_id=org.id,
            name="Staging Playground",
            environment="staging",
            content_capture_enabled=True
        )
        session.add_all([app_prod, app_dev])
        await session.flush()

        # 4. Create API Keys
        full_key, prefix, key_hash = generate_api_key()
        api_key = ApiKey(
            organization_id=org.id,
            application_id=app_prod.id,
            name="Production Ingestion Key",
            key_prefix=f"tw-live_{prefix}",
            key_hash=key_hash,
            last_used_at=datetime.now(timezone.utc)
        )
        session.add(api_key)

        # 5. Create Prompts and Versions
        for p_name, p_template, p_ver in PROMPT_SAMPLES:
            prompt = Prompt(
                organization_id=org.id,
                name=p_name,
                description=f"Standard prompt template for {p_name}"
            )
            session.add(prompt)
            await session.flush()

            ver = PromptVersion(
                prompt_id=prompt.id,
                version=int(p_ver.replace("v", "")),
                template=p_template,
                model="gpt-4o",
                configuration=json.dumps({"temperature": 0.7, "max_tokens": 1500}),
                created_by=user.email
            )
            session.add(ver)

        # 6. Create Sessions
        for sess_id in SESSIONS:
            sess_obj = Session(
                organization_id=org.id,
                application_id=app_prod.id,
                external_session_id=sess_id,
                user_id=random.choice(USERS),
                name=f"Workflow Trace {sess_id}"
            )
            session.add(sess_obj)

        # 7. Generate realistic past 7 days request telemetry
        now = datetime.now(timezone.utc)
        for i in range(120):
            # Distributed across the past 7 days
            hours_ago = random.uniform(0.5, 168.0)
            req_time = now - timedelta(hours=hours_ago)
            
            # Select model
            r_val = random.random()
            if r_val < 0.45:
                model_name = "gpt-4o"
                provider_name = "openai"
            elif r_val < 0.85:
                model_name = "gpt-4o-mini"
                provider_name = "openai"
            else:
                model_name = "claude-3-5-sonnet-20241022"
                provider_name = "anthropic"

            is_error = (random.random() < 0.05)
            status_str = "error" if is_error else "success"
            error_type = random.choice(["rate_limit_exceeded", "upstream_timeout", "context_length_exceeded"]) if is_error else None

            in_tokens = random.randint(120, 3200)
            out_tokens = 0 if is_error else random.randint(60, 1800)
            cost = pricing_service.calculate_cost(model_name, in_tokens, out_tokens)
            latency = random.uniform(450.0, 3800.0) if not is_error else random.uniform(150.0, 900.0)

            p_choice = random.choice(PROMPT_SAMPLES)
            session_choice = random.choice(SESSIONS) if random.random() < 0.7 else None
            user_choice = random.choice(USERS)

            req_id = f"req-{uuid.uuid4().hex[:14]}"

            llm_req = LLMRequest(
                organization_id=org.id,
                application_id=app_prod.id,
                request_id=req_id,
                provider=provider_name,
                model=model_name,
                user_id=user_choice,
                session_id=session_choice,
                prompt_name=p_choice[0],
                prompt_version=p_choice[2],
                input_tokens=in_tokens,
                output_tokens=out_tokens,
                total_tokens=in_tokens + out_tokens,
                estimated_cost=cost,
                currency="USD",
                latency_ms=latency,
                status=status_str,
                error_type=error_type,
                started_at=req_time - timedelta(milliseconds=latency),
                completed_at=req_time,
                created_at=req_time
            )
            session.add(llm_req)

            # Add content
            sample_messages = [
                {"role": "system", "content": p_choice[1]},
                {"role": "user", "content": f"Generate step #{i+1} for our production workflow task."}
            ]
            sample_output = [
                {"index": 0, "message": {"role": "assistant", "content": f"Here is the detailed response output for request #{req_id}."}}
            ] if not is_error else {"error": {"message": f"Sample simulated {error_type}", "type": error_type}}

            content = RequestContent(
                request_id=req_id,
                organization_id=org.id,
                input_content=json.dumps(sample_messages),
                output_content=json.dumps(sample_output),
                content_capture_enabled=True,
                created_at=req_time
            )
            session.add(content)

            # Add custom property
            prop = RequestProperty(
                request_id=req_id,
                organization_id=org.id,
                key="environment",
                value="production"
            )
            session.add(prop)

        await session.commit()
        print(f"Successfully seeded demo data!")
        print(f"User: {demo_email} | Password: DemoPassword123!")
        print(f"API Key created: {full_key}")


if __name__ == "__main__":
    asyncio.run(seed())
