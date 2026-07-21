import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DownloadMode, JobState, JobStatus, PlaylistProgress } from "@/lib/types";

export interface InternalJob {
  id: string;
  url: string;
  mode: DownloadMode;
  dir: string;
  createdAt: number;
  status: JobStatus;
  progress: number;
  itemProgress: number;
  downloadedBytes: number;
  totalBytes?: number;
  /** Bytes of every stream that has already finished — see `streamBytes`. */
  priorBytes: number;
  /** Bytes of the stream in flight. Kept apart from `priorBytes` so the running
   *  session total stays correct across the video/audio streams of one item. */
  streamBytes: number;
  /** When the byte counter last moved — the basis for stall detection. */
  lastByteAt?: number;
  fragmentIndex?: number;
  fragmentCount?: number;
  speedBps?: number;
  etaSec?: number;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
  canceled?: boolean;
  /** True from the moment a pause is requested until the process actually exits,
   *  so the exit isn't mistaken for a failure and late output is ignored. */
  pausing?: boolean;
  pausedAt?: number;
  servedAt?: number;
  proc?: ChildProcess;
  /** yt-dlp binary and full argv, kept so a paused job can be respawned as-is. */
  bin?: string;
  argv?: string[];
  /** Whole-playlist job — downloads into `contentDir`, then gets zipped. */
  isPlaylist?: boolean;
  /** Where yt-dlp writes files (a subdir for playlists, `dir` otherwise). */
  contentDir: string;
  playlist?: PlaylistProgress;
  /** Playlist indices that actually began downloading — used to derive the
   *  downloaded/skipped tallies from index gaps rather than noisy error lines. */
  startedIndices?: Set<number>;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(["complete", "error", "canceled"]);
const JOB_MAX_AGE_MS = 45 * 60_000;
const SERVED_LINGER_MS = 10 * 60_000;
/** A pause holds a temp dir open indefinitely — reclaim it after this long. */
const PAUSED_MAX_AGE_MS = 30 * 60_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

// Stored on globalThis so the map survives HMR and is shared across route chunks.
const g = globalThis as unknown as {
  __onyxJobs?: Map<string, InternalJob>;
  __onyxSweeper?: ReturnType<typeof setInterval>;
};

const jobs = (g.__onyxJobs ??= new Map<string, InternalJob>());

if (!g.__onyxSweeper) {
  g.__onyxSweeper = setInterval(() => {
    const now = Date.now();
    for (const job of jobs.values()) {
      const done = TERMINAL.has(job.status);
      const expired = done && now - job.createdAt > JOB_MAX_AGE_MS;
      const servedLongAgo = job.servedAt != null && now - job.servedAt > SERVED_LINGER_MS;
      const abandoned =
        job.status === "paused" &&
        job.pausedAt != null &&
        now - job.pausedAt > PAUSED_MAX_AGE_MS;
      if (expired || servedLongAgo || abandoned) destroyJob(job.id);
    }
  }, SWEEP_INTERVAL_MS);
  g.__onyxSweeper.unref?.();
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

export function createJob(url: string, mode: DownloadMode, isPlaylist = false): InternalJob {
  const id = crypto.randomUUID();
  const dir = path.join(os.tmpdir(), "onyx-downloads", id);
  // Playlist items land in a subdir so the zip (written to `dir`) sits beside
  // it and never zips itself; a plain job writes straight into `dir`.
  const contentDir = isPlaylist ? path.join(dir, "content") : dir;
  fs.mkdirSync(contentDir, { recursive: true });
  const job: InternalJob = {
    id,
    url,
    mode,
    dir,
    contentDir,
    isPlaylist,
    createdAt: Date.now(),
    status: "starting",
    progress: 0,
    itemProgress: 0,
    downloadedBytes: 0,
    priorBytes: 0,
    streamBytes: 0,
    ...(isPlaylist
      ? { playlist: { completed: 0, skipped: 0, skippedTitles: [] } as PlaylistProgress }
      : {}),
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): InternalJob | undefined {
  return jobs.get(id);
}

export function publicState(job: InternalJob): JobState {
  const now = Date.now();
  // Recomputed on every poll so the UI keeps counting while the job is silent.
  const stalledSec =
    job.status === "downloading" && job.lastByteAt != null
      ? Math.max(0, Math.round((now - job.lastByteAt) / 1000))
      : undefined;

  return {
    id: job.id,
    status: job.status,
    progress: Math.round(job.progress * 10) / 10,
    itemProgress: Math.round(job.itemProgress * 10) / 10,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    sessionBytes: job.priorBytes + job.streamBytes,
    speedBps: job.speedBps,
    etaSec: job.etaSec,
    elapsedSec: Math.round((now - job.createdAt) / 1000),
    fragmentIndex: job.fragmentIndex,
    fragmentCount: job.fragmentCount,
    stalledSec,
    fileName: job.fileName,
    fileSize: job.fileSize,
    error: job.error,
    playlist: job.playlist ? { ...job.playlist } : undefined,
  };
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (isTerminal(job.status)) return true;
  job.canceled = true;
  job.status = "canceled";
  killTree(job.proc);
  // Give the process tree a moment to release file locks before deleting.
  const t = setTimeout(() => void removeDir(job.dir), 4_000);
  t.unref?.();
  return true;
}

/** True while the job is in a phase that can be safely interrupted and resumed. */
export function isPausable(job: InternalJob): boolean {
  return job.status === "downloading" || job.status === "starting";
}

/**
 * yt-dlp has no pause primitive, so we stop the process and keep its partial
 * files. Resuming respawns it with the same argv; `--continue` (yt-dlp's
 * default) picks the `.part` file back up from where it stopped. Deliberately
 * refuses during post-processing, where a half-written merge is unrecoverable.
 */
export function pauseJob(id: string): "ok" | "not-found" | "not-pausable" {
  const job = jobs.get(id);
  if (!job) return "not-found";
  if (job.status === "paused") return "ok";
  if (!isPausable(job)) return "not-pausable";
  job.pausing = true;
  job.status = "paused";
  job.pausedAt = Date.now();
  job.speedBps = undefined;
  job.etaSec = undefined;
  killTree(job.proc);
  return "ok";
}

export function destroyJob(id: string): void {
  const job = jobs.get(id);
  if (!job) return;
  killTree(job.proc);
  jobs.delete(id);
  void removeDir(job.dir);
}

function killTree(proc?: ChildProcess): void {
  if (!proc || proc.exitCode !== null || proc.killed) return;
  try {
    if (process.platform === "win32" && proc.pid) {
      // taskkill /T also terminates the ffmpeg children yt-dlp spawns.
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true });
    } else {
      proc.kill("SIGTERM");
      const t = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
      }, 3_000);
      t.unref?.();
    }
  } catch {}
}

async function removeDir(dir: string): Promise<void> {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  } catch {}
}
