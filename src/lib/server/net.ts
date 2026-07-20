import dns from "node:dns/promises";
import net from "node:net";

/**
 * Parses a URL and accepts it only if it is http(s) pointing at a plausibly
 * public host. This is a hygiene guard for a locally-run app, not a hardened
 * SSRF boundary.
 */
export function parsePublicHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  if (net.isIP(host) && isPrivateIp(host)) return null;
  if (!net.isIP(host) && !host.includes(".")) return null;
  return url;
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true;
    const mapped = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Resolves a hostname and reports whether any of its addresses are private. */
export async function hostResolvesPrivate(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return isPrivateIp(hostname);
  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    return addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true;
  }
}
