"use client";

import { motion } from "framer-motion";
import { AudioLines, Film, ListVideo, Sparkles, type LucideIcon } from "lucide-react";
import { SPRING } from "@/lib/motion";
import type { DownloadMode, SelectableMode } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ModeItem<M extends string> {
  id: M;
  label: string;
  icon: LucideIcon;
}

const DEFAULT_ITEMS: ModeItem<DownloadMode>[] = [
  { id: "auto", label: "Auto", icon: Sparkles },
  { id: "video", label: "Video", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
];

/** Icons shared with other surfaces (e.g. history) that render a mode chip. */
export const MODE_ITEMS: Record<SelectableMode, ModeItem<SelectableMode>> = {
  auto: { id: "auto", label: "Auto", icon: Sparkles },
  video: { id: "video", label: "Video", icon: Film },
  audio: { id: "audio", label: "Audio", icon: AudioLines },
  playlist: { id: "playlist", label: "Playlist", icon: ListVideo },
};

interface ModeSelectorProps<M extends string> {
  value: M;
  onChange: (mode: M) => void;
  size?: "md" | "sm";
  /** Unique per usage so simultaneous instances never share a layout animation. */
  layoutId?: string;
  /** Defaults to Auto/Video/Audio; pass a custom set to add the Playlist chip. */
  items?: ModeItem<M>[];
}

export function ModeSelector<M extends string = DownloadMode>({
  value,
  onChange,
  size = "md",
  layoutId = "mode",
  items,
}: ModeSelectorProps<M>) {
  const list = items ?? (DEFAULT_ITEMS as unknown as ModeItem<M>[]);
  return (
    <div
      role="radiogroup"
      aria-label="Download mode"
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03]",
        size === "md" ? "p-1" : "p-0.5",
      )}
    >
      {list.map((item) => {
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
