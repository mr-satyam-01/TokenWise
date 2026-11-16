import {
  User, Organization, Application, ApiKey,
  PaginatedRequests, LLMRequestDetail, OverviewMetrics,
  VolumePoint, CostPoint, TokenPoint, ModelDistribution,
  SessionItem, SessionDetail, PromptItem, PromptVersion
} from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private getAuthToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("tokenwise_token");
  }

  public setAuthToken(token: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("tokenwise_token", token);
    }
  }

  public clearAuthToken() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("tokenwise_token");
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errMessage = `HTTP error ${response.status}`;
      try {
        const errorData = await response.json();
        errMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
      } catch {
        // fallback text
      }
      throw new Error(errMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // ---------------- Auth ----------------
  async signup(data: { email: string; password: string; full_name?: string; organization_name?: string }) {
    return this.request<{ access_token: string; token_type: string; user: User }>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ access_token: string; token_type: string; user: User }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMe() {
    return this.request<User>("/api/v1/auth/me");
  }

  // ---------------- Organizations & Apps ----------------
  async getCurrentOrg() {
    return this.request<Organization>("/api/v1/organizations/current");
  }

  async listApps() {
    return this.request<Application[]>("/api/v1/applications/");
  }

  async createApp(data: { name: string; environment: string; content_capture_enabled?: boolean }) {
    return this.request<Application>("/api/v1/applications/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---------------- API Keys ----------------
  async listApiKeys() {
    return this.request<ApiKey[]>("/api/v1/api-keys/");
  }

  async createApiKey(data: { name: string; application_id: string }) {
    return this.request<ApiKey>("/api/v1/api-keys/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokeApiKey(keyId: string) {
    return this.request<void>(`/api/v1/api-keys/${keyId}`, {
      method: "DELETE",
    });
  }

  // ---------------- Requests ----------------
  async listRequests(params: {
    page?: number;
    page_size?: number;
    model?: string;
    provider?: string;
    status?: string;
    search?: string;
    session_id?: string;
    user_id?: string;
    time_range?: string;
  } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set("page", params.page.toString());
    if (params.page_size) query.set("page_size", params.page_size.toString());
    if (params.model) query.set("model", params.model);
    if (params.provider) query.set("provider", params.provider);
    if (params.status) query.set("status", params.status);
    if (params.search) query.set("search", params.search);
    if (params.session_id) query.set("session_id", params.session_id);
    if (params.user_id) query.set("user_id", params.user_id);
    if (params.time_range) query.set("time_range", params.time_range);

    return this.request<PaginatedRequests>(`/api/v1/requests/?${query.toString()}`);
  }

  async getRequestDetail(requestIdentifier: string) {
    return this.request<LLMRequestDetail>(`/api/v1/requests/${requestIdentifier}`);
  }

  // ---------------- Analytics ----------------
  async getOverviewMetrics(timeRange: string = "7d") {
    return this.request<OverviewMetrics>(`/api/v1/analytics/overview?time_range=${timeRange}`);
  }

  async getVolumeTimeline(timeRange: string = "7d") {
    return this.request<VolumePoint[]>(`/api/v1/analytics/volume?time_range=${timeRange}`);
  }

  async getCostTimeline(timeRange: string = "7d") {
    return this.request<CostPoint[]>(`/api/v1/analytics/costs?time_range=${timeRange}`);
  }

  async getTokenTimeline(timeRange: string = "7d") {
    return this.request<TokenPoint[]>(`/api/v1/analytics/tokens?time_range=${timeRange}`);
  }

  async getModelDistribution(timeRange: string = "7d") {
    return this.request<ModelDistribution[]>(`/api/v1/analytics/models?time_range=${timeRange}`);
  }

  // ---------------- Sessions ----------------
  async listSessions() {
    return this.request<SessionItem[]>("/api/v1/sessions/");
  }

  async getSessionDetail(sessionId: string) {
    return this.request<SessionDetail>(`/api/v1/sessions/${sessionId}`);
  }

  // ---------------- Prompts ----------------
  async listPrompts() {
    return this.request<PromptItem[]>("/api/v1/prompts/");
  }

  async createPrompt(data: { name: string; description?: string; template: string; model: string }) {
    return this.request<PromptItem>("/api/v1/prompts/", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listPromptVersions(promptId: string) {
    return this.request<PromptVersion[]>(`/api/v1/prompts/${promptId}/versions`);
  }

  async createPromptVersion(promptId: string, data: { template: string; model: string }) {
    return this.request<PromptVersion>(`/api/v1/prompts/${promptId}/versions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---------------- Playground ----------------
  async runPlayground(data: { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number }) {
    return this.request<{
      output: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      latency_ms: number;
      estimated_cost: number;
      model: string;
    }>("/api/v1/playground/run", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---------------- Model Catalog ----------------
  async listModels(params: { search?: string; provider?: string; limit?: number; offset?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.provider) query.set("provider", params.provider);
    if (params.limit) query.set("limit", params.limit.toString());
    if (params.offset) query.set("offset", params.offset.toString());
    return this.request<{ total: number; models: import("@/types").CatalogModel[] }>(`/api/v1/models/?${query.toString()}`);
  }

  async getModelPricing(modelId: string) {
    return this.request<import("@/types").ModelPricingInfo>(`/api/v1/models/${encodeURIComponent(modelId)}/pricing`);
  }

  async syncCatalog() {
    return this.request<import("@/types").CatalogSyncResult>("/api/v1/models/sync", { method: "POST" });
  }

  async listProviders() {
    return this.request<import("@/types").ProviderInfo[]>("/api/v1/models/providers");
  }
}

export const api = new ApiClient();

