"use client";

import { useCallback, useRef, useState } from "react";
import type { ApiError, InfoResult } from "@/lib/types";

export type InfoState = "idle" | "loading" | "success" | "error";

export function useVideoInfo() {
  const [state, setState] = useState<InfoState>("idle");
  const [data, setData] = useState<InfoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchInfo = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setError(null);

    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const json: unknown = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setData(null);
        setError((json as ApiError).error ?? "Couldn't fetch video details.");
        setState("error");
        return;
      }
      setData(json as InfoResult);
      setState("success");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setData(null);
      setError("Couldn't reach the server. Is the app still running?");
      setState("error");
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState("idle");
    setData(null);
    setError(null);
  }, []);

  return { state, data, error, fetchInfo, clear };
}
