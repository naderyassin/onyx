const pad = (n: number) => n.toString().padStart(2, "0");

export function formatBytes(bytes?: number, approx = false): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const rendered = value >= 100 || i === 0 ? Math.round(value).toString() : value.toFixed(1);
  return `${approx ? "≈ " : ""}${rendered} ${units[i]}`;
}

export function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return "—";
  return `${formatBytes(bps)}/s`;
}

export function formatEta(sec?: number): string {
  if (sec == null || sec <= 0 || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
