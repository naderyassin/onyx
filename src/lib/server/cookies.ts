import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CookiesBrowser = "chrome" | "edge" | "firefox" | "brave" | "safari";

/**
 * Known cookie-store paths per browser per platform.
 * We just check if the path exists — yt-dlp handles the actual reading.
 * Priority order: Edge first on Windows (pre-installed), then Chrome, Brave, Firefox.
 */
const BROWSER_PATHS: Record<string, Partial<Record<NodeJS.Platform, string[]>>> = {
  edge: {
    win32: [
      path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "Microsoft", "Edge", "User Data", "Default", "Network", "Cookies",
      ),
      path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "Microsoft", "Edge", "User Data", "Default", "Cookies",
      ),
    ],
    darwin: [
      path.join(os.homedir(), "Library", "Application Support", "Microsoft Edge", "Default", "Cookies"),
    ],
    linux: [
      path.join(os.homedir(), ".config", "microsoft-edge", "Default", "Cookies"),
    ],
  },
  chrome: {
    win32: [
      path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "Google", "Chrome", "User Data", "Default", "Network", "Cookies",
      ),
      path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "Google", "Chrome", "User Data", "Default", "Cookies",
      ),
    ],
    darwin: [
      path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome", "Default", "Cookies"),
    ],
    linux: [
      path.join(os.homedir(), ".config", "google-chrome", "Default", "Cookies"),
    ],
  },
  brave: {
    win32: [
      path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "BraveSoftware", "Brave-Browser", "User Data", "Default", "Network", "Cookies",
      ),
    ],
    darwin: [
      path.join(os.homedir(), "Library", "Application Support", "BraveSoftware", "Brave-Browser", "Default", "Cookies"),
    ],
    linux: [
      path.join(os.homedir(), ".config", "BraveSoftware", "Brave-Browser", "Default", "Cookies"),
    ],
  },
  firefox: {
    win32: [
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "Mozilla", "Firefox", "Profiles",
      ),
    ],
    darwin: [
      path.join(os.homedir(), "Library", "Application Support", "Firefox", "Profiles"),
    ],
    linux: [
      path.join(os.homedir(), ".mozilla", "firefox"),
    ],
  },
  safari: {
    darwin: [
      path.join(os.homedir(), "Library", "Cookies", "Cookies.binarycookies"),
    ],
  },
};

function browserExists(name: string): boolean {
  const platform = process.platform as NodeJS.Platform;
  const paths = BROWSER_PATHS[name]?.[platform];
  if (!paths) return false;

  return paths.some((p) => {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        // Firefox uses a Profiles directory — check it exists and has a default profile.
        return fs.readdirSync(p).some((f) =>
          f.includes("default") || f.includes("release"),
        );
      }
      return stat.isFile();
    } catch {
      return false;
    }
  });
}

// Cached result — detection is disk I/O, no need to repeat it on every call.
let _detected: CookiesBrowser | null | undefined = undefined;

/**
 * Returns the first available browser whose cookie store exists on this machine,
 * or null if none is found. Result is cached for the process lifetime.
 */
export function detectCookiesBrowser(): CookiesBrowser | null {
  if (_detected !== undefined) return _detected;
  // Windows deliberately skips every Chromium browser: since v127 they encrypt
  // the cookie DB with App-Bound Encryption, and yt-dlp cannot read it at all
  // (yt-dlp#10927 / #7271) — verified live here, Edge fails "Failed to decrypt
  // with DPAPI" and Chrome "Could not copy Chrome cookie database", every time.
  // Offering them anyway made every Windows request spend its first attempt on
  // a guaranteed failure, burning the single retry that exists for real blocks.
  // Firefox stays: plain sqlite, no OS crypto, still readable there.
  const priority: CookiesBrowser[] =
    process.platform === "win32"
      ? ["firefox"]
      : process.platform === "darwin"
        ? ["chrome", "safari", "firefox", "brave"]
        : ["chrome", "firefox", "brave"];

  _detected = priority.find(browserExists) ?? null;
  return _detected;
}
