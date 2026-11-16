"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Workflow,
  FileCode2,
  FlaskConical,
  Settings,
  ChevronDown,
  LogOut,
  Building2,
  Layers,
  Sparkles,
  Box,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  comingSoon?: boolean;
}

const navItems: NavItem[] = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "Requests", href: "/requests", icon: Radio },
  { name: "Sessions", href: "/sessions", icon: Workflow },
  { name: "Prompts", href: "/prompts", icon: FileCode2 },
  { name: "Playground", href: "/playground", icon: Sparkles },
  { name: "Models", href: "/models", icon: Box },
  { name: "Experiments", href: "#", icon: FlaskConical, comingSoon: true },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, currentOrg, applications, selectedApp, setSelectedApp, logout } = useAuth();

  return (
    <aside className="w-64 border-r border-[#E3DBD0] bg-[#F5F0E8] flex flex-col justify-between h-screen sticky top-0 select-none z-30">
      <div>
        {/* Brand & Wordmark */}
        <div className="h-16 flex items-center px-6 border-b border-[#E3DBD0] gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E98945] to-[#D97732] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            TW
          </div>
          <div>
            <div className="font-semibold text-[#171717] tracking-tight leading-none text-base">
              TokenWise
            </div>
            <div className="text-[11px] text-[#77716B] font-medium tracking-wide uppercase mt-0.5">
              LLM Observability
            </div>
          </div>
        </div>

        {/* Organization & App Selectors */}
        <div className="p-3 space-y-2 border-b border-[#E3DBD0]">
          {/* Org pill */}
          <div className="px-3 py-2 rounded-xl bg-[#EAE1D5]/60 border border-[#E3DBD0] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <Building2 className="w-3.5 h-3.5 text-[#E98945] shrink-0" />
              <span className="font-semibold text-[#171717] truncate">
                {currentOrg?.name || "Acme AI Labs"}
              </span>
            </div>
            <span className="text-[10px] text-[#77716B] font-mono px-1.5 py-0.5 bg-white/70 rounded-md border border-[#E3DBD0]">
              team
            </span>
          </div>

          {/* Application selector */}
          {applications.length > 0 && (
            <div className="relative">
              <select
                value={selectedApp?.id || ""}
                onChange={(e) => {
                  const found = applications.find((a) => a.id === e.target.value);
                  if (found) setSelectedApp(found);
                }}
                className="w-full text-xs bg-white/80 border border-[#E3DBD0] rounded-xl px-3 py-2 pr-8 appearance-none text-[#262626] font-medium focus:outline-none focus:ring-2 focus:ring-[#E98945]/40 transition"
              >
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.environment})
                  </option>
                ))}
              </select>
              <Layers className="w-3.5 h-3.5 text-[#77716B] absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            if (item.comingSoon) {
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-xs text-[#77716B]/70 cursor-not-allowed opacity-60"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-[#EAE1D5] text-[#77716B]">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[#EAE1D5] text-[#171717] font-semibold border border-[#E3DBD0] shadow-2xs"
                    : "text-[#262626] hover:bg-[#EAE1D5]/50 hover:text-[#171717]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-[#E98945]" : "text-[#77716B]"
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[#E98945]/15 text-[#D97732] font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Account / Footer */}
      <div className="p-3 border-t border-[#E3DBD0]">
        <div className="flex items-center justify-between p-2 rounded-xl bg-white/60 border border-[#E3DBD0]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-lg bg-[#EAE1D5] flex items-center justify-center font-bold text-xs text-[#171717]">
              {user?.full_name ? user.full_name[0].toUpperCase() : "U"}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-[#171717] truncate leading-tight">
                {user?.full_name || "Engineer"}
              </div>
              <div className="text-[10px] text-[#77716B] truncate font-mono">
                {user?.email || "demo@tokenwise.ai"}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1.5 rounded-lg text-[#77716B] hover:text-[#C94C4C] hover:bg-red-50 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
