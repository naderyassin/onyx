import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BinaryStatus, HealthStatus } from "@/lib/types";

type BinaryName = "yt-dlp" | "ffmpeg";

// The standalone yt-dlp binary self-extracts into TMPDIR on every run; shared
// hosts often mount /tmp no-exec, which kills it silently. Point TMPDIR at an
// app-local dir (inherited by every child process we spawn).
if (process.platform !== "win32") {
  const tmp = path.join(process.cwd(), ".onyx-tmp");
  try {
    fs.mkdirSync(tmp, { recursive: true });
    process.env.TMPDIR = tmp;
  } catch {}
}

const CACHE_TTL_MS = 60_000;

const g = globalThis as unknown as {
  __onyxBinaries?: { at: number; value: HealthStatus };
};

/**
 * Candidate locations, in priority order: explicit env override, PATH, then
 * well-known install locations. The winget Links dir matters because a binary
 * installed mid-session isn't on this process's inherited PATH yet.
 */
function candidatesFor(name: BinaryName): string[] {
  const envOverride = name === "yt-dlp" ? process.env.YTDLP_PATH : process.env.FFMPEG_PATH;
  const list: string[] = [];
  if (envOverride) list.push(envOverride);
  // Bundled binaries for hosts with no shell access (e.g. shared hosting):
  // a bin/ dir shipped with the app, made executable here since chmod may
  // not have survived the upload.
  const bundled = path.join(
    process.cwd(),
    "bin",
    process.platform === "win32" ? `${name}.exe` : name,
  );
  if (fs.existsSync(bundled)) {
    try {
      fs.chmodSync(bundled, 0o755);
    } catch {}
    list.push(bundled);
  }
  list.push(name);
  if (process.platform === "win32") {
    list.push(...wingetCandidates(name));
  } else {
    list.push(`/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`);
  }
  return list;
}

/**
 * Winget adds install dirs to the *user* PATH at install time, which a server
 * process started earlier never sees — so probe its known locations directly:
 * the Links shim dir, portable package dirs, and nested `<pkg>/<sub>/bin`.
 */
function wingetCandidates(name: BinaryName): string[] {
  const local = process.env.LOCALAPPDATA;
  if (!local) return [];
  const out: string[] = [];
  const links = path.join(local, "Microsoft", "WinGet", "Links", `${name}.exe`);
  if (fs.existsSync(links)) out.push(links);

  const packagesRoot = path.join(local, "Microsoft", "WinGet", "Packages");
  try {
    for (const dir of fs.readdirSync(packagesRoot)) {
      if (!dir.toLowerCase().includes(name)) continue;
      const pkgDir = path.join(packagesRoot, dir);
      const direct = path.join(pkgDir, `${name}.exe`);
      if (fs.existsSync(direct)) out.push(direct);
      try {
        for (const sub of fs.readdirSync(pkgDir)) {
          const nested = path.join(pkgDir, sub, "bin", `${name}.exe`);
          if (fs.existsSync(nested)) out.push(nested);
        }
      } catch {}
    }
  } catch {}
  return out;
}

function probe(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    // 30s: the standalone yt-dlp self-extracts on first run, which can be
    // slow on shared-host CPUs.
    execFile(cmd, args, { timeout: 30_000, windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(String(stdout).split(/\r?\n/)[0]?.trim() ?? "");
    });
  });
}

async function resolveOne(name: BinaryName): Promise<BinaryStatus> {
  const versionArgs = name === "ffmpeg" ? ["-version"] : ["--version"];
  for (const candidate of candidatesFor(name)) {
    const out = await probe(candidate, versionArgs);
    if (out !== null) {
      const version =
        name === "ffmpeg" ? (out.match(/ffmpeg version (\S+)/)?.[1] ?? out) : out;
      return { found: true, version, path: candidate };
    }
  }
  return { found: false };
}

export async function resolveBinaries(force = false): Promise<HealthStatus> {
  const now = Date.now();
  if (!force && g.__onyxBinaries && now - g.__onyxBinaries.at < CACHE_TTL_MS) {
    return g.__onyxBinaries.value;
  }
  const [ytdlp, ffmpeg] = await Promise.all([resolveOne("yt-dlp"), resolveOne("ffmpeg")]);
  const value: HealthStatus = { ytdlp, ffmpeg };
  g.__onyxBinaries = { at: now, value };
  return value;
}
