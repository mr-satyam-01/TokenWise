"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PromptItem, PromptVersion } from "@/types";
import {
  FileCode2,
  Plus,
  GitBranch,
  Clock,
  Sparkles,
  ChevronRight,
  Save,
  Radio,
  Check,
} from "lucide-react";
import Link from "next/link";

export default function PromptsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptItem | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);

  // New prompt modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptDesc, setNewPromptDesc] = useState("");
  const [newPromptTemplate, setNewPromptTemplate] = useState("");
  const [newPromptModel, setNewPromptModel] = useState("gpt-4o");

  // New version state
  const [editingTemplate, setEditingTemplate] = useState("");
  const [editingModel, setEditingModel] = useState("gpt-4o");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const list = await api.listPrompts();
      setPrompts(list);
      if (list.length > 0 && !selectedPrompt) {
        handleSelectPrompt(list[0]);
      }
    } catch (e) {
      console.error("Failed to load prompts:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrompt = async (p: PromptItem) => {
    setSelectedPrompt(p);
    try {
      const vers = await api.listPromptVersions(p.id);
      setVersions(vers);
      if (vers.length > 0) {
        setEditingTemplate(vers[0].template);
        setEditingModel(vers[0].model);
      }
    } catch (e) {
      console.error("Failed to load prompt versions:", e);
    }
  };

  useEffect(() => {
    if (user) {
      loadPrompts();
    }
  }, [user]);

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createPrompt({
        name: newPromptName,
        description: newPromptDesc,
        template: newPromptTemplate,
        model: newPromptModel,
      });
      setShowCreateModal(false);
      setNewPromptName("");
      setNewPromptDesc("");
      setNewPromptTemplate("");
      await loadPrompts();
      handleSelectPrompt(created);
    } catch (e: any) {
      alert(e.message || "Failed to create prompt");
    }
  };

  const handleSaveNewVersion = async () => {
    if (!selectedPrompt) return;
    try {
      const newV = await api.createPromptVersion(selectedPrompt.id, {
        template: editingTemplate,
        model: editingModel,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      const vers = await api.listPromptVersions(selectedPrompt.id);
      setVersions(vers);
    } catch (e: any) {
      alert(e.message || "Failed to save new version");
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header
          title="Prompt Management"
          subtitle="Maintain immutable prompt version lineage and observe associated production requests"
          showTimeRange={false}
        />

        <div className="p-8 space-y-6 flex-1 max-w-7xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#171717]">Prompt Catalog</h2>
              <p className="text-xs text-[#77716B]">
                Track iterations, generation models, and production request links
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Prompt</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Prompts list column */}
            <div className="lg:col-span-4 bg-white/80 border border-[#E3DBD0] rounded-2xl p-4 shadow-2xs space-y-2 h-[calc(100vh-14rem)] overflow-y-auto">
              {prompts.map((p) => {
                const isSelected = selectedPrompt?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPrompt(p)}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? "bg-[#EAE1D5] border-[#D9D0C3] shadow-2xs"
                        : "bg-white/60 border-[#E3DBD0] hover:bg-[#EAE1D5]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-[#171717]">{p.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-mono text-[#D97732] font-semibold border border-[#E3DBD0]">
                        v{p.latest_version?.version || 1}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#77716B] line-clamp-2 leading-relaxed">
                      {p.description || "No description provided."}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-[#77716B] mt-3 font-mono">
                      <span>{p.requests_count} calls</span>
                      <span>{p.versions_count} versions</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Prompt details & Version editor column */}
            <div className="lg:col-span-8 bg-white/80 border border-[#E3DBD0] rounded-2xl p-6 shadow-2xs flex flex-col h-[calc(100vh-14rem)] overflow-y-auto space-y-6">
              {selectedPrompt ? (
                <>
                  <div className="border-b border-[#E3DBD0] pb-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#171717]">
                          {selectedPrompt.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-[#E98945]/15 text-[#D97732] text-[10px] font-bold">
                          v{versions[0]?.version || 1} Latest
                        </span>
                      </div>
                      <p className="text-xs text-[#77716B] mt-0.5">
                        {selectedPrompt.description}
                      </p>
                    </div>

                    <Link
                      href={`/requests?search=${encodeURIComponent(selectedPrompt.name)}`}
                      className="text-xs font-semibold text-[#E98945] hover:text-[#D97732] flex items-center gap-1 transition"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>View Associated Requests</span>
                    </Link>
                  </div>

                  {/* Version history pills */}
                  <div>
                    <label className="block text-xs font-semibold text-[#262626] mb-2 flex items-center gap-1.5">
                      <GitBranch className="w-3.5 h-3.5 text-[#E98945]" />
                      <span>Immutable Version History</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setEditingTemplate(v.template);
                            setEditingModel(v.model);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#E3DBD0] text-xs font-mono font-medium hover:bg-[#EAE1D5]/60 transition flex items-center gap-2"
                        >
                          <span className="font-bold text-[#D97732]">v{v.version}</span>
                          <span className="text-[10px] text-[#77716B]">({v.model})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Template Editor */}
                  <div className="space-y-3 flex-1 flex flex-col">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#262626]">
                        Prompt Template
                      </label>
                      <select
                        value={editingModel}
                        onChange={(e) => setEditingModel(e.target.value)}
                        className="text-xs bg-white border border-[#E3DBD0] rounded-lg px-2.5 py-1 text-[#171717] font-medium"
                      >
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                      </select>
                    </div>

                    <textarea
                      value={editingTemplate}
                      onChange={(e) => setEditingTemplate(e.target.value)}
                      rows={8}
                      className="w-full text-xs font-mono bg-[#F5F0E8]/50 border border-[#E3DBD0] rounded-xl p-4 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 leading-relaxed resize-none"
                    />

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-[#77716B]">
                        Saving creates an immutable new version (v{(versions[0]?.version || 0) + 1})
                      </span>
                      <button
                        onClick={handleSaveNewVersion}
                        className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition cursor-pointer"
                      >
                        {saveSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Saved v{(versions[0]?.version || 0)}!</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>Save as New Version</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-[#77716B]">
                  Select a prompt template to view or iterate on versions.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Create Prompt Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E3DBD0] rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-base font-bold text-[#171717] mb-4">Create New Prompt</h3>
            <form onSubmit={handleCreatePrompt} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Prompt Name
                </label>
                <input
                  type="text"
                  required
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  placeholder="e.g. Email Summarizer"
                  className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newPromptDesc}
                  onChange={(e) => setNewPromptDesc(e.target.value)}
                  placeholder="Summarizes long email threads into 3 key takeaways"
                  className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Default Model
                </label>
                <select
                  value={newPromptModel}
                  onChange={(e) => setNewPromptModel(e.target.value)}
                  className="w-full text-xs bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl px-3 py-2 text-[#171717]"
                >
                  <option value="gpt-4o">gpt-4o</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#262626] mb-1">
                  Template Content (v1)
                </label>
                <textarea
                  required
                  rows={4}
                  value={newPromptTemplate}
                  onChange={(e) => setNewPromptTemplate(e.target.value)}
                  placeholder="You are an AI assistant that..."
                  className="w-full text-xs font-mono bg-[#F5F0E8]/40 border border-[#E3DBD0] rounded-xl p-3 text-[#171717] focus:outline-none focus:ring-2 focus:ring-[#E98945]/40"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#E3DBD0] text-xs font-medium text-[#77716B] hover:bg-[#F5F0E8] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#E98945] hover:bg-[#D97732] text-white text-xs font-semibold transition"
                >
                  Create Prompt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
