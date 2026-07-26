"use client";

import { Fragment, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CircleAlert, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatEta, formatSpeed } from "@/lib/format";
import type { JobState } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Nothing has arrived for this long → say so, rather than leaving a frozen bar.
 * Sits past yt-dlp's 20s socket timeout on purpose: below that, a silent gap is
 * just a throttled chunk, and yt-dlp hasn't even decided anything is wrong yet.
 */
const STALL_AFTER_SEC = 25;

export function ProgressBar({
  value,
  indeterminate = false,
  tone = "bright",
  stalled = false,
  paused = false,
}: {
  value: number;
  indeterminate?: boolean;
  tone?: "bright" | "dim";
  stalled?: boolean;
  paused?: boolean;
}) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
      {indeterminate ? (
        <motion.div
          className="h-full w-1/3 rounded-full bg-white/80"
          animate={{ x: ["-120%", "320%"] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className={cn(
            "h-full rounded-full transition-colors",
            paused
              ? "bg-white/30"
              : stalled
                ? "bg-amber-300/70"
                : tone === "bright"
                  ? "bg-white"
                  : "bg-white/40",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ ease: "easeOut", duration: 0.3 }}
        />
      )}
    </div>
  );
}

/** Pause/resume + cancel, shown together in the corner of a progress panel. */
export function JobControls({
  job,
  onPause,
  onResume,
  onCancel,
}: {
  job: JobState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const paused = job.status === "paused";
  // Post-processing can't be interrupted safely — a half-written merge or zip
  // is not resumable, so the control disappears rather than lying.
  const canPause = paused || job.status === "downloading" || job.status === "starting";

  return (
    <div className="-mt-1 flex shrink-0 items-center gap-0.5">
      {canPause && (
        <Button
          variant="ghost"
          size="icon"
          onClick={paused ? onResume : onPause}
          aria-label={paused ? "Resume download" : "Pause download"}
          className="size-9 rounded-lg text-white/50 hover:text-white"
        >
          {paused ? <Play /> : <Pause />}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        aria-label="Cancel download"
        className="size-9 rounded-lg text-white/50 hover:text-white"
      >
        <X />
      </Button>
    </div>
  );
}

/** A small caption above a bar: label on the left, percentage on the right. */
export function BarLabel({ label, percent }: { label: string; percent?: number }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-[0.16em] text-white/40">{label}</span>
      {percent != null && (
        <span className="font-mono text-[11px] text-white/70">{Math.round(percent)}%</span>
      )}
    </div>
  );
}

/**
 * Dot-separated facts on their own wrapping line. Deliberately not truncated —
 * speed and ETA must stay readable however long the title above them is.
 */
export function StatRow({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-white/45",
        className,
      )}
    >
      {shown.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="text-white/20">
              ·
            </span>
          )}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function isStalled(job: JobState): boolean {
  return job.status === "downloading" && (job.stalledSec ?? 0) >= STALL_AFTER_SEC;
}

export function StallNotice({ seconds }: { seconds: number }) {
  return (
    <p
      role="status"
      className="mt-2.5 flex items-start gap-1.5 font-mono text-[11px] leading-relaxed text-amber-300/85"
    >
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Nothing received for {formatEta(seconds)}. yt-dlp is retrying — cancel if it doesn&apos;t
        recover.
      </span>
    </p>
  );
}

export function ResumeHint() {
  return (
    <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-white/40">
      Partly-downloaded files are kept — resuming picks up where this left off.
    </p>
  );
}

/** Bright-white value inside an otherwise dim stat line. */
export function Value({ children }: { children: ReactNode }) {
  return <span className="text-white/75">{children}</span>;
}

/** Speed · size · ETA for the file in flight — the answer to "is this moving?". */
export function transferItems(job: JobState): ReactNode[] {
  const stalled = isStalled(job);
  const paused = job.status === "paused";
  const size = job.totalBytes
    ? `${formatBytes(job.downloadedBytes)} of ${formatBytes(job.totalBytes)}`
    : job.downloadedBytes > 0
      ? formatBytes(job.downloadedBytes)
      : null;
  // Only meaningful when there is no byte total (HLS/DASH), where it is the
  // only proof that fragments are still arriving.
  const fragments =
    !job.totalBytes && job.fragmentCount
      ? `part ${job.fragmentIndex ?? 0} / ${job.fragmentCount}`
      : null;

  const lead = paused ? (
    <span className="text-white/60">paused</span>
  ) : stalled ? (
    <span className="text-amber-300/80">stalled</span>
  ) : (
    <Value>{formatSpeed(job.speedBps)}</Value>
  );

  return [
    lead,
    size,
    fragments,
    !paused && job.etaSec ? `${formatEta(job.etaSec)} left` : null,
  ];
}

export function elapsedItem(job: JobState): ReactNode {
  return job.elapsedSec ? `${formatDuration(job.elapsedSec)} elapsed` : null;
}
