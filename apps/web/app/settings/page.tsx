"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ApiKey, Application } from "@/types";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  ShieldAlert,
  Terminal,
  Code2,
  Layers,
  Building2,
  AlertTriangle,
} from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const { user, currentOrg, applications, refreshData, isLoading: authLoading } = useAuth();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);

  // New key modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // New application modal
  const [showAppModal, setShowAppModal] = useState(false);
  const [appName, setAppName] = useState("");
  const [appEnv, setAppEnv] = useState("development");

  // Integration tab (curl vs python vs ts)
  const [activeTab, setActiveTab] = useState<"curl" | "python" | "typescript">("python");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const loadKeys = async () => {
    try {
      setLoadingKeys(true);
      const keys = await api.listApiKeys();
      setApiKeys(keys);
    } catch (e) {
      console.error("Failed to load API keys:", e);
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadKeys();
    }
  }, [user]);

  useEffect(() => {
    if (applications.length > 0 && !selectedAppId) {
      setSelectedAppId(applications[0].id);
    }
  }, [applications]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) return;
    try {
      const res = await api.createApiKey({
        name: keyName,
        application_id: selectedAppId,
      });
      if (res.key) {
        setNewlyCreatedKey(res.key);
      }
      setKeyName("");
      await loadKeys();
    } catch (e: any) {
      alert(e.message || "Failed to create API Key");
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Applications using it will immediately fail.")) {
      return;
    }
    try {
      await api.revokeApiKey(keyId);
      await loadKeys();
    } catch (e: any) {
      alert(e.message || "Failed to revoke API key");
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createApp({ name: appName, environment: appEnv });
      setShowAppModal(false);
      setAppName("");
      await refreshData();
    } catch (e: any) {
      alert(e.message || "Failed to create application");
    }
  };

  const pythonSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",  # Or your TokenWise Gateway URL
    api_key="tw-live_<YOUR_KEY>",         # TokenWise Secret Key
    default_headers={
        "x-provider-api-key": "sk-...",   # Upstream OpenAI Key (or set server-side)
        "x-tw-session-id": "chat-sess-1", # Optional workflow trace ID
        "x-tw-property-env": "production" # Optional custom property
    }
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Explain LLM observability."}]
)
print(response.choices[0].message.content)`;

  const tsSnippet = `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://localhost:8000/v1",
  apiKey: "tw-live_<YOUR_KEY>",
  defaultHeaders: {
    "x-provider-api-key": process.env.OPENAI_API_KEY,
    "x-tw-session-id": "session-cohort-101",
    "x-tw-property-environment": "production"
  }
});

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello TokenWise!" }]
});
console.log(response.choices[0].message.content);`;

  const curlSnippet = `curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Authorization: Bearer tw-live_<YOUR_KEY>" \\
  -H "x-provider-api-key: sk-proj-..." \\
  -H "x-tw-session-id: session-test-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Ping gateway"}]
  }'`;

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Project Settings"
          subtitle="Manage observability API credentials, multi-environment applications, and gateway routing"
          showTimeRange={false}
        />

        <div className="p-8 space-y-8 flex-1 max-w-5xl">
          {/* Section 1: API Keys */}
          <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3DBD0] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#E98945]" />
                  <span>Observability API Keys</span>
                </h3>
                <p className="text-xs text-[#77716B] mt-0.5">
                  Cryptographically hashed keys used by client applications to route traffic through TokenWise.
                </p>
              </div>
              <button
                onClick={() => {
                  setNewlyCreatedKey(null);
                  setShowKeyModal(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Key</span>
              </button>
            </div>

            <div className="divide-y divide-[#E3DBD0]">
              {loadingKeys ? (
                <div className="py-6 text-center text-xs text-[#77716B]">Loading keys...</div>
              ) : apiKeys.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#77716B]">
                  No active keys. Create a key to start observing LLM calls.
                </div>
              ) : (
                apiKeys.map((k) => (
                  <div key={k.id} className="py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#171717]">{k.name}</span>
                        {k.revoked_at ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-[#C94C4C]">
                            Revoked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-[#2F7D57]">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#77716B] font-mono mt-0.5 flex items-center gap-2">
                        <span>Prefix: {k.key_prefix}••••••••</span>
                        <span>•</span>
                        <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                        {k.last_used_at && (
                          <>
                            <span>•</span>
                            <span>Last used: {new Date(k.last_used_at).toLocaleTimeString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {!k.revoked_at && (
                      <button
                        onClick={() => handleRevokeKey(k.id)}
                        className="p-2 rounded-lg text-[#77716B] hover:text-[#C94C4C] hover:bg-red-50 transition"
                        title="Revoke key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 2: Integration Guide */}
          <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3DBD0] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#E98945]" />
                  <span>Gateway Integration Setup</span>
                </h3>
                <p className="text-xs text-[#77716B] mt-0.5">
                  Route requests in 1 line of code without refactoring your existing OpenAI SDK client.
                </p>
              </div>

              {/* Language switcher */}
              <div className="flex items-center bg-[#F5F0E8] p-1 rounded-xl border border-[#E3DBD0]">
                {(["python", "typescript", "curl"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                      activeTab === tab
                        ? "bg-white text-[#171717] shadow-2xs"
                        : "text-[#77716B] hover:text-[#171717]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  const code =
                    activeTab === "python"
                      ? pythonSnippet
                      : activeTab === "typescript"
                      ? tsSnippet
                      : curlSnippet;
                  navigator.clipboard.writeText(code);
                  setCopiedSnippet(true);
                  setTimeout(() => setCopiedSnippet(false), 2000);
                }}
                className="absolute right-3 top-3 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[11px] font-medium flex items-center gap-1.5 transition z-10"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5 text-[#2F7D57]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? "Copied" : "Copy snippet"}</span>
              </button>

              <pre className="p-5 rounded-xl bg-[#171717] text-[#F5F0E8] font-mono text-xs leading-relaxed overflow-x-auto">
                {activeTab === "python" && pythonSnippet}
                {activeTab === "typescript" && tsSnippet}
                {activeTab === "curl" && curlSnippet}
              </pre>
            </div>
          </div>

          {/* Section 3: Applications & Environments */}
          <div className="bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3DBD0] pb-4">
              <div>
                <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#E98945]" />
                  <span>Applications & Environments</span>
                </h3>
                <p className="text-xs text-[#77716B] mt-0.5">
                  Isolate production workloads from staging and local developer testing.
                </p>
              </div>
              <button
                onClick={() => setShowAppModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#EAE1D5] hover:bg-[#EAE1D5]/80 text-[#171717] text-xs font-semibold border border-[#E3DBD0] flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Application</span>
              </button>
            </div>

            <div className="divide-y divide-[#E3DBD0]">
              {applications.map((app) => (
                <div key={app.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[#171717]">{app.name}</span>
                    <span className="ml-2 px-2 py-0.5 rounded-md bg-[#F5F0E8] border border-[#E3DBD0] text-[10px] font-mono text-[#77716B]">
                      {app.environment}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#77716B]">
                    Content capture: {app.content_capture_enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Create Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E3DBD0] rounded-2xl p-6 w-full max-w-md shadow-xl">
            {newlyCreatedKey ? (
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-[#D97732] mx-auto">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold text-[#171717]">
                    Save Your API Secret Key
                  </h3>
                  <p className="text-xs text-[#77716B] mt-1 leading-relaxed">
                    This key will <span className="font-bold text-[#C94C4C]">never be shown again</span>. Please copy and store it securely in your secret manager.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#F5F0E8] border border-[#E3DBD0] flex items-center justify-between font-mono text-xs">
                  <span className="truncate text-[#171717] select-all mr-2">
                    {newlyCreatedKey}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(newlyCreatedKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="p-1.5 rounded-lg bg-white border border-[#E3DBD0] hover:bg-[#EAE1D5] transition"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-[#2F7D57]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  onClick={() => setShowKeyModal(false)}
                  className="w-full py-2.5 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold transition"
                >
                  I Have Stored the Key
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateKey} className="space-y-4">
                <h3 className="text-sm font-bold text-[#171717]">Create Observability Key</h3>
                <div>
                  <label className="block text-xs font-semibold text-[#262626] mb-1">
                    Key Identifier Name
                  </label>
                  <input
                    type="text"
                    required
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. Production Server Key"
                    className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#262626] mb-1">
                    Target Application
                  </label>
                  <select
                    value={selectedAppId}
                    onChange={(e) => setSelectedAppId(e.target.value)}
                    className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717]"
                  >
                    {applications.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.environment})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="px-3.5 py-2 rounded-xl border border-[#E3DBD0] text-xs font-medium text-[#77716B] hover:bg-[#F5F0E8] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold transition"
                  >
                    Generate Key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Application Modal */}
      {showAppModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E3DBD0] rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-sm font-bold text-[#171717] mb-4">Add Application</h3>
            <form onSubmit={handleCreateApp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Application Name
                </label>
                <input
                  type="text"
                  required
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="e.g. Chatbot Service"
                  className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Environment
                </label>
                <select
                  value={appEnv}
                  onChange={(e) => setAppEnv(e.target.value)}
                  className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717]"
                >
                  <option value="production">production</option>
                  <option value="staging">staging</option>
                  <option value="development">development</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAppModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#E3DBD0] text-xs font-medium text-[#77716B] hover:bg-[#F5F0E8] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold transition"
                >
                  Create Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
