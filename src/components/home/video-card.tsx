"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Check, Clapperboard, RotateCcw, TriangleAlert } from "lucide-react";
import {
  elapsedItem,
  isStalled,
  JobControls,
  ProgressBar,
  ResumeHint,
  StallNotice,
  StatRow,
  transferItems,
} from "@/components/home/progress-readout";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/format";
import { cardReveal, SPRING } from "@/lib/motion";
import type { AudioFormat, DownloadMode, JobState, VideoInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUDIO_FORMATS: AudioFormat[] = ["mp3", "m4a", "opus"];

interface VideoCardProps {
  info: VideoInfo;
  mode: DownloadMode;
  selectedHeight?: number;
  onSelectHeight: (height: number) => void;
  audioFormat: AudioFormat;
  onSelectAudioFormat: (format: AudioFormat) => void;
  job: JobState | null;
  onDownload: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSaveAgain: () => void;
  onReset: () => void;
}

function chipClass(active: boolean): string {
  return cn(
    "h-9 rounded-full border px-3.5 font-mono text-[13px] transition-all",
    active
      ? "border-white bg-white text-black"
      : "border-white/12 bg-white/[0.02] text-white/65 hover:border-white/30 hover:text-white",
  );
}

function Thumbnail({ info }: { info: VideoInfo }) {
  const [failed, setFailed] = useState(false);
  const showImage = info.thumbnailUrl && !failed;
  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] sm:w-60">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/thumbnail?url=${encodeURIComponent(info.thumbnailUrl!)}`}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Clapperboard className="size-8 text-white/25" strokeWidth={1.4} aria-hidden />
        </div>
      )}
      {info.durationSec != null && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white/90">
          {formatDuration(info.durationSec)}
        </span>
      )}
    </div>
  );
}

function QualityPicker({
  info,
  mode,
  selectedHeight,
  onSelectHeight,
  audioFormat,
  onSelectAudioFormat,
  disabled,
}: Pick<
  VideoCardProps,
  "info" | "mode" | "selectedHeight" | "onSelectHeight" | "audioFormat" | "onSelectAudioFormat"
> & { disabled: boolean }) {
  if (mode === "audio") {
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Audio format">
        {AUDIO_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={audioFormat === format}
            disabled={disabled}
            onClick={() => onSelectAudioFormat(format)}
            className={cn(chipClass(audioFormat === format), "uppercase", disabled && "opacity-50")}
          >
            {format}
          </button>
        ))}
      </div>
    );
  }

  if (mode === "video") {
    if (!info.qualities.length) {
      return (
        <p className="text-sm text-muted-foreground">
          One best-quality file is available for this link.
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Video quality">
        {info.qualities.map((quality) => (
          <button
            key={quality.height}
            type="button"
            role="radio"
            aria-checked={selectedHeight === quality.height}
            disabled={disabled}
            onClick={() => onSelectHeight(quality.height)}
            className={cn(chipClass(selectedHeight === quality.height), disabled && "opacity-50")}
          >
            {quality.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Best available quality{info.bestHeight ? ` — up to ${info.bestHeight}p` : ""}, picked
      automatically.
    </p>
  );
}

function ProgressPanel({
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
  const processing = job.status === "processing";
  const starting = job.status === "starting";
  const paused = job.status === "paused";
  const stalled = isStalled(job);
  const statusLabel = paused
    ? "Paused"
    : starting
      ? "Starting…"
      : processing
        ? "Merging & processing…"
        : "Downloading";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{statusLabel}</p>
          <p className="mt-1 truncate font-mono text-xs text-white/50">
            {processing
              ? "Almost done — FFmpeg is finishing the file"
              : starting
                ? "Asking the site for the stream…"
                : `${Math.round(job.progress)}% complete`}
          </p>
        </div>
        <JobControls job={job} onPause={onPause} onResume={onResume} onCancel={onCancel} />
      </div>

      <div className="mt-3">
        <ProgressBar
          value={job.progress}
          indeterminate={processing}
          stalled={stalled}
          paused={paused}
        />
      </div>

      {!processing && (
        <StatRow className="mt-2.5" items={[...transferItems(job), elapsedItem(job)]} />
      )}

      {stalled && <StallNotice seconds={job.stalledSec ?? 0} />}
      {paused && <ResumeHint />}
    </div>
  );
}

function DonePanel({
  job,
  onSaveAgain,
  onReset,
}: {
  job: JobState;
  onSaveAgain: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black"
        >
          <Check className="size-5" strokeWidth={2.5} aria-hidden />
        </motion.div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.fileName ?? "File saved"}</p>
          <p className="font-mono text-xs text-white/50">
            {formatBytes(job.fileSize)}
            {" · sent to your browser's downloads"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          onClick={onSaveAgain}
          className="h-10 rounded-xl border-white/15 bg-transparent px-4 hover:bg-white/[0.06]"
        >
          Save again
        </Button>
        <Button onClick={onReset} className="h-10 rounded-xl bg-white px-4 text-black hover:bg-white/90">
          Download another
        </Button>
      </div>
    </div>
  );
}

function FailedPanel({ job, onRetry }: { job: JobState; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-full border border-destructive/40 bg-destructive/10">
          <TriangleAlert className="size-4.5 text-destructive" aria-hidden />
        </div>
        <p className="min-w-0 text-sm leading-snug text-white/80" role="alert">
          {job.error ?? "The download failed."}
        </p>
      </div>
      <Button
        variant="outline"
        onClick={onRetry}
        className="h-10 shrink-0 rounded-xl border-white/15 bg-transparent px-4 hover:bg-white/[0.06]"
      >
        <RotateCcw data-icon="inline-start" />
        Try again
      </Button>
    </div>
  );
}

export function VideoCard(props: VideoCardProps) {
  const {
    info,
    mode,
    selectedHeight,
    audioFormat,
    job,
    onDownload,
    onPause,
    onResume,
    onCancel,
    onSaveAgain,
    onReset,
  } = props;

  const selected =
    info.qualities.find((q) => q.height === selectedHeight) ?? info.qualities[0];
  const estimate =
    mode === "audio"
      ? { bytes: info.audioEstBytes, approx: true }
      : mode === "video"
        ? { bytes: selected?.estBytes, approx: selected?.approx ?? true }
        : { bytes: info.autoEstBytes, approx: true };
  const extLabel = mode === "audio" ? audioFormat : "mp4";

  const jobBusy = !!job && !["complete", "error", "canceled"].includes(job.status);
  const panel: "cta" | "progress" | "done" | "failed" = !job
    ? "cta"
    : job.status === "complete"
      ? "done"
      : job.status === "error"
        ? "failed"
        : "progress";

  return (
    <motion.section
      variants={cardReveal}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="mt-8 w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9)] backdrop-blur-sm"
      aria-label="Media preview"
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <Thumbnail info={info} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">{info.extractor}</p>
          <h2 className="mt-1.5 line-clamp-2 text-lg font-medium leading-snug">{info.title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {info.uploader ?? "Unknown author"}
            {info.durationSec != null && (
              <span className="font-mono text-white/40"> · {formatDuration(info.durationSec)}</span>
            )}
          </p>
          <div className="mt-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
              {mode === "audio" ? "Format" : "Quality"}
            </p>
            <QualityPicker {...props} disabled={jobBusy} />
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.08] px-5 py-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            {panel === "progress" && job && (
              <ProgressPanel
                job={job}
                onPause={onPause}
                onResume={onResume}
                onCancel={onCancel}
              />
            )}
            {panel === "done" && job && (
              <DonePanel job={job} onSaveAgain={onSaveAgain} onReset={onReset} />
            )}
            {panel === "failed" && job && <FailedPanel job={job} onRetry={onDownload} />}
            {panel === "cta" && (
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 truncate text-sm text-muted-foreground">
                  {estimate.bytes ? (
                    <>
                      <span className="font-mono text-white/85">
                        {formatBytes(estimate.bytes, estimate.approx)}
                      </span>{" "}
                      estimated ·{" "}
                    </>
                  ) : null}
                  saves as <span className="font-mono text-white/85">.{extLabel}</span>
                </p>
                <Button
                  onClick={onDownload}
                  className="h-11 shrink-0 rounded-xl bg-white px-6 text-sm text-black hover:bg-white/90"
                >
                  <ArrowDownToLine data-icon="inline-start" />
                  Download
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

export function VideoCardSkeleton() {
  return (
    <motion.div
      variants={cardReveal}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="mt-8 w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
      aria-label="Loading media details"
      role="status"
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="aspect-video w-full shrink-0 animate-pulse rounded-xl bg-white/[0.06] sm:w-60" />
        <div className="min-w-0 flex-1 space-y-3 py-1">
          <div className="h-3 w-16 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-5 w-4/5 animate-pulse rounded-full bg-white/[0.08]" />
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="flex gap-2 pt-3">
            <div className="h-9 w-20 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-9 w-20 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-9 w-20 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.08] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-40 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-11 w-36 animate-pulse rounded-xl bg-white/[0.08]" />
        </div>
      </div>
    </motion.div>
  );
}
