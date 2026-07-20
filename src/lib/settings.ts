"use client";

import { useSyncExternalStore } from "react";
import type { AppSettings } from "./types";

const KEY = "onyx:settings";
const EVT = "onyx:settings-changed";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultMode: "auto",
  videoQuality: "best",
  audioFormat: "mp3",
  autoFetch: true,
  saveHistory: true,
};

let cache: AppSettings = DEFAULT_SETTINGS;
let hydrated = false;

function read(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings> | null;
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function snapshot(): AppSettings {
  if (!hydrated && typeof window !== "undefined") {
    cache = read();
    hydrated = true;
  }
  return cache;
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache = read();
    onChange();
  };
  window.addEventListener("storage", handler);
  window.addEventListener(EVT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(EVT, handler);
  };
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const next = { ...snapshot(), ...patch };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); keep the in-memory value.
  }
  window.dispatchEvent(new Event(EVT));
}

export function resetSettings(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  cache = DEFAULT_SETTINGS;
  window.dispatchEvent(new Event(EVT));
}

/** Imperative read for event handlers — always returns the latest persisted value. */
export function getSettings(): AppSettings {
  return snapshot();
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SETTINGS);
}
