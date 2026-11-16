"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CatalogModel, ProviderInfo, ModelPricingInfo } from "@/types";
import {
  Box,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Cpu,
  DollarSign,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Zap,
  Hash,
  ArrowUpDown,
} from "lucide-react";

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a06e",
  google: "#4285f4",
  "meta-llama": "#0084ff",
  mistralai: "#f24822",
  deepseek: "#4d6bfe",
  cohere: "#39594d",
  "x-ai": "#000000",
  microsoft: "#00a4ef",
  nvidia: "#76b900",
  qwen: "#6d28d9",
};

function getProviderColor(provider?: string): string {
  if (!provider) return "#77716B";
  return PROVIDER_COLORS[provider.toLowerCase()] || "#77716B";
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  if (price === 0) return "Free";
  if (price < 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function formatContext(length: number | null | undefined): string {
  if (!length) return "—";
  if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
  if (length >= 1000) return `${Math.round(length / 1000)}K`;
  return length.toString();
}

export default function ModelsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [models, setModels] = useState<CatalogModel[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [pricingData, setPricingData] = useState<Record<string, ModelPricingInfo>>({});
  const [sortBy, setSortBy] = useState<"name" | "context" | "provider">("provider");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const [modelsRes, providersRes] = await Promise.all([
        api.listModels({ search: searchQuery || undefined, provider: selectedProvider || undefined, limit: 500 }),
        api.listProviders(),
      ]);
      setModels(modelsRes.models);
      setTotal(modelsRes.total);
      setProviders(providersRes);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchModels();
    }
  }, [user, searchQuery, selectedProvider]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncCatalog();
      await fetchModels();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleExpandModel = async (modelId: string) => {
    if (expandedModel === modelId) {
      setExpandedModel(null);
      return;
    }
    setExpandedModel(modelId);
    if (!pricingData[modelId]) {
      try {
        const pricing = await api.getModelPricing(modelId);
        setPricingData((prev) => ({ ...prev, [modelId]: pricing }));
      } catch {
        // No pricing available
      }
    }
  };

  const sortedModels = useMemo(() => {
    const sorted = [...models];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "context":
        sorted.sort((a, b) => (b.context_length || 0) - (a.context_length || 0));
        break;
      case "provider":
        sorted.sort((a, b) => (a.provider_name || "").localeCompare(b.provider_name || ""));
        break;
    }
    return sorted;
  }, [models, sortBy]);

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F5F0E8]">
        <div className="animate-pulse text-[#77716B] text-sm font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#FAFAF7]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Model Catalog" />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E98945] to-[#D97732] flex items-center justify-center text-white shadow-sm">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#171717]">Models & Pricing</h1>
                <p className="text-xs text-[#77716B]">
                  {total} models synced from OpenRouter • {providers.length} providers
                </p>
              </div>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171717] text-white text-xs font-semibold hover:bg-[#262626] transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Catalog"}
            </button>
          </div>

          {/* Provider Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedProvider("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                !selectedProvider
                  ? "bg-[#171717] text-white border-[#171717]"
                  : "bg-white text-[#262626] border-[#E3DBD0] hover:bg-[#F5F0E8]"
              }`}
            >
              All Providers
            </button>
            {providers.slice(0, 12).map((p) => (
              <button
                key={p.provider}
                onClick={() => setSelectedProvider(selectedProvider === p.provider ? "" : p.provider)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border flex items-center gap-1.5 ${
                  selectedProvider === p.provider
                    ? "bg-[#171717] text-white border-[#171717]"
                    : "bg-white text-[#262626] border-[#E3DBD0] hover:bg-[#F5F0E8]"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getProviderColor(p.provider) }}
                />
                {p.provider}
                <span className="text-[10px] opacity-60">({p.model_count})</span>
              </button>
            ))}
          </div>

          {/* Search + Sort Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#77716B]" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E3DBD0] bg-white text-xs text-[#262626] placeholder:text-[#77716B]/60 focus:outline-none focus:ring-2 focus:ring-[#E98945]/30 focus:border-[#E98945] transition"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#77716B]">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-white border border-[#E3DBD0] rounded-lg px-2 py-1.5 text-xs text-[#262626] focus:outline-none"
              >
                <option value="provider">Sort by Provider</option>
                <option value="name">Sort by Name</option>
                <option value="context">Sort by Context</option>
              </select>
            </div>
          </div>

          {/* Models Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-pulse text-[#77716B] text-sm">Loading models...</div>
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#EAE1D5] flex items-center justify-center">
                <Box className="w-8 h-8 text-[#77716B]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#171717]">No Models Synced</p>
                <p className="text-xs text-[#77716B] mt-1 max-w-md">
                  Click "Sync Catalog" to fetch available models from OpenRouter.
                  You need to set <code className="bg-[#EAE1D5] px-1 py-0.5 rounded text-[10px]">OPENROUTER_API_KEY</code> in your server environment.
                </p>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-4 py-2 rounded-xl bg-[#E98945] text-white text-xs font-semibold hover:bg-[#D97732] transition"
              >
                {syncing ? "Syncing..." : "Sync Catalog Now"}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E3DBD0] overflow-hidden shadow-xs">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3 border-b border-[#E3DBD0] bg-[#FAFAF7]">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B]">Model</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B]">Provider</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B] text-right">Context</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B] text-right">Modality</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B] text-center">Status</span>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-[#E3DBD0]/60 max-h-[calc(100vh-350px)] overflow-y-auto">
                {sortedModels.map((model) => (
                  <React.Fragment key={model.id}>
                    <div
                      onClick={() => handleExpandModel(model.id)}
                      className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3.5 items-center cursor-pointer hover:bg-[#FAFAF7] transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronRight
                          className={`w-3.5 h-3.5 text-[#77716B] shrink-0 transition-transform ${
                            expandedModel === model.id ? "rotate-90" : ""
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#171717] truncate">{model.name}</div>
                          <div className="text-[10px] text-[#77716B] font-mono truncate">{model.id}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getProviderColor(model.provider_name) }}
                        />
                        <span className="text-xs text-[#262626] font-medium truncate">
                          {model.provider_name || "—"}
                        </span>
                      </div>
                      <div className="text-xs text-[#262626] text-right font-mono">
                        {formatContext(model.context_length)}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#EAE1D5] text-[#262626] font-medium">
                          {model.modalities || "text→text"}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        {model.is_active ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Pricing Detail */}
                    {expandedModel === model.id && (
                      <div className="px-5 py-4 bg-[#FAFAF7] border-t border-[#E3DBD0]/40">
                        <div className="grid grid-cols-2 gap-6 ml-7">
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B]">
                              Model Details
                            </h4>
                            <p className="text-xs text-[#262626] leading-relaxed">
                              {model.description || "No description available."}
                            </p>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="flex items-center gap-1.5 text-[#77716B]">
                                <Hash className="w-3 h-3" />
                                ID: <code className="text-[#262626] font-mono">{model.id}</code>
                              </span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-[10px] uppercase tracking-wider font-semibold text-[#77716B]">
                              Pricing (per 1M tokens)
                            </h4>
                            {pricingData[model.id] ? (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white rounded-xl border border-[#E3DBD0] p-3">
                                  <div className="text-[10px] text-[#77716B] font-medium">Input</div>
                                  <div className="text-sm font-bold text-[#171717]">
                                    {formatPrice(pricingData[model.id].input_price_per_million)}
                                  </div>
                                </div>
                                <div className="bg-white rounded-xl border border-[#E3DBD0] p-3">
                                  <div className="text-[10px] text-[#77716B] font-medium">Output</div>
                                  <div className="text-sm font-bold text-[#171717]">
                                    {formatPrice(pricingData[model.id].output_price_per_million)}
                                  </div>
                                </div>
                                {pricingData[model.id].cached_input_price_per_million != null && (
                                  <div className="bg-white rounded-xl border border-[#E3DBD0] p-3">
                                    <div className="text-[10px] text-[#77716B] font-medium">Cached Input</div>
                                    <div className="text-sm font-bold text-[#171717]">
                                      {formatPrice(pricingData[model.id].cached_input_price_per_million)}
                                    </div>
                                  </div>
                                )}
                                {pricingData[model.id].reasoning_price_per_million != null && (
                                  <div className="bg-white rounded-xl border border-[#E3DBD0] p-3">
                                    <div className="text-[10px] text-[#77716B] font-medium">Reasoning</div>
                                    <div className="text-sm font-bold text-[#171717]">
                                      {formatPrice(pricingData[model.id].reasoning_price_per_million)}
                                    </div>
                                  </div>
                                )}
                                <div className="col-span-2 flex items-center gap-2 text-[10px] text-[#77716B]">
                                  <span>Source: {pricingData[model.id].pricing_source}</span>
                                  <span>•</span>
                                  <span>Version {pricingData[model.id].version}</span>
                                  <span>•</span>
                                  <span className={
                                    pricingData[model.id].validation_status === "valid"
                                      ? "text-emerald-600"
                                      : "text-amber-600"
                                  }>
                                    {pricingData[model.id].validation_status}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-[#77716B] italic">
                                No pricing data available. Run a catalog sync first.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
