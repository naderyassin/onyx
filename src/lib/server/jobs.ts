import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DownloadMode, JobState, JobStatus } from "@/lib/types";

export interface InternalJob {
  id: string;
  url: string;
  mode: DownloadMode;
  dir: string;
  createdAt: number;
  status: JobStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaSec?: number;
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  error?: string;
  canceled?: boolean;
  servedAt?: number;
  proc?: ChildProcess;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(["complete", "error", "canceled"]);
const JOB_MAX_AGE_MS = 45 * 60_000;
const SERVED_LINGER_MS = 10 * 60_000;
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
      if (expired || servedLongAgo) destroyJob(job.id);
    }
  }, SWEEP_INTERVAL_MS);
  g.__onyxSweeper.unref?.();
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.has(status);
}

export function createJob(url: string, mode: DownloadMode): InternalJob {
  const id = crypto.randomUUID();
  const dir = path.join(os.tmpdir(), "onyx-downloads", id);
  fs.mkdirSync(dir, { recursive: true });
  const job: InternalJob = {
    id,
    url,
    mode,
    dir,
    createdAt: Date.now(),
    status: "starting",
    progress: 0,
    downloadedBytes: 0,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): InternalJob | undefined {
  return jobs.get(id);
}

export function publicState(job: InternalJob): JobState {
  return {
    id: job.id,
    status: job.status,
    progress: Math.round(job.progress * 10) / 10,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    speedBps: job.speedBps,
    etaSec: job.etaSec,
    fileName: job.fileName,
    fileSize: job.fileSize,
    error: job.error,
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
