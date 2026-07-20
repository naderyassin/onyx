/**
 * Normalizes user input into an absolute http(s) URL, or returns null when the
 * text can't plausibly be a link. Accepts scheme-less input like "youtube.com/watch?v=…".
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(trimmed)) {
      candidate = `https://${trimmed}`;
    } else {
      return null;
    }
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidUrl(raw: string): boolean {
  return normalizeUrl(raw) !== null;
}
