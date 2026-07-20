"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addHistoryEntry } from "@/lib/history";
import { getSettings } from "@/lib/settings";
import type { ApiError, AudioFormat, DownloadMode, JobState, JobStatus } from "@/lib/types";

const TERMINAL: ReadonlySet<JobStatus> = new Set(["complete", "error", "canceled"]);

export interface StartDownloadArgs {
  url: string;
  mode: DownloadMode;
  height?: number;
  audioFormat?: AudioFormat;
  meta: {
    title: string;
    uploader?: string;
    thumbnailUrl?: string;
    extractor?: string;
    qualityLabel?: string;
  };
}

function triggerBrowserSave(jobId: string) {
  const anchor = document.createElement("a");
  anchor.href = `/api/download/${jobId}/file`;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function useDownload() {
  const [job, setJob] = useState<JobState | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const savedRef = useRef(false);
  const pollingRef = useRef(false);

  const active = !!job && !TERMINAL.has(job.status);

  const closeStream = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => closeStream, [closeStream]);

  const handleUpdate = useCallback(
    (id: string, state: JobState, args: StartDownloadArgs) => {
      if (jobIdRef.current !== id) return;

      if (state.status === "complete" && !savedRef.current) {
        savedRef.current = true;
        closeStream();
        triggerBrowserSave(id);
        if (getSettings().saveHistory) {
          addHistoryEntry({
            id,
            url: args.url,
            title: args.meta.title,
            uploader: args.meta.uploader,
            thumbnailUrl: args.meta.thumbnailUrl,
            extractor: args.meta.extractor,
            mode: args.mode,
            qualityLabel: args.meta.qualityLabel,
            fileName: state.fileName,
            fileSize: state.fileSize,
            downloadedAt: Date.now(),
          });
        }
        toast.success("Saved to your downloads folder");
      } else if (state.status === "error") {
        closeStream();
        toast.error(state.error ?? "The download failed.");
      } else if (state.status === "canceled") {
        closeStream();
        toast("Download canceled");
        setJob(null);
        return;
      }
      setJob(state);
    },
    [closeStream],
  );

  const pollLoop = useCallback(
    async (id: string, args: StartDownloadArgs) => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        while (jobIdRef.current === id) {
          await new Promise((r) => setTimeout(r, 700));
          let state: JobState;
          try {
            const res = await fetch(`/api/download/${id}`);
            if (!res.ok) throw new Error("gone");
            state = (await res.json()) as JobState;
          } catch {
            if (jobIdRef.current === id) {
              setJob((prev) =>
                prev ? { ...prev, status: "error", error: "Lost connection to the download." } : prev,
              );
            }
            return;
          }
          handleUpdate(id, state, args);
          if (TERMINAL.has(state.status)) return;
        }
      } finally {
        pollingRef.current = false;
      }
    },
    [handleUpdate],
  );

  const start = useCallback(
    async (args: StartDownloadArgs) => {
      closeStream();
      savedRef.current = false;
      jobIdRef.current = null;
      setJob({ id: "", status: "starting", progress: 0, downloadedBytes: 0 });

      let jobId: string;
      try {
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: args.url,
            mode: args.mode,
            height: args.height,
            audioFormat: args.audioFormat,
          }),
        });
        const json: unknown = await res.json();
        if (!res.ok) {
          const message = (json as ApiError).error ?? "Could not start the download.";
          toast.error(message);
          setJob({ id: "", status: "error", progress: 0, downloadedBytes: 0, error: message });
          return;
        }
        jobId = (json as { jobId: string }).jobId;
      } catch {
        const message = "Couldn't reach the server. Is the app still running?";
        toast.error(message);
        setJob({ id: "", status: "error", progress: 0, downloadedBytes: 0, error: message });
        return;
      }

      jobIdRef.current = jobId;
      const es = new EventSource(`/api/download/${jobId}/events`);
      esRef.current = es;
      es.onmessage = (event) => {
        try {
          handleUpdate(jobId, JSON.parse(event.data) as JobState, args);
        } catch {}
      };
      es.onerror = () => {
        // SSE dropped (proxy, HMR, network) — fall back to polling.
        closeStream();
        void pollLoop(jobId, args);
      };
    },
    [closeStream, handleUpdate, pollLoop],
  );

  const cancel = useCallback(async () => {
    const id = jobIdRef.current;
    if (!id) {
      setJob(null);
      return;
    }
    try {
      await fetch(`/api/download/${id}`, { method: "DELETE" });
    } catch {}
  }, []);

  const saveAgain = useCallback(() => {
    if (jobIdRef.current) triggerBrowserSave(jobIdRef.current);
  }, []);

  const reset = useCallback(() => {
    closeStream();
    jobIdRef.current = null;
    savedRef.current = false;
    setJob(null);
  }, [closeStream]);

  return { job, active, start, cancel, saveAgain, reset };
}
