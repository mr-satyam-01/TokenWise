export interface User {
  id: string;
  email: string;
  full_name?: string;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Application {
  id: string;
  organization_id: string;
  name: string;
  environment: string;
  content_capture_enabled: boolean;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key?: string; // Revealed only at creation
  application_id: string;
  last_used_at?: string;
  revoked_at?: string;
  created_at: string;
}

export interface LLMRequestItem {
  id: string;
  request_id: string;
  application_id: string;
  provider: string;
  model: string;
  resolved_model?: string;
  is_streaming?: boolean;
  user_id?: string;
  session_id?: string;
  prompt_name?: string;
  prompt_version?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost: number;
  provider_reported_cost?: number;
  cost_status?: string;
  currency: string;
  latency_ms: number;
  status: "success" | "error";
  error_type?: string;
  created_at: string;
}

// ---------- Model Catalog ----------
export interface CatalogModel {
  id: string;
  name: string;
  provider_name?: string;
  description?: string;
  context_length?: number;
  modalities?: string;
  is_active: boolean;
  last_synced_at?: string;
}

export interface ModelPricingInfo {
  model_id: string;
  version: number;
  input_price_per_million: number;
  output_price_per_million: number;
  cached_input_price_per_million?: number;
  reasoning_price_per_million?: number;
  request_flat_price?: number;
  currency: string;
  pricing_source: string;
  validation_status: string;
  effective_at?: string;
}

export interface CatalogSyncResult {
  status: string;
  models_discovered: number;
  models_updated: number;
  pricings_created: number;
  validation_failures: number;
}

export interface ProviderInfo {
  provider: string;
  model_count: number;
}

export interface LLMRequestDetail extends LLMRequestItem {
  input_content?: string;
  output_content?: string;
  properties: Record<string, string>;
}

export interface PaginatedRequests {
  items: LLMRequestItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OverviewMetrics {
  total_requests: number;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number;
  error_rate: number;
  currency: string;
}

export interface VolumePoint {
  timestamp: string;
  requests: number;
  errors: number;
}

export interface CostPoint {
  timestamp: string;
  cost: number;
}

export interface TokenPoint {
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ModelDistribution {
  model: string;
  requests: number;
  percentage: number;
  total_cost: number;
}

export interface SessionItem {
  id: string;
  external_session_id: string;
  application_id: string;
  user_id?: string;
  request_count: number;
  total_cost: number;
  total_tokens: number;
  avg_latency_ms: number;
  error_count: number;
  started_at: string;
  last_activity_at: string;
}

export interface SessionDetail extends SessionItem {
  requests: LLMRequestItem[];
}

export interface PromptVersion {
  id: string;
  version: number;
  template: string;
  model: string;
  configuration?: string;
  created_at: string;
  created_by?: string;
}

export interface PromptItem {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  latest_version?: PromptVersion;
  versions_count: number;
  requests_count: number;
}
