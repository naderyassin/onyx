"use client";

import { useSyncExternalStore } from "react";
import type { HistoryEntry } from "./types";

const KEY = "onyx:history";
const EVT = "onyx:history-changed";
const MAX_ENTRIES = 200;

const SERVER_SNAPSHOT: HistoryEntry[] = [];

let cache: HistoryEntry[] = SERVER_SNAPSHOT;
let hydrated = false;

function read(): HistoryEntry[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function snapshot(): HistoryEntry[] {
  if (!hydrated && typeof window !== "undefined") {
    cache = read();
    hydrated = true;
  }
  return cache;
}

function write(list: HistoryEntry[]): void {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  window.dispatchEvent(new Event(EVT));
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

export function addHistoryEntry(entry: HistoryEntry): void {
  const list = [entry, ...snapshot().filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  write(list);
}

export function removeHistoryEntry(id: string): void {
  write(snapshot().filter((e) => e.id !== id));
}

export function clearHistory(): void {
  write([]);
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
}
