"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { LLMRequestItem, LLMRequestDetail, PaginatedRequests, CatalogModel } from "@/types";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  Layers,
  Zap,
  RotateCw,
  Coins,
  BrainCircuit,
  Radio,
} from "lucide-react";
import Link from "next/link";

export default function RequestExplorerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center text-xs text-[#77716B]">Loading Request Explorer...</div>}>
      <RequestExplorerContent />
    </Suspense>
  );
}

function RequestExplorerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [requestsData, setRequestsData] = useState<PaginatedRequests | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<LLMRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<CatalogModel[]>([]);

  // Filter state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [modelFilter, setModelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [sessionFilter, setSessionFilter] = useState(searchParams.get("session_id") || "");
  const [timeRange, setTimeRange] = useState("all");
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Load models catalog for the filter dropdown
  useEffect(() => {
    if (user) {
      api.listModels().then((res) => {
        if (res && res.models) {
          setAvailableModels(res.models);
        }
      }).catch((e) => {
        console.error("Failed to load catalog models for filter:", e);
      });
    }
  }, [user]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await api.listRequests({
        page,
        page_size: pageSize,
        search: search || undefined,
        model: modelFilter || undefined,
        status: statusFilter || undefined,
        session_id: sessionFilter || undefined,
        time_range: timeRange !== "all" ? timeRange : undefined,
      });
      setRequestsData(res);
    } catch (e) {
      console.error("Failed to load requests:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadRequests();
    }
  }, [user, page, pageSize, modelFilter, statusFilter, sessionFilter, timeRange]);

  const handleRowClick = async (req: LLMRequestItem) => {
    setDetailLoading(true);
    try {
      const detail = await api.getRequestDetail(req.request_id);
      setSelectedRequest(detail);
    } catch (e) {
      console.error("Failed to load request detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRequests();
  };

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Request Explorer"
          subtitle="Real-time log of all LLM prompts, completions, routing, and dynamic pricing telemetry"
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          showTimeRange={true}
        />

        <div className="p-8 space-y-6 flex-1 max-w-7xl">
          {/* Controls & Filter Bar */}
          <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
              {/* Search input */}
              <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-[#77716B] absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by request ID, user, or prompt name..."
                  className="w-full text-xs bg-[#F5F0E8]/50 border border-[#E3DBD0] rounded-xl pl-9 pr-4 py-2.5 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
                />
              </form>

              {/* Quick Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Model dropdown */}
                <select
                  value={modelFilter}
                  onChange={(e) => {
                    setModelFilter(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs bg-[#F5F0E8]/50 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#262626] font-medium focus:outline-none"
                >
                  <option value="">All Models</option>
                  {availableModels.length > 0 ? (
                    availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="openai/gpt-4o">openai/gpt-4o</option>
                      <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                      <option value="anthropic/claude-3.5-sonnet">anthropic/claude-3.5-sonnet</option>
                      <option value="meta-llama/llama-3.3-70b-instruct">meta-llama/llama-3.3-70b-instruct</option>
                    </>
                  )}
                </select>

                {/* Status dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs bg-[#F5F0E8]/50 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#262626] font-medium focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="success">Success (200 OK)</option>
                  <option value="error">Errors (4xx / 5xx)</option>
                </select>

                {/* Clear filters if any */}
                {(modelFilter || statusFilter || search || sessionFilter) && (
                  <button
                    onClick={() => {
                      setModelFilter("");
                      setStatusFilter("");
                      setSearch("");
                      setSessionFilter("");
                      setPage(1);
                    }}
                    className="text-xs font-semibold text-[#E98945] hover:text-[#D97732] px-2 py-1 transition"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Requests Table */}
          <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E3DBD0] bg-[#F5F0E8]/50 text-[#77716B] font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Request ID</th>
                    <th className="py-3 px-4">Provider / Model</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Session</th>
                    <th className="py-3 px-4 text-right">Tokens</th>
                    <th className="py-3 px-4 text-right">Latency</th>
                    <th className="py-3 px-4 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DBD0]">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-[#77716B]">
                        Loading requests telemetry...
                      </td>
                    </tr>
                  ) : requestsData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-xs text-[#77716B]">
                        No matching requests found for current filters.
                      </td>
                    </tr>
                  ) : (
                    requestsData?.items.map((req) => (
                      <tr
                        key={req.id}
                        onClick={() => handleRowClick(req)}
                        className="hover:bg-[#EAE1D5]/40 transition-colors cursor-pointer select-none"
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          {req.status === "success" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-[#2F7D57]">
                              200 OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-[#C94C4C]">
                              {req.error_type || "Error"}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#77716B] font-mono text-[11px] whitespace-nowrap">
                          {new Date(req.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-[#171717] whitespace-nowrap">
                          {req.request_id.slice(0, 16)}...
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#EAE1D5] text-[#77716B] uppercase">
                                {req.provider || "openrouter"}
                              </span>
                              <span className="font-semibold text-[#171717]">{req.model}</span>
                              {req.is_streaming && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                                  stream
                                </span>
                              )}
                            </div>
                            {req.resolved_model && req.resolved_model !== req.model && (
                              <div className="text-[10px] text-[#77716B] font-mono flex items-center gap-1">
                                <span>↳ {req.resolved_model}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#77716B] whitespace-nowrap font-mono text-[11px]">
                          {req.user_id || "—"}
                        </td>
                        <td className="py-3 px-4 text-[#77716B] whitespace-nowrap font-mono text-[11px]">
                          {req.session_id ? (
                            <span className="px-1.5 py-0.5 bg-[#EAE1D5] rounded text-[#171717]">
                              {req.session_id}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap font-mono text-[#262626]">
                          <div>{req.total_tokens.toLocaleString()}</div>
                          {((req.cached_input_tokens || 0) > 0 || (req.reasoning_tokens || 0) > 0) && (
                            <div className="flex items-center justify-end gap-1 text-[9px] text-[#77716B] mt-0.5">
                              {(req.cached_input_tokens || 0) > 0 && (
                                <span className="text-emerald-700 bg-emerald-50 px-1 rounded">
                                  ⚡{req.cached_input_tokens}
                                </span>
                              )}
                              {(req.reasoning_tokens || 0) > 0 && (
                                <span className="text-purple-700 bg-purple-50 px-1 rounded">
                                  🧠{req.reasoning_tokens}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap font-mono text-[#77716B]">
                          {req.latency_ms > 1000
                            ? `${(req.latency_ms / 1000).toFixed(2)}s`
                            : `${req.latency_ms.toFixed(0)}ms`}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap font-mono font-medium text-[#171717]">
                          <div>${req.estimated_cost.toFixed(4)}</div>
                          {req.cost_status && req.cost_status !== "calculated" && (
                            <div className="text-[9px] text-[#D97732] uppercase">
                              {req.cost_status}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {requestsData && requestsData.total_pages > 1 && (
              <div className="p-4 border-t border-[#E3DBD0] flex items-center justify-between text-xs text-[#77716B]">
                <div>
                  Showing page <span className="font-semibold text-[#171717]">{requestsData.page}</span> of{" "}
                  <span className="font-semibold text-[#171717]">{requestsData.total_pages}</span> (
                  {requestsData.total} total)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-lg border border-[#E3DBD0] hover:bg-[#EAE1D5] transition disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= requestsData.total_pages}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-lg border border-[#E3DBD0] hover:bg-[#EAE1D5] transition disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Request Detail Drawer */}
      {selectedRequest && (
        <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-[#E3DBD0] shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="p-6 border-b border-[#E3DBD0] flex items-center justify-between bg-[#F5F0E8]/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    selectedRequest.status === "success"
                      ? "bg-emerald-100 text-[#2F7D57]"
                      : "bg-red-100 text-[#C94C4C]"
                  }`}
                >
                  {selectedRequest.status.toUpperCase()}
                </span>
                <span className="font-bold text-[#171717] text-sm">
                  {selectedRequest.model}
                </span>
                {selectedRequest.is_streaming && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                    streaming
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#77716B] font-mono">
                <span>{selectedRequest.request_id}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedRequest.request_id);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                  className="hover:text-[#171717] transition"
                  title="Copy Request ID"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-[#2F7D57]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <button
              onClick={() => setSelectedRequest(null)}
              className="p-2 rounded-xl text-[#77716B] hover:text-[#171717] hover:bg-[#EAE1D5] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Metric pill bar */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                <div className="text-[10px] text-[#77716B] font-medium">Latency</div>
                <div className="text-sm font-bold text-[#171717] font-mono mt-0.5">
                  {selectedRequest.latency_ms > 1000
                    ? `${(selectedRequest.latency_ms / 1000).toFixed(2)}s`
                    : `${selectedRequest.latency_ms.toFixed(0)}ms`}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                <div className="text-[10px] text-[#77716B] font-medium">Estimated Cost</div>
                <div className="text-sm font-bold text-[#171717] font-mono mt-0.5">
                  ${selectedRequest.estimated_cost.toFixed(5)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                <div className="text-[10px] text-[#77716B] font-medium">Input Tokens</div>
                <div className="text-sm font-bold text-[#171717] font-mono mt-0.5">
                  {selectedRequest.input_tokens.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                <div className="text-[10px] text-[#77716B] font-medium">Output Tokens</div>
                <div className="text-sm font-bold text-[#171717] font-mono mt-0.5">
                  {selectedRequest.output_tokens.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Model & Routing Details */}
            <div className="p-4 rounded-xl bg-[#F5F0E8]/40 border border-[#E3DBD0] space-y-2 text-xs">
              <h4 className="text-[11px] font-bold text-[#77716B] uppercase tracking-wider">
                Routing & Cost Intelligence
              </h4>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[#77716B]">Provider:</span>{" "}
                  <span className="font-semibold text-[#171717] capitalize">
                    {selectedRequest.provider || "OpenRouter"}
                  </span>
                </div>
                <div>
                  <span className="text-[#77716B]">Cost Status:</span>{" "}
                  <span className="font-mono text-[#D97732] font-semibold uppercase">
                    {selectedRequest.cost_status || "calculated"}
                  </span>
                </div>
                <div>
                  <span className="text-[#77716B]">Requested Model:</span>{" "}
                  <span className="font-mono text-[#171717] font-medium">
                    {selectedRequest.model}
                  </span>
                </div>
                <div>
                  <span className="text-[#77716B]">Resolved Model:</span>{" "}
                  <span className="font-mono text-[#171717] font-medium">
                    {selectedRequest.resolved_model || selectedRequest.model}
                  </span>
                </div>
                {(selectedRequest.cached_input_tokens || 0) > 0 && (
                  <div>
                    <span className="text-[#77716B]">Cached Tokens:</span>{" "}
                    <span className="font-mono text-emerald-700 font-semibold">
                      {selectedRequest.cached_input_tokens?.toLocaleString()}
                    </span>
                  </div>
                )}
                {(selectedRequest.reasoning_tokens || 0) > 0 && (
                  <div>
                    <span className="text-[#77716B]">Reasoning Tokens:</span>{" "}
                    <span className="font-mono text-purple-700 font-semibold">
                      {selectedRequest.reasoning_tokens?.toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedRequest.provider_reported_cost !== undefined && selectedRequest.provider_reported_cost !== null && (
                  <div>
                    <span className="text-[#77716B]">Provider Cost:</span>{" "}
                    <span className="font-mono text-[#171717] font-medium">
                      ${selectedRequest.provider_reported_cost.toFixed(6)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Session Link if available */}
            {selectedRequest.session_id && (
              <div className="p-3 rounded-xl bg-[#EAE1D5]/50 border border-[#E3DBD0] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#171717]">Session Workflow:</span>
                  <span className="font-mono text-[#D97732]">{selectedRequest.session_id}</span>
                </div>
                <Link
                  href={`/sessions?session_id=${selectedRequest.session_id}`}
                  className="text-xs font-semibold text-[#E98945] hover:text-[#D97732] flex items-center gap-1"
                >
                  <span>Trace Timeline</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Input Content (Messages) */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#77716B] mb-2">
                Input Prompt / Messages
              </h3>
              <div className="p-4 rounded-xl bg-[#F5F0E8]/60 border border-[#E3DBD0] font-mono text-xs text-[#262626] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {selectedRequest.input_content || "Input content capture disabled or empty."}
              </div>
            </div>

            {/* Output Content (Completions) */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#77716B] mb-2">
                Provider Output
              </h3>
              <div className="p-4 rounded-xl bg-[#F5F0E8]/60 border border-[#E3DBD0] font-mono text-xs text-[#262626] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {selectedRequest.output_content || "Output content capture disabled or empty."}
              </div>
            </div>

            {/* Custom Metadata Properties */}
            {selectedRequest.properties && Object.keys(selectedRequest.properties).length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#77716B] mb-2">
                  Custom Request Properties
                </h3>
                <div className="divide-y divide-[#E3DBD0] border border-[#E3DBD0] rounded-xl overflow-hidden bg-white text-xs">
                  {Object.entries(selectedRequest.properties).map(([k, v]) => (
                    <div key={k} className="p-2.5 flex justify-between font-mono">
                      <span className="text-[#77716B]">{k}</span>
                      <span className="text-[#171717] font-semibold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
