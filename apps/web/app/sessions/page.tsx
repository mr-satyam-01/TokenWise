"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SessionItem, SessionDetail, LLMRequestItem } from "@/types";
import {
  Workflow,
  Clock,
  Coins,
  Cpu,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  Layers,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center text-xs text-[#77716B]">Loading Sessions...</div>}>
      <SessionsContent />
    </Suspense>
  );
}

function SessionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const list = await api.listSessions();
      setSessions(list);

      const targetId = searchParams.get("session_id");
      if (targetId && list.length > 0) {
        const found = list.find(
          (s) => s.external_session_id === targetId || s.id === targetId
        );
        if (found) {
          handleSelectSession(found.external_session_id);
        }
      } else if (list.length > 0) {
        handleSelectSession(list[0].external_session_id);
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = async (sessId: string) => {
    setDetailLoading(true);
    try {
      const detail = await api.getSessionDetail(sessId);
      setSelectedSession(detail);
    } catch (e) {
      console.error("Failed to load session detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Sessions & Workflow Tracing"
          subtitle="Group and trace multi-step LLM chains, agent loops, and conversational workflows"
          showTimeRange={false}
        />

        <div className="p-8 space-y-6 flex-1 max-w-7xl">
          {sessions.length === 0 && !loading ? (
            <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-10 text-center shadow-2xs">
              <Workflow className="w-10 h-10 text-[#E98945] mx-auto mb-3" />
              <h2 className="text-base font-bold text-[#171717]">No Sessions Observed Yet</h2>
              <p className="text-xs text-[#77716B] max-w-md mx-auto mt-1 leading-relaxed">
                Associate multi-turn requests with a session by passing the{" "}
                <code className="text-[#D97732] bg-[#EAE1D5] px-1 py-0.5 rounded font-mono">
                  x-tw-session-id
                </code>{" "}
                header in your API calls.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Session List Column */}
              <div className="lg:col-span-4 bg-white/80 border border-[#E3DBD0] rounded-2xl p-4 shadow-2xs space-y-2 h-[calc(100vh-12rem)] flex flex-col">
                <div className="font-semibold text-xs text-[#171717] px-2 py-1">
                  Active Workflow Sessions ({sessions.length})
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {sessions.map((s) => {
                    const isSelected =
                      selectedSession?.external_session_id === s.external_session_id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSession(s.external_session_id)}
                        className={`p-3.5 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? "bg-[#EAE1D5] border-[#D9D0C3] shadow-2xs"
                            : "bg-white/60 border-[#E3DBD0] hover:bg-[#EAE1D5]/40"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono font-semibold text-[#171717] truncate max-w-[180px]">
                            {s.external_session_id}
                          </span>
                          <span className="text-[10px] font-mono font-medium text-[#77716B]">
                            ${s.total_cost.toFixed(4)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#77716B]">
                          <span>{s.request_count} calls</span>
                          <span>{s.total_tokens.toLocaleString()} tokens</span>
                          {s.error_count > 0 ? (
                            <span className="text-[#C94C4C] font-semibold">{s.error_count} err</span>
                          ) : (
                            <span className="text-[#2F7D57]">100% OK</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Session Timeline Detail Column */}
              <div className="lg:col-span-8 bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs flex flex-col h-[calc(100vh-12rem)]">
                {selectedSession ? (
                  <>
                    {/* Header Summary */}
                    <div className="border-b border-[#E3DBD0] pb-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded-md bg-[#E98945]/15 text-[#D97732] text-[10px] font-bold uppercase">
                            Workflow Trace
                          </span>
                          <h2 className="font-mono text-sm font-bold text-[#171717]">
                            {selectedSession.external_session_id}
                          </h2>
                        </div>
                        <div className="text-[11px] text-[#77716B] font-mono">
                          User: {selectedSession.user_id || "anonymous"} • Started:{" "}
                          {new Date(selectedSession.started_at).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-[#77716B]">Total Cost</div>
                          <div className="text-sm font-bold text-[#171717] font-mono">
                            ${selectedSession.total_cost.toFixed(4)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-[#77716B]">Total Tokens</div>
                          <div className="text-sm font-bold text-[#171717] font-mono">
                            {selectedSession.total_tokens.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Chronological Waterfall Timeline */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                      <div className="text-xs font-semibold text-[#262626] mb-2">
                        Execution Sequence ({selectedSession.requests.length} steps)
                      </div>

                      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E3DBD0]">
                        {selectedSession.requests.map((step, idx) => (
                          <div key={step.id} className="relative group">
                            {/* Timeline bullet */}
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-white border-2 border-[#E98945] flex items-center justify-center text-[9px] font-bold text-[#D97732]">
                              {idx + 1}
                            </div>

                            {/* Step Card */}
                            <div className="p-4 rounded-xl bg-white/90 border border-[#E3DBD0] hover:border-[#D9D0C3] transition shadow-2xs">
                              <div className="flex items-center justify-between text-xs mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#171717]">{step.model}</span>
                                  {step.prompt_name && (
                                    <span className="px-1.5 py-0.5 rounded bg-[#EAE1D5] text-[10px] text-[#77716B] font-medium">
                                      {step.prompt_name}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    step.status === "success"
                                      ? "bg-emerald-100 text-[#2F7D57]"
                                      : "bg-red-100 text-[#C94C4C]"
                                  }`}
                                >
                                  {step.status === "success" ? "200 OK" : step.error_type}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-[11px] text-[#77716B] font-mono pt-2 border-t border-[#E3DBD0]/60">
                                <div>Latency: {step.latency_ms.toFixed(0)}ms</div>
                                <div>Tokens: {step.total_tokens}</div>
                                <div className="text-right">Cost: ${step.estimated_cost.toFixed(5)}</div>
                              </div>

                              <div className="mt-3 flex justify-end">
                                <Link
                                  href={`/requests?search=${step.request_id}`}
                                  className="text-[11px] font-semibold text-[#E98945] hover:text-[#D97732] flex items-center gap-1 transition"
                                >
                                  <span>Inspect Full Payload</span>
                                  <ChevronRight className="w-3 h-3" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-[#77716B]">
                    Select a session from the left column to view its execution timeline.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
