import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.api.v1.auth import router as auth_router
from app.api.v1.organizations import router as orgs_router
from app.api.v1.applications import router as apps_router
from app.api.v1.api_keys import router as keys_router
from app.api.v1.requests import router as requests_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.prompts import router as prompts_router
from app.api.v1.playground import router as playground_router
from app.api.v1.models import router as models_router
from app.gateway.router import router as gateway_router
from app.core.config import settings
from app.db.session import engine, Base
from app.services.telemetry import telemetry_service

# Logging setup
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tokenwise")


async def _background_catalog_sync():
    """Background task to sync model catalog on startup and periodically."""
    from app.services.catalog_sync import catalog_sync_service

    # Initial sync on startup (with a small delay to let the app fully start)
    await asyncio.sleep(3)
    try:
        logger.info("Starting initial model catalog sync from OpenRouter...")
        result = await catalog_sync_service.sync_catalog()
        logger.info(f"Initial catalog sync result: {result}")
    except Exception as e:
        logger.warning(f"Initial catalog sync failed (non-fatal): {e}")

    # Periodic sync
    if settings.TOKENWISE_PRICING_SYNC_ENABLED:
        interval_seconds = settings.TOKENWISE_MODEL_SYNC_INTERVAL_HOURS * 3600
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                logger.info("Running periodic model catalog sync...")
                result = await catalog_sync_service.sync_catalog()
                logger.info(f"Periodic sync result: {result}")
            except Exception as e:
                logger.warning(f"Periodic catalog sync failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing TokenWise database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized successfully.")

    # Start telemetry ingestion queue worker
    await telemetry_service.initialize()

    # Start background catalog sync (non-blocking)
    sync_task = asyncio.create_task(_background_catalog_sync())

    yield

    # Shutdown
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        pass
    await telemetry_service.shutdown()
    await engine.dispose()


app = FastAPI(
    title="TokenWise LLM Observability & Gateway API",
    version="2.0.0",
    description="Developer-first LLM Observability, Metrics, and Gateway Platform. "
                "Routes requests through OpenRouter for multi-model support.",
    lifespan=lifespan
)


# CORS Middleware
origins = [
    # Local development
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",

    # Production frontend (Vercel)
    "https://tokenwise-three.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check for deployment load balancers and container monitors."""
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error(f"Healthcheck database ping failed: {e}")
        db_status = f"unhealthy: {e}"

    return {
        "status": "ok" if db_status == "healthy" else "degraded",
        "service": "tokenwise-api",
        "version": "2.0.0",
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "provider": "openrouter" if settings.OPENROUTER_API_KEY else ("openai" if settings.OPENAI_API_KEY else "none"),
        "telemetry_metrics": telemetry_service.metrics
    }


# Mount the OpenAI-compatible LLM Gateway directly
app.include_router(gateway_router)

# Mount Dashboard REST API v1
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(orgs_router)
api_v1.include_router(apps_router)
api_v1.include_router(keys_router)
api_v1.include_router(requests_router)
api_v1.include_router(analytics_router)
api_v1.include_router(sessions_router)
api_v1.include_router(prompts_router)
api_v1.include_router(playground_router)
api_v1.include_router(models_router)

app.include_router(api_v1)
