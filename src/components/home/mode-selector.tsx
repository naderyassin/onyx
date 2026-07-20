"use client";

import { motion } from "framer-motion";
import { AudioLines, Film, Sparkles, type LucideIcon } from "lucide-react";
import { SPRING } from "@/lib/motion";
import type { DownloadMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const ITEMS: { id: DownloadMode; label: string; icon: LucideIcon }[] = [
  { id: "auto", label: "Auto", icon: Sparkles },
  { id: "video", label: "Video", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
];

interface ModeSelectorProps {
  value: DownloadMode;
  onChange: (mode: DownloadMode) => void;
  size?: "md" | "sm";
  /** Unique per usage so simultaneous instances never share a layout animation. */
  layoutId?: string;
}

export function ModeSelector({
  value,
  onChange,
  size = "md",
  layoutId = "mode",
}: ModeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Download mode"
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03]",
        size === "md" ? "p-1" : "p-0.5",
      )}
    >
      {ITEMS.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full font-medium transition-colors",
              size === "md" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-[13px]",
              active ? "text-black" : "text-white/55 hover:text-white/90",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${layoutId}-thumb`}
                className="absolute inset-0 rounded-full bg-white"
                transition={SPRING}
              />
            )}
            <Icon
              className={cn("relative", size === "md" ? "size-4" : "size-3.5")}
              strokeWidth={2}
              aria-hidden
            />
            <span className="relative">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
