"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AudioLines,
  Clapperboard,
  ExternalLink,
  Film,
  History,
  ListVideo,
  RotateCcw,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { formatBytes, timeAgo } from "@/lib/format";
import { clearHistory, removeHistoryEntry, useHistory } from "@/lib/history";
import type { HistoryEntry, SelectableMode } from "@/lib/types";

const MODE_ICON: Record<SelectableMode, LucideIcon> = {
  auto: Sparkles,
  video: Film,
  audio: AudioLines,
  playlist: ListVideo,
};

function ItemThumb({ entry }: { entry: HistoryEntry }) {
  const [failed, setFailed] = useState(false);
  const showImage = entry.thumbnailUrl && !failed;
  return (
    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/thumbnail?url=${encodeURIComponent(entry.thumbnailUrl!)}`}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Clapperboard className="size-5 text-white/25" strokeWidth={1.4} aria-hidden />
        </div>
      )}
    </div>
  );
}

export function HistoryList() {
  const entries = useHistory();
  const router = useRouter();

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing here yet"
        description="Files you download will appear here, stored only in this browser."
        action={
          <Button asChild className="h-10 rounded-xl bg-white px-5 text-black hover:bg-white/90">
            <Link href="/">Download something</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entries.length} {entries.length === 1 ? "download" : "downloads"}
        </p>
        <ConfirmDialog
          title="Clear download history?"
          description="This removes every entry from this browser. Downloaded files on your disk are not touched."
          actionLabel="Clear history"
          onConfirm={() => {
            clearHistory();
            toast("History cleared");
          }}
        >
          <Button variant="ghost" className="h-9 rounded-lg px-3 text-white/60 hover:text-destructive">
            Clear all
          </Button>
        </ConfirmDialog>
      </div>

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {entries.map((entry) => {
            const ModeIcon = MODE_ICON[entry.mode] ?? Sparkles;
            return (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
                className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.035]"
              >
                <ItemThumb entry={entry} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">{entry.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-xs text-muted-foreground">
                    <ModeIcon className="size-3.5 shrink-0 text-white/40" aria-hidden />
                    {entry.qualityLabel && <span>{entry.qualityLabel} · </span>}
                    <span>{formatBytes(entry.fileSize)}</span>
                    <span className="text-white/30"> · {timeAgo(entry.downloadedAt)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Download again"
                    className="size-9 rounded-lg text-white/50 hover:text-white"
                    onClick={() => router.push(`/?url=${encodeURIComponent(entry.url)}`)}
                  >
                    <RotateCcw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className="size-9 rounded-lg text-white/50 hover:text-white"
                  >
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open original page"
                    >
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove from history"
                    className="size-9 rounded-lg text-white/50 hover:text-destructive"
                    onClick={() => removeHistoryEntry(entry.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
