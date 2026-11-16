from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# ------------------ Auth & User ------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    organization_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: Optional[str] = None
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ------------------ Organization ------------------
class OrgCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    created_at: datetime


class OrgMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    organization_id: str
    role: str
    user_email: Optional[str] = None
    created_at: datetime


# ------------------ Application ------------------
class AppCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    environment: str = Field(default="development")
    content_capture_enabled: bool = True


class AppOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    name: str
    environment: str
    content_capture_enabled: bool
    created_at: datetime


# ------------------ API Keys ------------------
class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    application_id: str


class ApiKeyCreatedOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    key: str  # Revealed only at creation!
    application_id: str
    created_at: datetime


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    key_prefix: str
    application_id: str
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime


# ------------------ Gateway Chat Completion ------------------
class ChatMessage(BaseModel):
    role: str
    content: Union[str, List[Dict[str, Any]], Any]
    name: Optional[str] = None


class ChatCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 1.0
    top_p: Optional[float] = 1.0
    n: Optional[int] = 1
    stream: Optional[bool] = False
    max_tokens: Optional[int] = None
    presence_penalty: Optional[float] = 0.0
    frequency_penalty: Optional[float] = 0.0
    user: Optional[str] = None


# ------------------ Requests & Telemetry ------------------
class RequestListItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    request_id: str
    application_id: str
    provider: str
    model: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    prompt_name: Optional[str] = None
    prompt_version: Optional[str] = None
    resolved_model: Optional[str] = None
    is_streaming: Optional[bool] = False
    input_tokens: int
    output_tokens: int
    cached_input_tokens: Optional[int] = 0
    reasoning_tokens: Optional[int] = 0
    total_tokens: int
    estimated_cost: float
    provider_reported_cost: Optional[float] = None
    cost_status: Optional[str] = "calculated"
    pricing_version_id: Optional[str] = None
    currency: str
    latency_ms: float
    status: str
    error_type: Optional[str] = None
    created_at: datetime


class RequestDetailOut(RequestListItemOut):
    input_content: Optional[str] = None
    output_content: Optional[str] = None
    properties: Dict[str, str] = {}


class PaginatedRequestsOut(BaseModel):
    items: List[RequestListItemOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ------------------ Analytics ------------------
class OverviewMetricsOut(BaseModel):
    total_requests: int
    total_cost: float
    total_tokens: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: float
    error_rate: float
    currency: str = "USD"


class VolumeTimePoint(BaseModel):
    timestamp: str
    requests: int
    errors: int


class CostTimePoint(BaseModel):
    timestamp: str
    cost: float


class TokenTimePoint(BaseModel):
    timestamp: str
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ModelDistributionPoint(BaseModel):
    model: str
    requests: int
    percentage: float
    total_cost: float


# ------------------ Sessions ------------------
class SessionListItemOut(BaseModel):
    id: str
    external_session_id: str
    application_id: str
    user_id: Optional[str] = None
    request_count: int
    total_cost: float
    total_tokens: int
    avg_latency_ms: float
    error_count: int
    started_at: datetime
    last_activity_at: datetime


class SessionDetailOut(SessionListItemOut):
    requests: List[RequestListItemOut]


# ------------------ Prompts ------------------
class PromptCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    template: str
    model: str = "gpt-4o"
    configuration: Optional[Dict[str, Any]] = None


class PromptVersionCreate(BaseModel):
    template: str
    model: str = "gpt-4o"
    configuration: Optional[Dict[str, Any]] = None


class PromptVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version: int
    template: str
    model: str
    configuration: Optional[str] = None
    created_at: datetime
    created_by: Optional[str] = None


class PromptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    latest_version: Optional[PromptVersionOut] = None
    versions_count: int = 0
    requests_count: int = 0


# ------------------ Playground ------------------
class PlaygroundRunRequest(BaseModel):
    model: str = "gpt-4o"
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 1000
    provider_api_key: Optional[str] = None


class PlaygroundRunResponse(BaseModel):
    output: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    latency_ms: float
    estimated_cost: float
    model: str
