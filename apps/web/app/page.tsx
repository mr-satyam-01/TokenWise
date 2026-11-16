"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import {
  OverviewMetrics,
  VolumePoint,
  CostPoint,
  TokenPoint,
  ModelDistribution,
  LLMRequestItem,
} from "@/types";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  Coins,
  Cpu,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";

const MODEL_COLORS = ["#E98945", "#F4A261", "#D97732", "#77716B", "#2F7D57"];

export default function OverviewDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [timeRange, setTimeRange] = useState("7d");
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [volumeData, setVolumeData] = useState<VolumePoint[]>([]);
  const [costData, setCostData] = useState<CostPoint[]>([]);
  const [tokenData, setTokenData] = useState<TokenPoint[]>([]);
  const [modelData, setModelData] = useState<ModelDistribution[]>([]);
  const [recentErrors, setRecentErrors] = useState<LLMRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [m, v, c, t, models, errs] = await Promise.all([
        api.getOverviewMetrics(timeRange),
        api.getVolumeTimeline(timeRange),
        api.getCostTimeline(timeRange),
        api.getTokenTimeline(timeRange),
        api.getModelDistribution(timeRange),
        api.listRequests({ status: "error", page_size: 5 }),
      ]);
      setMetrics(m);
      setVolumeData(v);
      setCostData(c);
      setTokenData(t);
      setModelData(models);
      setRecentErrors(errs.items);
    } catch (e) {
      console.error("Failed to load dashboard analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, timeRange]);

  const isEmpty = !loading && metrics && metrics.total_requests === 0;

  const quickCurlSnippet = `curl https://api.tokenwise.ai/v1/chat/completions \\
  -H "Authorization: Bearer <YOUR_TW_KEY>" \\
  -H "x-provider-api-key: <OPENAI_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello TokenWise!"}]
  }'`;

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Overview Analytics"
          subtitle="Real-time LLM telemetry, cost allocation, and performance metrics"
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />

        <div className="p-8 space-y-8 flex-1 max-w-7xl">
          {/* Empty State / Onboarding Guide when no requests have arrived yet */}
          {isEmpty ? (
            <div className="bg-white/90 border border-[#E3DBD0] rounded-2xl p-10 shadow-2xs">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E98945]/15 text-[#D97732] text-xs font-semibold mb-4">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ready for Ingestion</span>
                </div>
                <h2 className="text-xl font-bold text-[#171717] tracking-tight">
                  Welcome to TokenWise! No requests recorded yet.
                </h2>
                <p className="text-xs text-[#77716B] leading-relaxed mt-2">
                  Connect your AI application in 2 minutes by changing your OpenAI base URL to
                  the TokenWise Gateway. All telemetry, token consumption, and cost estimates will
                  instantly populate this dashboard.
                </p>

                {/* Quick 3-Step Setup */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="p-4 rounded-xl bg-[#F5F0E8]/60 border border-[#E3DBD0]">
                    <div className="w-6 h-6 rounded-lg bg-[#EAE1D5] flex items-center justify-center text-xs font-bold text-[#171717] mb-2">
                      1
                    </div>
                    <div className="text-xs font-semibold text-[#171717]">Get API Key</div>
                    <div className="text-[11px] text-[#77716B] mt-1">
                      Navigate to Settings and generate your TokenWise secret key.
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#F5F0E8]/60 border border-[#E3DBD0]">
                    <div className="w-6 h-6 rounded-lg bg-[#EAE1D5] flex items-center justify-center text-xs font-bold text-[#171717] mb-2">
                      2
                    </div>
                    <div className="text-xs font-semibold text-[#171717]">Route Traffic</div>
                    <div className="text-[11px] text-[#77716B] mt-1">
                      Point base URL to <code className="text-[#D97732]">/v1</code> and pass your key.
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#F5F0E8]/60 border border-[#E3DBD0]">
                    <div className="w-6 h-6 rounded-lg bg-[#EAE1D5] flex items-center justify-center text-xs font-bold text-[#171717] mb-2">
                      3
                    </div>
                    <div className="text-xs font-semibold text-[#171717]">Observe Live</div>
                    <div className="text-[11px] text-[#77716B] mt-1">
                      Inspect token usage, latency, and full prompt & response logs.
                    </div>
                  </div>
                </div>

                {/* Integration snippet */}
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs font-semibold text-[#262626] mb-2">
                    <div className="flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-[#E98945]" />
                      <span>Quick Test Command</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(quickCurlSnippet);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="flex items-center gap-1 text-[11px] text-[#77716B] hover:text-[#171717] transition"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-[#2F7D57]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl bg-[#171717] text-[#F5F0E8] font-mono text-[11px] leading-relaxed overflow-x-auto">
                    {quickCurlSnippet}
                  </pre>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <Link
                    href="/settings"
                    className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold transition"
                  >
                    View API Keys
                  </Link>
                  <Link
                    href="/playground"
                    className="px-4 py-2 rounded-xl bg-[#EAE1D5] hover:bg-[#EAE1D5]/80 text-[#171717] text-xs font-semibold border border-[#E3DBD0] transition"
                  >
                    Try in Playground
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 5 Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Card 1: Total Requests */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs hover:border-[#D9D0C3] transition">
                  <div className="flex items-center justify-between text-[#77716B] mb-2">
                    <span className="text-xs font-medium">Total Requests</span>
                    <Activity className="w-4 h-4 text-[#E98945]" />
                  </div>
                  <div className="text-2xl font-bold text-[#171717] tabular-nums tracking-tight">
                    {loading ? "..." : metrics?.total_requests.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#77716B] mt-1 flex items-center gap-1">
                    <span>Monitored LLM calls</span>
                  </div>
                </div>

                {/* Card 2: Total Cost */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs hover:border-[#D9D0C3] transition">
                  <div className="flex items-center justify-between text-[#77716B] mb-2">
                    <span className="text-xs font-medium">Estimated Cost</span>
                    <Coins className="w-4 h-4 text-[#E98945]" />
                  </div>
                  <div className="text-2xl font-bold text-[#171717] tabular-nums tracking-tight">
                    {loading ? "..." : `$${metrics?.total_cost.toFixed(4)}`}
                  </div>
                  <div className="text-[11px] text-[#77716B] mt-1">
                    <span>Calculated model pricing</span>
                  </div>
                </div>

                {/* Card 3: Total Tokens */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs hover:border-[#D9D0C3] transition">
                  <div className="flex items-center justify-between text-[#77716B] mb-2">
                    <span className="text-xs font-medium">Total Tokens</span>
                    <Cpu className="w-4 h-4 text-[#E98945]" />
                  </div>
                  <div className="text-2xl font-bold text-[#171717] tabular-nums tracking-tight">
                    {loading ? "..." : metrics?.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#77716B] mt-1 flex items-center gap-1 tabular-nums">
                    <span>{metrics?.input_tokens.toLocaleString()} in</span>
                    <span>•</span>
                    <span>{metrics?.output_tokens.toLocaleString()} out</span>
                  </div>
                </div>

                {/* Card 4: Average Latency */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs hover:border-[#D9D0C3] transition">
                  <div className="flex items-center justify-between text-[#77716B] mb-2">
                    <span className="text-xs font-medium">Avg Latency</span>
                    <Clock className="w-4 h-4 text-[#E98945]" />
                  </div>
                  <div className="text-2xl font-bold text-[#171717] tabular-nums tracking-tight">
                    {loading
                      ? "..."
                      : (metrics?.avg_latency_ms || 0) > 1000
                      ? `${((metrics?.avg_latency_ms || 0) / 1000).toFixed(2)}s`
                      : `${metrics?.avg_latency_ms || 0}ms`}
                  </div>
                  <div className="text-[11px] text-[#77716B] mt-1">
                    <span>Upstream + Gateway turnaround</span>
                  </div>
                </div>

                {/* Card 5: Error Rate */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs hover:border-[#D9D0C3] transition">
                  <div className="flex items-center justify-between text-[#77716B] mb-2">
                    <span className="text-xs font-medium">Error Rate</span>
                    <AlertTriangle
                      className={`w-4 h-4 ${
                        (metrics?.error_rate || 0) > 0 ? "text-[#C94C4C]" : "text-[#2F7D57]"
                      }`}
                    />
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums tracking-tight ${
                      (metrics?.error_rate || 0) > 0 ? "text-[#C94C4C]" : "text-[#171717]"
                    }`}
                  >
                    {loading ? "..." : `${metrics?.error_rate}%`}
                  </div>
                  <div className="text-[11px] text-[#77716B] mt-1">
                    <span>HTTP 4xx / 5xx & timeouts</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Charts (Request Volume & Cost Over Time) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Request Volume Chart */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#171717]">Request Volume</h3>
                      <p className="text-[11px] text-[#77716B]">Requests and errors over time</p>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={volumeData}>
                        <defs>
                          <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E98945" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#E98945" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAE1D5" vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          tick={{ fontSize: 10, fill: "#77716B" }}
                          stroke="#E3DBD0"
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#77716B" }} stroke="#E3DBD0" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#171717",
                            borderRadius: "10px",
                            border: "none",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="requests"
                          stroke="#E98945"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#volGradient)"
                          name="Total Requests"
                        />
                        <Area
                          type="monotone"
                          dataKey="errors"
                          stroke="#C94C4C"
                          strokeWidth={2}
                          fill="none"
                          name="Errors"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Cost Over Time Chart */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#171717]">Cost Trend (USD)</h3>
                      <p className="text-[11px] text-[#77716B]">Aggregated estimated provider costs</p>
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={costData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAE1D5" vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          tick={{ fontSize: 10, fill: "#77716B" }}
                          stroke="#E3DBD0"
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#77716B" }}
                          stroke="#E3DBD0"
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#171717",
                            borderRadius: "10px",
                            border: "none",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                          formatter={(value: any) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="#D97732"
                          strokeWidth={2.5}
                          dot={{ fill: "#D97732", r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Row 3: Token Usage & Model Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stacked Token Chart */}
                <div className="lg:col-span-2 bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#171717]">Token Breakdown</h3>
                      <p className="text-[11px] text-[#77716B]">Input vs. Output tokens</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#E98945]" />
                        <span className="text-[#77716B]">Input</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[#262626]" />
                        <span className="text-[#77716B]">Output</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tokenData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EAE1D5" vertical={false} />
                        <XAxis
                          dataKey="timestamp"
                          tick={{ fontSize: 10, fill: "#77716B" }}
                          stroke="#E3DBD0"
                        />
                        <YAxis tick={{ fontSize: 10, fill: "#77716B" }} stroke="#E3DBD0" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#171717",
                            borderRadius: "10px",
                            border: "none",
                            color: "#fff",
                            fontSize: "12px",
                          }}
                        />
                        <Bar dataKey="input_tokens" stackId="a" fill="#E98945" name="Input Tokens" />
                        <Bar dataKey="output_tokens" stackId="a" fill="#262626" name="Output Tokens" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Model Distribution */}
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#171717]">Model Share</h3>
                    <p className="text-[11px] text-[#77716B]">Distribution by requested model</p>
                    <div className="mt-4 space-y-3">
                      {modelData.map((m, idx) => (
                        <div key={m.model} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-[#171717]">{m.model}</span>
                            <span className="text-[#77716B] font-mono">{m.percentage}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-[#EAE1D5] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${m.percentage}%`,
                                backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-[#77716B]">
                            <span>{m.requests} requests</span>
                            <span>${m.total_cost.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 4: Recent Errors Inspection */}
              {recentErrors.length > 0 && (
                <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#171717] flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#C94C4C]" />
                        <span>Recent Errors</span>
                      </h3>
                      <p className="text-[11px] text-[#77716B]">
                        Failed requests requiring debugging attention
                      </p>
                    </div>
                    <Link
                      href="/requests?status=error"
                      className="text-xs font-semibold text-[#E98945] hover:text-[#D97732] flex items-center gap-1 transition"
                    >
                      <span>View all errors</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="divide-y divide-[#E3DBD0]">
                    {recentErrors.map((err) => (
                      <div
                        key={err.id}
                        className="py-3 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-red-100 text-[#C94C4C] font-mono text-[10px] font-semibold">
                              {err.error_type || "error"}
                            </span>
                            <span className="font-semibold text-[#171717]">{err.model}</span>
                          </div>
                          <div className="text-[11px] text-[#77716B] font-mono">
                            ID: {err.request_id} • {new Date(err.created_at).toLocaleString()}
                          </div>
                        </div>
                        <Link
                          href={`/requests?search=${err.request_id}`}
                          className="px-2.5 py-1 rounded-lg bg-[#EAE1D5] hover:bg-[#EAE1D5]/80 text-[#171717] font-medium text-[11px] border border-[#E3DBD0] transition"
                        >
                          Inspect
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
