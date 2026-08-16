import fs from "node:fs";
import path from "node:path";

export function cookieFileCandidates(): string[] {
  return [
    process.env.COOKIES_PATH,
    path.join(process.cwd(), "cookies.txt"),
    path.join(process.cwd(), "cookies.dat"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export function findCookieFile(): string | undefined {
  return cookieFileCandidates().find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function writableCookieFile(): string {
  return process.env.COOKIES_PATH ?? path.join(process.cwd(), "cookies.txt");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

export function isLoopbackRequest(req: Request): boolean {
  return isLoopbackHost(new URL(req.url).hostname);
}

export function isLocalAppRequest(req: Request): boolean {
  const url = new URL(req.url);
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return false;
  const origin = new URL(rawOrigin);
  return isLoopbackRequest(req) && isLoopbackHost(origin.hostname) && origin.port === url.port;
}

export function isNetscapeCookieFile(contents: string): boolean {
  if (!/^# Netscape HTTP Cookie File/im.test(contents)) return false;
  return contents.split(/\r?\n/).some((line) => {
    const value = line.startsWith("#HttpOnly_") ? line.slice(10) : line;
    return value && !value.startsWith("#") && value.split("\t").length >= 7;
  });
}
