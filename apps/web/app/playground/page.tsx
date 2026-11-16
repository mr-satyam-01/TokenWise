"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CatalogModel, ModelPricingInfo } from "@/types";
import {
  Sparkles,
  Play,
  Clock,
  Coins,
  Cpu,
  AlertCircle,
  Zap,
  Layers,
  Info,
} from "lucide-react";

export default function PlaygroundPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [availableModels, setAvailableModels] = useState<CatalogModel[]>([]);
  const [model, setModel] = useState("openai/gpt-4o");
  const [modelPricing, setModelPricing] = useState<ModelPricingInfo | null>(null);

  const [systemPrompt, setSystemPrompt] = useState(
    "You are a helpful and precise software architecture assistant."
  );
  const [userPrompt, setUserPrompt] = useState(
    "Compare gateway proxy vs SDK telemetry sidecars for high-throughput LLM observability."
  );
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(800);

  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{
    output: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    latency_ms: number;
    estimated_cost: number;
    model: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Load models catalog
  useEffect(() => {
    if (user) {
      api.listModels().then((res) => {
        if (res && res.models && res.models.length > 0) {
          setAvailableModels(res.models);
          // Set first model as default if current is not in list
          if (!res.models.some((m) => m.id === model)) {
            setModel(res.models[0].id);
          }
        }
      }).catch((e) => {
        console.error("Failed to load catalog models:", e);
      });
    }
  }, [user]);

  // Load pricing info for selected model
  useEffect(() => {
    if (user && model) {
      api.getModelPricing(model).then((p) => {
        setModelPricing(p);
      }).catch(() => {
        setModelPricing(null);
      });
    }
  }, [user, model]);

  const handleRun = async () => {
    setExecuting(true);
    setError(null);
    try {
      const messages = [];
      if (systemPrompt.trim()) {
        messages.push({ role: "system", content: systemPrompt.trim() });
      }
      if (userPrompt.trim()) {
        messages.push({ role: "user", content: userPrompt.trim() });
      }

      const res = await api.runPlayground({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Failed to execute playground prompt");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Prompt Playground"
          subtitle="Safely experiment with prompt designs across OpenRouter models, inspect latency and token costs"
          showTimeRange={false}
        />

        <div className="p-8 space-y-6 flex-1 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input & Parameters Column */}
            <div className="lg:col-span-6 space-y-4">
              {/* Controls bar */}
              <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#77716B] uppercase mb-1">
                      Model
                    </label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="text-xs bg-[#F5F0E8]/60 border border-[#E3DBD0] rounded-xl px-3 py-1.5 font-semibold text-[#171717] focus:outline-none"
                    >
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
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#77716B] uppercase mb-1">
                      Temperature ({temperature})
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="accent-[#E98945] w-20 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#77716B] uppercase mb-1">
                      Max Tokens
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="4000"
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value) || 500)}
                      className="w-20 text-xs bg-[#F5F0E8]/60 border border-[#E3DBD0] rounded-xl px-2.5 py-1 font-mono text-[#171717]"
                    />
                  </div>
                </div>

                <button
                  onClick={handleRun}
                  disabled={executing}
                  className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{executing ? "Generating..." : "Execute Test"}</span>
                </button>
              </div>

              {/* Pricing Indicator Banner */}
              {modelPricing && (
                <div className="bg-white/60 border border-[#E3DBD0] rounded-xl px-4 py-2 flex items-center justify-between text-[11px] text-[#77716B]">
                  <div className="flex items-center gap-2">
                    <Coins className="w-3.5 h-3.5 text-[#E98945]" />
                    <span className="font-medium text-[#171717]">Catalog Rate:</span>
                    <span>Prompt: <strong className="text-[#171717]">${modelPricing.input_price_per_million.toFixed(2)}</strong> / 1M</span>
                    <span>•</span>
                    <span>Completion: <strong className="text-[#171717]">${modelPricing.output_price_per_million.toFixed(2)}</strong> / 1M</span>
                  </div>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#EAE1D5] text-[#77716B]">
                    v{modelPricing.version}
                  </span>
                </div>
              )}

              {/* System Prompt */}
              <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs space-y-2">
                <label className="block text-xs font-bold text-[#171717]">
                  System Prompt
                </label>
                <textarea
                  rows={3}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Set role instructions and behaviors..."
                  className="w-full text-xs font-mono bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl p-3 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 resize-none leading-relaxed"
                />
              </div>

              {/* User Prompt */}
              <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-5 shadow-2xs space-y-2">
                <label className="block text-xs font-bold text-[#171717]">
                  User Input
                </label>
                <textarea
                  rows={6}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Enter user inquiry or task..."
                  className="w-full text-xs font-mono bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl p-3 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Results Column */}
            <div className="lg:col-span-6 bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="border-b border-[#E3DBD0] pb-3 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#E98945]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#171717]">
                      Execution Telemetry & Output
                    </h3>
                  </div>
                  {result && (
                    <span className="text-[11px] font-mono text-[#2F7D57] font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                      Done
                    </span>
                  )}
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#C94C4C] font-medium flex items-center gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Live Telemetry Pill Bar */}
                {result && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="p-2.5 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                      <div className="text-[10px] text-[#77716B]">Latency</div>
                      <div className="text-xs font-bold text-[#171717] font-mono">
                        {result.latency_ms}ms
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                      <div className="text-[10px] text-[#77716B]">Cost</div>
                      <div className="text-xs font-bold text-[#171717] font-mono">
                        ${result.estimated_cost.toFixed(5)}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                      <div className="text-[10px] text-[#77716B]">In Tokens</div>
                      <div className="text-xs font-bold text-[#171717] font-mono">
                        {result.input_tokens}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F5F0E8]/70 border border-[#E3DBD0]">
                      <div className="text-[10px] text-[#77716B]">Out Tokens</div>
                      <div className="text-xs font-bold text-[#171717] font-mono">
                        {result.output_tokens}
                      </div>
                    </div>
                  </div>
                )}

                {/* Output text */}
                <div className="p-4 rounded-xl bg-[#F5F0E8]/50 border border-[#E3DBD0] font-mono text-xs text-[#171717] min-h-[280px] max-h-[380px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {executing ? (
                    <div className="flex items-center gap-2 text-[#77716B]">
                      <span className="w-2 h-2 rounded-full bg-[#E98945] animate-ping" />
                      <span>Dispatching through OpenRouter gateway...</span>
                    </div>
                  ) : result ? (
                    result.output
                  ) : (
                    <span className="text-[#77716B] italic">
                      Output and token telemetry will stream here after execution...
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E3DBD0] flex items-center justify-between text-[11px] text-[#77716B]">
                <span>TokenWise Gateway v2.0 • Dynamic Cost Engine</span>
                {result && <span className="font-mono text-[#171717]">Model: {result.model}</span>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
