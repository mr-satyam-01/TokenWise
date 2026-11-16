import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models import LLMRequest, RequestContent, RequestProperty, Session, ApiKey
from app.services.pricing import pricing_service

logger = logging.getLogger("tokenwise.telemetry")


class TelemetryService:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._memory_queue: asyncio.Queue = asyncio.Queue(maxsize=10000)
        self._worker_task: Optional[asyncio.Task] = None
        self._is_running: bool = False
        self._redis_queue_key: str = "tokenwise:telemetry:events"

        # Telemetry metrics
        self.metrics = {
            "events_enqueued": 0,
            "events_processed": 0,
            "events_failed": 0,
        }

    async def initialize(self):
        if settings.REDIS_URL:
            try:
                self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
                await self._redis.ping()
                logger.info("Connected to Redis for durable telemetry queue.")
            except Exception as e:
                logger.warning(f"Could not connect to Redis ({e}), falling back to bounded in-memory queue.")
                self._redis = None
        self._is_running = True
        self._worker_task = asyncio.create_task(self._process_worker_loop())
        logger.info("Telemetry background worker started.")

    async def shutdown(self):
        self._is_running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.close()
        logger.info("Telemetry service shut down cleanly.")

    async def enqueue(self, event: Dict[str, Any]):
        """Non-blocking telemetry enqueueing."""
        self.metrics["events_enqueued"] += 1
        serialized = json.dumps(event, default=str)
        if self._redis:
            try:
                await self._redis.rpush(self._redis_queue_key, serialized)
                return
            except Exception as e:
                logger.error(f"Redis enqueue failed ({e}), placing in fallback memory queue.")
        
        try:
            self._memory_queue.put_nowait(serialized)
        except asyncio.QueueFull:
            logger.critical("Telemetry memory queue full! Dropping event to prevent gateway backpressure.")
            self.metrics["events_failed"] += 1

    async def _dequeue(self) -> Optional[str]:
        if self._redis:
            try:
                res = await self._redis.blpop([self._redis_queue_key], timeout=1)
                if res:
                    return res[1]
            except Exception as e:
                logger.error(f"Redis dequeue error: {e}")
                await asyncio.sleep(0.5)

        try:
            return await asyncio.wait_for(self._memory_queue.get(), timeout=1.0)
        except asyncio.TimeoutError:
            return None

    async def _process_worker_loop(self):
        while self._is_running:
            try:
                raw_event = await self._dequeue()
                if not raw_event:
                    continue
                
                event = json.loads(raw_event)
                await self._persist_telemetry_event(event)
                self.metrics["events_processed"] += 1
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing telemetry event: {e}", exc_info=True)
                self.metrics["events_failed"] += 1
                await asyncio.sleep(0.2)

    async def _persist_telemetry_event(self, event: Dict[str, Any]):
        """Persists request metadata, content, and custom properties idempotently."""
        async with AsyncSessionLocal() as session:
            try:
                request_id = event["request_id"]
                organization_id = event["organization_id"]
                application_id = event["application_id"]

                # Idempotency check
                existing = await session.execute(
                    select(LLMRequest).where(LLMRequest.request_id == request_id)
                )
                if existing.scalar_one_or_none():
                    logger.info(f"Duplicate telemetry event for request_id {request_id}, skipping.")
                    return

                # Token usage
                input_tokens = int(event.get("input_tokens", 0))
                output_tokens = int(event.get("output_tokens", 0))
                cached_input_tokens = int(event.get("cached_input_tokens", 0))
                reasoning_tokens = int(event.get("reasoning_tokens", 0))
                total_tokens = int(event.get("total_tokens", 0)) or (input_tokens + output_tokens)
                model = str(event.get("model", "unknown"))

                # Cost
                estimated_cost = event.get("estimated_cost")
                if estimated_cost is None:
                    estimated_cost = pricing_service.calculate_cost(
                        model, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens
                    )

                started_at = datetime.fromisoformat(event["started_at"]) if isinstance(event["started_at"], str) else event["started_at"]
                completed_at = datetime.fromisoformat(event["completed_at"]) if isinstance(event["completed_at"], str) else event["completed_at"]

                llm_req = LLMRequest(
                    organization_id=organization_id,
                    application_id=application_id,
                    request_id=request_id,
                    provider=event.get("provider", "openrouter"),
                    model=model,
                    resolved_model=event.get("resolved_model"),
                    is_streaming=bool(event.get("is_streaming", False)),
                    user_id=event.get("user_id"),
                    session_id=event.get("session_id"),
                    prompt_name=event.get("prompt_name"),
                    prompt_version=event.get("prompt_version"),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    cached_input_tokens=cached_input_tokens,
                    reasoning_tokens=reasoning_tokens,
                    estimated_cost=estimated_cost,
                    provider_reported_cost=event.get("provider_reported_cost"),
                    cost_status=event.get("cost_status", "estimated"),
                    pricing_version_id=event.get("pricing_version_id"),
                    currency="USD",
                    latency_ms=float(event.get("latency_ms", 0.0)),
                    status=event.get("status", "success"),
                    error_type=event.get("error_type"),
                    started_at=started_at,
                    completed_at=completed_at,
                )
                session.add(llm_req)

                # Persist content if enabled
                if event.get("content_capture_enabled", True):
                    content = RequestContent(
                        request_id=request_id,
                        organization_id=organization_id,
                        input_content=event.get("input_content"),
                        output_content=event.get("output_content"),
                        content_capture_enabled=True,
                    )
                    session.add(content)

                # Persist properties
                properties = event.get("properties") or {}
                for k, v in properties.items():
                    prop = RequestProperty(
                        request_id=request_id,
                        organization_id=organization_id,
                        key=str(k)[:128],
                        value=str(v)[:512],
                    )
                    session.add(prop)

                # Session tracking
                session_id = event.get("session_id")
                if session_id:
                    sess_res = await session.execute(
                        select(Session).where(
                            Session.organization_id == organization_id,
                            Session.external_session_id == session_id
                        )
                    )
                    sess = sess_res.scalar_one_or_none()
                    if not sess:
                        sess = Session(
                            organization_id=organization_id,
                            application_id=application_id,
                            external_session_id=session_id,
                            user_id=event.get("user_id")
                        )
                        session.add(sess)
                    else:
                        sess.updated_at = datetime.now(timezone.utc)

                # Update API key last_used_at
                api_key_id = event.get("api_key_id")
                if api_key_id:
                    key_res = await session.execute(
                        select(ApiKey).where(ApiKey.id == api_key_id)
                    )
                    key_obj = key_res.scalar_one_or_none()
                    if key_obj:
                        key_obj.last_used_at = datetime.now(timezone.utc)

                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error(f"Failed to persist telemetry event for {event.get('request_id')}: {e}", exc_info=True)
                raise


telemetry_service = TelemetryService()
