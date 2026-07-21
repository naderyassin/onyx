"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  AudioLines,
  Check,
  Film,
  ListVideo,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { ModeSelector, type ModeItem } from "@/components/home/mode-selector";
import {
  BarLabel,
  elapsedItem,
  isStalled,
  JobControls,
  ProgressBar,
  ResumeHint,
  StallNotice,
  StatRow,
  transferItems,
  Value,
} from "@/components/home/progress-readout";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/format";
import { cardReveal, SPRING } from "@/lib/motion";
import type { AudioFormat, DownloadMode, JobState, PlaylistInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const AUDIO_FORMATS: AudioFormat[] = ["mp3", "m4a", "opus"];

const RES_PRESETS: { label: string; height?: number }[] = [
  { label: "Best" },
  { label: "2160p", height: 2160 },
  { label: "1440p", height: 1440 },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "480p", height: 480 },
];

const ITEM_MODES: ModeItem<DownloadMode>[] = [
  { id: "auto", label: "Auto", icon: Sparkles },
  { id: "video", label: "Video", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
];

interface PlaylistCardProps {
  playlist: PlaylistInfo;
  itemMode: DownloadMode;
  onSelectItemMode: (mode: DownloadMode) => void;
  height?: number;
  onSelectHeight: (height?: number) => void;
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

function Thumbnail({ playlist }: { playlist: PlaylistInfo }) {
  const [failed, setFailed] = useState(false);
  const showImage = playlist.thumbnailUrl && !failed;
  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] sm:w-60">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/thumbnail?url=${encodeURIComponent(playlist.thumbnailUrl!)}`}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <ListVideo className="size-8 text-white/25" strokeWidth={1.4} aria-hidden />
        </div>
      )}
      {/* Stacked-page hint + count, echoing a playlist thumbnail. */}
      <div className="absolute inset-y-0 right-0 flex w-14 flex-col items-center justify-center gap-1 bg-black/60 backdrop-blur-[2px]">
        <ListVideo className="size-4 text-white/80" aria-hidden />
        <span className="font-mono text-[11px] text-white/90">{playlist.count}</span>
      </div>
    </div>
  );
}

function FormatPicker({
  itemMode,
  onSelectItemMode,
  height,
  onSelectHeight,
  audioFormat,
  onSelectAudioFormat,
  disabled,
}: Pick<
  PlaylistCardProps,
  | "itemMode"
  | "onSelectItemMode"
  | "height"
  | "onSelectHeight"
  | "audioFormat"
  | "onSelectAudioFormat"
> & { disabled: boolean }) {
  return (
    <div className={cn("space-y-3", disabled && "pointer-events-none opacity-50")}>
      <ModeSelector
        size="sm"
        layoutId="playlist-item-mode"
        value={itemMode}
        onChange={onSelectItemMode}
        items={ITEM_MODES}
      />

      {itemMode === "video" && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Playlist video quality">
          {RES_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              role="radio"
              aria-checked={height === preset.height}
              disabled={disabled}
              onClick={() => onSelectHeight(preset.height)}
              className={chipClass(height === preset.height)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {itemMode === "audio" && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Playlist audio format">
          {AUDIO_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              role="radio"
              aria-checked={audioFormat === format}
              disabled={disabled}
              onClick={() => onSelectAudioFormat(format)}
              className={cn(chipClass(audioFormat === format), "uppercase")}
            >
              {format}
            </button>
          ))}
        </div>
      )}

      {itemMode === "auto" && (
        <p className="text-sm text-muted-foreground">
          Best video with audio for every item, picked automatically.
        </p>
      )}
    </div>
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
  const pl = job.playlist;
  const zipping = job.status === "processing";
  const starting = job.status === "starting";
  const paused = job.status === "paused";
  const transferring = !zipping && !starting;
  const count = pl?.count;
  const done = pl?.completed ?? 0;
  const index = pl?.index ?? 0;
  const stalled = isStalled(job);

  const position = count ? `${index || done + 1} / ${count}` : "";
  const statusLabel = paused
    ? `Paused${position ? ` at ${position}` : ""}`
    : starting
      ? "Starting…"
      : zipping
        ? "Packaging ZIP…"
        : count
          ? `Downloading ${position}`
          : "Downloading playlist";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{statusLabel}</p>
          {/* The title gets a line to itself so it can never crowd out the
              numbers below it, however long it is. */}
          <p className="mt-1 truncate font-mono text-xs text-white/50" title={pl?.currentTitle}>
            {zipping
              ? "Zipping the downloaded videos"
              : starting
                ? "Fetching the playlist…"
                : (pl?.currentTitle ?? "Preparing…")}
          </p>
        </div>
        <JobControls job={job} onPause={onPause} onResume={onResume} onCancel={onCancel} />
      </div>

      {transferring && (
        <div className="mt-4">
          <BarLabel label="This video" percent={job.itemProgress} />
          <ProgressBar value={job.itemProgress} stalled={stalled} paused={paused} />
          <StatRow className="mt-2" items={transferItems(job)} />
        </div>
      )}

      <div className="mt-4">
        <BarLabel label="Overall" percent={zipping ? undefined : job.progress} />
        <ProgressBar value={job.progress} indeterminate={zipping} tone="dim" paused={paused} />
        <StatRow
          className="mt-2"
          items={[
            <>
              <Value>{done}</Value> downloaded
            </>,
            pl?.skipped ? <span className="text-amber-300/80">{pl.skipped} skipped</span> : null,
            count != null ? `${Math.max(0, count - done - (pl?.skipped ?? 0))} remaining` : null,
            job.sessionBytes > 0 ? `${formatBytes(job.sessionBytes)} fetched` : null,
            elapsedItem(job),
          ]}
        />
      </div>

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
  const pl = job.playlist;
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
          <p className="truncate text-sm font-medium">{job.fileName ?? "Playlist saved"}</p>
          <p className="font-mono text-xs text-white/50">
            {formatBytes(job.fileSize)}
            {pl ? ` · ${pl.completed} videos` : ""}
            {pl?.skipped ? ` · ${pl.skipped} skipped` : ""}
            {" · sent to your downloads"}
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
          {job.error ?? "The playlist download failed."}
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

export function PlaylistCard(props: PlaylistCardProps) {
  const { playlist, job, onDownload, onPause, onResume, onCancel, onSaveAgain, onReset } = props;

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
      aria-label="Playlist preview"
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <Thumbnail playlist={playlist} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
              <ListVideo className="size-3" aria-hidden /> Playlist
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
              {playlist.extractor}
            </span>
          </div>
          <h2 className="mt-2 line-clamp-2 text-lg font-medium leading-snug">{playlist.title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {playlist.uploader ?? "Unknown author"}
            <span className="font-mono text-white/40">
              {" · "}
              {playlist.count} videos
              {playlist.totalDurationSec != null && ` · ${formatDuration(playlist.totalDurationSec)}`}
            </span>
          </p>

          {playlist.previewTitles.length > 0 && (
            <ol className="mt-3 space-y-0.5 font-mono text-xs text-white/45">
              {playlist.previewTitles.map((title, i) => (
                <li key={i} className="truncate">
                  <span className="text-white/30">{String(i + 1).padStart(2, "0")}</span> {title}
                </li>
              ))}
              {playlist.count > playlist.previewTitles.length && (
                <li className="text-white/30">+ {playlist.count - playlist.previewTitles.length} more…</li>
              )}
            </ol>
          )}

          <div className="mt-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">Each video as</p>
            <FormatPicker {...props} disabled={jobBusy} />
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
                  <span className="font-mono text-white/85">{playlist.count} videos</span> · saves as
                  one <span className="font-mono text-white/85">.zip</span>
                </p>
                <Button
                  onClick={onDownload}
                  className="h-11 shrink-0 rounded-xl bg-white px-6 text-sm text-black hover:bg-white/90"
                >
                  <ArrowDownToLine data-icon="inline-start" />
                  Download all
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
