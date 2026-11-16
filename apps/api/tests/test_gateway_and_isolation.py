import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.db.session import Base, get_db
from app.services.telemetry import telemetry_service
import app.services.telemetry as telemetry_module

test_engine = create_async_engine("sqlite+aiosqlite:///./test_tokenwise.db", echo=False)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with TestSessionLocal() as session:
        yield session

@pytest.fixture(autouse=True)
async def setup_db_and_telemetry():
    app.dependency_overrides[get_db] = override_get_db
    with patch.object(telemetry_module, "AsyncSessionLocal", TestSessionLocal):
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await telemetry_service.initialize()
        yield
        await telemetry_service.shutdown()
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_end_to_end_gateway_and_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        health_resp = await client.get("/health")
        assert health_resp.status_code == 200
        assert health_resp.json()["status"] == "ok"

        # 2. User A Signup (Org A)
        signup_a = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "alice@company-a.com",
                "password": "Password123!",
                "full_name": "Alice Developer",
                "organization_name": "Company A"
            }
        )
        assert signup_a.status_code == 201
        data_a = signup_a.json()
        token_a = data_a["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 3. Retrieve default app and create API Key for Org A
        apps_resp = await client.get("/api/v1/applications/", headers=headers_a)
        assert apps_resp.status_code == 200
        app_list_a = apps_resp.json()
        assert len(app_list_a) >= 1
        app_id_a = app_list_a[0]["id"]

        key_create_resp = await client.post(
            "/api/v1/api-keys/",
            headers=headers_a,
            json={"name": "Alice Integration Key", "application_id": app_id_a}
        )
        assert key_create_resp.status_code == 201
        tw_api_key_a = key_create_resp.json()["key"]
        assert tw_api_key_a.startswith("tw-live_")

        # 4. Mock OpenAI provider response
        mock_openai_response = (
            200,
            {
                "id": "chatcmpl-test-mock-12345",
                "object": "chat.completion",
                "created": 1700000000,
                "model": "gpt-4o",
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": "Hello! I am a monitored AI response via TokenWise."
                        },
                        "finish_reason": "stop"
                    }
                ],
                "usage": {
                    "prompt_tokens": 15,
                    "completion_tokens": 25,
                    "total_tokens": 40
                }
            },
            {"content-type": "application/json"}
        )

        with patch("app.providers.openai.OpenAIProvider.chat_completion", return_value=mock_openai_response):
            # Forward LLM request through TokenWise Gateway
            gw_resp = await client.post(
                "/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {tw_api_key_a}",
                    "x-provider-api-key": "sk-mock-openai-key",
                    "x-tw-session-id": "session-cohort-101",
                    "x-tw-user-id": "end-user-999",
                    "x-tw-property-environment": "production"
                },
                json={
                    "model": "gpt-4o",
                    "messages": [
                        {"role": "user", "content": "Tell me a joke about observability."}
                    ]
                }
            )
            assert gw_resp.status_code == 200
            assert "x-tokenwise-request-id" in gw_resp.headers
            assert gw_resp.json()["choices"][0]["message"]["content"] == "Hello! I am a monitored AI response via TokenWise."

        # Wait briefly for background telemetry worker to persist record
        await asyncio.sleep(0.5)

        # 5. Query Request Explorer as Org A
        requests_resp_a = await client.get("/api/v1/requests/", headers=headers_a)
        assert requests_resp_a.status_code == 200
        req_items_a = requests_resp_a.json()["items"]
        assert len(req_items_a) == 1
        req_record = req_items_a[0]
        assert req_record["model"] == "gpt-4o"
        assert req_record["input_tokens"] == 15
        assert req_record["output_tokens"] == 25
        assert req_record["total_tokens"] == 40
        assert req_record["session_id"] == "session-cohort-101"
        assert req_record["user_id"] == "end-user-999"

        # Check Request Detail
        req_detail_resp = await client.get(f"/api/v1/requests/{req_record['request_id']}", headers=headers_a)
        assert req_detail_resp.status_code == 200
        req_detail = req_detail_resp.json()
        assert req_detail["properties"].get("environment") == "production"
        assert "Tell me a joke" in req_detail["input_content"]

        # Check Sessions endpoint
        sessions_resp = await client.get("/api/v1/sessions/", headers=headers_a)
        assert sessions_resp.status_code == 200
        sessions_list = sessions_resp.json()
        assert len(sessions_list) == 1
        assert sessions_list[0]["external_session_id"] == "session-cohort-101"

        # Check Overview Analytics endpoint
        analytics_resp = await client.get("/api/v1/analytics/overview", headers=headers_a)
        assert analytics_resp.status_code == 200
        metrics = analytics_resp.json()
        assert metrics["total_requests"] == 1
        assert metrics["total_tokens"] == 40
        assert metrics["error_rate"] == 0.0

        # 6. Tenant Isolation Check: User B (Company B)
        signup_b = await client.post(
            "/api/v1/auth/signup",
            json={
                "email": "bob@company-b.com",
                "password": "Password456!",
                "full_name": "Bob Developer",
                "organization_name": "Company B"
            }
        )
        assert signup_b.status_code == 201
        token_b = signup_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User B should have 0 requests in their explorer!
        requests_resp_b = await client.get("/api/v1/requests/", headers=headers_b)
        assert requests_resp_b.status_code == 200
        assert len(requests_resp_b.json()["items"]) == 0

        # User B cannot access Org A's request detail
        cross_detail_resp = await client.get(f"/api/v1/requests/{req_record['request_id']}", headers=headers_b)
        assert cross_detail_resp.status_code == 404

        # User B overview shows 0 requests
        analytics_resp_b = await client.get("/api/v1/analytics/overview", headers=headers_b)
        assert analytics_resp_b.json()["total_requests"] == 0
