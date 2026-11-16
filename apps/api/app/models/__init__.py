import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Text, Boolean, Integer, Float, ForeignKey, DateTime, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    members: Mapped[List["OrganizationMember"]] = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    applications: Mapped[List["Application"]] = relationship("Application", back_populates="organization", cascade="all, delete-orphan")
    api_keys: Mapped[List["ApiKey"]] = relationship("ApiKey", back_populates="organization", cascade="all, delete-orphan")
    prompts: Mapped[List["Prompt"]] = relationship("Prompt", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    memberships: Mapped[List["OrganizationMember"]] = relationship("OrganizationMember", back_populates="user", cascade="all, delete-orphan")


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member", nullable=False)  # owner, admin, member
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="memberships")

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_member"),
    )


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    environment: Mapped[str] = mapped_column(String(50), default="development", nullable=False)  # production, staging, development
    content_capture_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="applications")
    api_keys: Mapped[List["ApiKey"]] = relationship("ApiKey", back_populates="application", cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    application_id: Mapped[str] = mapped_column(String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="api_keys")
    application: Mapped["Application"] = relationship("Application", back_populates="api_keys")


class LLMRequest(Base):
    __tablename__ = "llm_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    application_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="openrouter", nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resolved_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_streaming: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    prompt_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    prompt_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cached_input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reasoning_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    estimated_cost: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    provider_reported_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cost_status: Mapped[str] = mapped_column(String(50), default="exact_usage_reported", nullable=False)  # exact_usage_reported, estimated, unavailable, recalculation_required
    pricing_version_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="success", nullable=False, index=True)  # success, error
    error_type: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

    __table_args__ = (
        Index("idx_org_created_at", "organization_id", "created_at"),
        Index("idx_org_model", "organization_id", "model"),
        Index("idx_org_status", "organization_id", "status"),
    )


class ModelCatalog(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # canonical model ID, e.g. "openai/gpt-4o"
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    context_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    modalities: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # e.g. "text->text", "text+image->text"
    capabilities: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON capabilities
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    raw_metadata: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    pricings: Mapped[List["ModelPricing"]] = relationship("ModelPricing", back_populates="model", cascade="all, delete-orphan", order_by="desc(ModelPricing.version)")


class ModelPricing(Base):
    __tablename__ = "model_pricings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(String(128), ForeignKey("models.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Normalized prices per 1,000,000 billable tokens (USD)
    input_price_per_million: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    output_price_per_million: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cached_input_price_per_million: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reasoning_price_per_million: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    request_flat_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    pricing_source: Mapped[str] = mapped_column(String(50), default="openrouter_catalog", nullable=False)  # openrouter_catalog, official_provider, manual_override
    source_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    raw_pricing: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    validation_status: Mapped[str] = mapped_column(String(50), default="valid", nullable=False)  # valid, incomplete, malformed
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    model: Mapped["ModelCatalog"] = relationship("ModelCatalog", back_populates="pricings")

    __table_args__ = (
        Index("idx_pricing_model_active", "model_id", "is_active"),
        UniqueConstraint("model_id", "version", name="uq_model_pricing_version"),
    )


class ModelSyncRun(Base):
    __tablename__ = "model_sync_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    sync_type: Mapped[str] = mapped_column(String(50), default="full", nullable=False)  # models, pricing, full
    status: Mapped[str] = mapped_column(String(50), default="success", nullable=False)  # success, failed, partial
    models_discovered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    models_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pricings_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    validation_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RequestContent(Base):
    __tablename__ = "request_content"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    request_id: Mapped[str] = mapped_column(String(128), ForeignKey("llm_requests.request_id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    input_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_capture_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RequestProperty(Base):
    __tablename__ = "request_properties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    request_id: Mapped[str] = mapped_column(String(128), ForeignKey("llm_requests.request_id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    value: Mapped[str] = mapped_column(String(512), nullable=False)

    __table_args__ = (
        Index("idx_prop_org_key_val", "organization_id", "key", "value"),
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    application_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    external_session_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        UniqueConstraint("organization_id", "external_session_id", name="uq_org_session"),
    )


class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="prompts")
    versions: Mapped[List["PromptVersion"]] = relationship("PromptVersion", back_populates="prompt", cascade="all, delete-orphan", order_by="desc(PromptVersion.version)")

    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_org_prompt_name"),
    )


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    prompt_id: Mapped[str] = mapped_column(String(36), ForeignKey("prompts.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    template: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="gpt-4o", nullable=False)
    configuration: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON params
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    prompt: Mapped["Prompt"] = relationship("Prompt", back_populates="versions")

    __table_args__ = (
        UniqueConstraint("prompt_id", "version", name="uq_prompt_version"),
    )
