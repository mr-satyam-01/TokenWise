"use client";

import React from "react";
import { Clock, Search, ShieldCheck } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
  showTimeRange?: boolean;
}

export function Header({
  title,
  subtitle,
  timeRange = "7d",
  onTimeRangeChange,
  showTimeRange = true,
}: HeaderProps) {
  const ranges = [
    { label: "Past 24h", value: "24h" },
    { label: "Past 7d", value: "7d" },
    { label: "Past 30d", value: "30d" },
    { label: "All time", value: "all" },
  ];

  return (
    <header className="h-16 border-b border-[#E3DBD0] bg-[#F5F0E8]/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      <div>
        <h1 className="text-lg font-bold text-[#171717] tracking-tight leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-[#77716B] font-medium leading-none mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Gateway health badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 border border-[#E3DBD0] text-[11px] font-medium text-[#2F7D57]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2F7D57] animate-pulse" />
          <span>Gateway Active</span>
        </div>

        {/* Time range selector */}
        {showTimeRange && onTimeRangeChange && (
          <div className="flex items-center bg-white/80 border border-[#E3DBD0] rounded-xl p-0.5 shadow-2xs">
            {ranges.map((r) => {
              const active = timeRange === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => onTimeRangeChange(r.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    active
                      ? "bg-[#EAE1D5] text-[#171717] font-semibold border border-[#E3DBD0] shadow-2xs"
                      : "text-[#77716B] hover:text-[#171717]"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
