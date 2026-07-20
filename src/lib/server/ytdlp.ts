import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AudioFormat, DownloadMode, VideoInfo, VideoQuality } from "@/lib/types";
import { resolveBinaries } from "./binaries";
import { AppError } from "./errors";
import { isTerminal, type InternalJob } from "./jobs";

const INFO_TIMEOUT_MS = 75_000;
const MAX_JSON_BYTES = 64 * 1024 * 1024;

const YTDLP_MISSING = () =>
  new AppError(
    "YTDLP_MISSING",
    "yt-dlp was not found on this machine. Install it, then refresh binary status in Settings.",
    503,
  );

interface RawFormat {
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
}

interface RawInfo {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  uploader_id?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string }[];
  extractor_key?: string;
  webpage_url?: string;
  formats?: RawFormat[];
  _type?: string;
  entries?: RawInfo[];
}

/**
 * yt-dlp needs a JavaScript runtime to solve YouTube's signature challenges
 * (without one, downloads intermittently fail with 403). The Node binary
 * running this server is always available — hand it over.
 */
function jsRuntimeArgs(): string[] {
  return ["--js-runtimes", `node:${process.execPath}`];
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  const bins = await resolveBinaries();
  if (!bins.ytdlp.found || !bins.ytdlp.path) throw YTDLP_MISSING();

  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      bins.ytdlp.path!,
      ["-J", "--no-playlist", "--no-warnings", ...jsRuntimeArgs(), url],
      { timeout: INFO_TIMEOUT_MS, maxBuffer: MAX_JSON_BYTES, windowsHide: true },
      (err, out, stderr) => {
        if (err) {
          reject(mapInfoError(err as Error & { killed?: boolean }, String(stderr ?? "")));
          return;
        }
        resolve(String(out));
      },
    );
  });

  let raw: RawInfo;
  try {
    raw = JSON.parse(stdout) as RawInfo;
  } catch {
    throw new AppError("EXTRACT_FAILED", "Could not read video metadata from this link.", 502);
  }
  if (raw._type === "playlist") raw = raw.entries?.[0] ?? raw;
  return normalize(raw, url);
}

function mapInfoError(err: Error & { killed?: boolean }, stderr: string): AppError {
  if (err.killed) {
    return new AppError("TIMEOUT", "The site took too long to respond. Try again.", 504);
  }
  const errorLine = stderr
    .split(/\r?\n/)
    .find((l) => l.startsWith("ERROR:"))
    ?.slice(6)
    .trim();
  if (/Unsupported URL/i.test(stderr)) {
    return new AppError(
      "UNSUPPORTED",
      "This link isn't supported yet. Check the Supported Sites page.",
      422,
    );
  }
  if (/is not a valid URL/i.test(stderr)) {
    return new AppError("INVALID_URL", "That doesn't look like a valid link.", 400);
  }
  if (/Sign in to confirm|login required|logged.in|use --cookies/i.test(stderr)) {
    return new AppError(
      "RESTRICTED",
      "This content requires sign-in, so it can't be fetched anonymously.",
      403,
    );
  }
  if (/Private video|Video unavailable|no longer available|has been removed/i.test(stderr)) {
    return new AppError("UNAVAILABLE", "This video is private, removed, or unavailable.", 404);
  }
  if (/getaddrinfo|Unable to download webpage|Connection refused|timed out/i.test(stderr)) {
    return new AppError(
      "NETWORK",
      "Couldn't reach the site. Check your connection and try again.",
      502,
    );
  }
  return new AppError(
    "EXTRACT_FAILED",
    errorLine ?? "Couldn't fetch video details for this link.",
    502,
  );
}

function estimateSize(f: RawFormat, duration?: number): { bytes?: number; approx: boolean } {
  if (f.filesize) return { bytes: f.filesize, approx: false };
  if (f.filesize_approx) return { bytes: Math.round(f.filesize_approx), approx: true };
  const rate = f.tbr ?? f.abr;
  // tbr is in kbit/s → bytes = kbit/s * 125 * seconds
  if (rate && duration) return { bytes: Math.round(rate * 125 * duration), approx: true };
  return { approx: true };
}

function normalize(raw: RawInfo, sourceUrl: string): VideoInfo {
  const duration =
    raw.duration != null && Number.isFinite(raw.duration) ? Math.round(raw.duration) : undefined;
  const formats = raw.formats ?? [];
  const hasVideo = (f: RawFormat) => !!f.vcodec && f.vcodec !== "none";
  const hasAudio = (f: RawFormat) => !!f.acodec && f.acodec !== "none";

  const videoFormats = formats.filter((f) => hasVideo(f) && (f.height ?? 0) > 0);
  const audioOnly = formats.filter((f) => hasAudio(f) && !hasVideo(f));
  const bestAudio = audioOnly.length
    ? audioOnly.reduce((a, b) => ((b.abr ?? b.tbr ?? 0) > (a.abr ?? a.tbr ?? 0) ? b : a))
    : undefined;
  const audioEst = bestAudio ? estimateSize(bestAudio, duration) : undefined;

  const heights = [...new Set(videoFormats.map((f) => f.height as number))]
    .sort((a, b) => b - a)
    .slice(0, 8);

  const qualities: VideoQuality[] = heights.map((height) => {
    const candidates = videoFormats.filter((f) => f.height === height);
    const best = candidates.reduce((a, b) => ((b.tbr ?? 0) > (a.tbr ?? 0) ? b : a));
    const est = estimateSize(best, duration);
    const fps = best.fps && best.fps >= 45 ? Math.round(best.fps) : undefined;
    // Video-only streams get merged with the best audio stream, so add its size.
    const needsAudio = !hasAudio(best);
    const estBytes =
      est.bytes != null ? est.bytes + (needsAudio ? (audioEst?.bytes ?? 0) : 0) : undefined;
    return {
      height,
      fps,
      label: `${height}p${fps ?? ""}`,
      estBytes,
      approx: est.approx || (needsAudio && (audioEst?.approx ?? false)),
    };
  });

  const thumbnail =
    raw.thumbnail ??
    raw.thumbnails
      ?.filter((t) => !!t.url)
      .at(-1)?.url;

  return {
    id: raw.id ?? raw.webpage_url ?? sourceUrl,
    sourceUrl: raw.webpage_url ?? sourceUrl,
    extractor: prettyExtractor(raw.extractor_key),
    title: raw.title ?? "Untitled",
    uploader: raw.uploader ?? raw.channel ?? raw.uploader_id,
    durationSec: duration,
    thumbnailUrl: thumbnail,
    qualities,
    audioEstBytes: audioEst?.bytes,
    autoEstBytes: qualities[0]?.estBytes,
    bestHeight: heights[0],
  };
}

function prettyExtractor(key?: string): string {
  if (!key) return "Web";
  const map: Record<string, string> = {
    Youtube: "YouTube",
    Twitter: "X",
    Soundcloud: "SoundCloud",
    BiliBili: "Bilibili",
    Generic: "Web",
  };
  return map[key] ?? key;
}

export interface DownloadOptions {
  mode: DownloadMode;
  height?: number;
  audioFormat?: AudioFormat;
}

export async function startDownload(job: InternalJob, opts: DownloadOptions): Promise<void> {
  const bins = await resolveBinaries();
  if (!bins.ytdlp.found || !bins.ytdlp.path) throw YTDLP_MISSING();
  const ffmpegPath = bins.ffmpeg.found ? bins.ffmpeg.path : undefined;
  if (opts.mode === "audio" && !ffmpegPath) {
    throw new AppError(
      "FFMPEG_MISSING",
      "FFmpeg is required to extract audio. Install it, then refresh binary status in Settings.",
      503,
    );
  }

  const args = buildArgs(job.dir, opts, ffmpegPath);
  args.push(job.url);

  const proc = spawn(bins.ytdlp.path, args, { windowsHide: true });
  job.proc = proc;
  job.status = "starting";

  let outBuf = "";
  let errBuf = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    outBuf = consumeLines(job, outBuf + chunk.toString("utf8"));
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    errBuf = consumeLines(job, errBuf + chunk.toString("utf8"));
  });
  proc.on("error", (err) => {
    job.status = "error";
    job.error = `Failed to launch yt-dlp: ${err.message}`;
  });
  proc.on("close", (code) => finalize(job, code));
}

const PROGRESS_TPL =
  "download:[dl]|%(progress.status)s|%(progress.downloaded_bytes|0)j|%(progress.total_bytes|0)j|%(progress.total_bytes_estimate|0)j|%(progress.speed|0)j|%(progress.eta|0)j";

function buildArgs(dir: string, opts: DownloadOptions, ffmpegPath?: string): string[] {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--progress",
    "--progress-template",
    PROGRESS_TPL,
    "--windows-filenames",
    "--no-mtime",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    ...jsRuntimeArgs(),
    "-o",
    path.join(dir, "%(title).140B [%(id)s].%(ext)s"),
  ];
  // Only pin the location when it's a real path — passing the bare "ffmpeg"
  // PATH alias would override yt-dlp's own (working) PATH lookup.
  if (ffmpegPath && path.isAbsolute(ffmpegPath)) args.push("--ffmpeg-location", ffmpegPath);

  if (opts.mode === "audio") {
    args.push(
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      opts.audioFormat ?? "mp3",
      "--audio-quality",
      "0",
      "--embed-metadata",
    );
    return args;
  }

  const h = opts.mode === "video" ? opts.height : undefined;
  if (ffmpegPath) {
    const selector = h
      ? `bv*[height<=${h}]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`
      : "bv*+ba[ext=m4a]/bv*+ba/b";
    args.push("-f", selector, "--merge-output-format", "mp4/mkv");
  } else {
    // Without ffmpeg we can't merge separate streams — grab the best muxed file.
    args.push("-f", h ? `b[height<=${h}]/b` : "b");
  }
  return args;
}

function consumeLines(job: InternalJob, buffer: string): string {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  for (const line of lines) parseLine(job, line.trim());
  return rest;
}

function num(s: string | undefined): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseLine(job: InternalJob, line: string): void {
  if (!line) return;
  if (line.startsWith("[dl]|")) {
    const [, status, down, total, totalEst, speed, eta] = line.split("|");
    const downloaded = num(down);
    const totalBytes = num(total) || num(totalEst);
    if (status === "downloading" && !job.canceled) {
      job.status = "downloading";
      job.downloadedBytes = downloaded;
      job.totalBytes = totalBytes || undefined;
      job.speedBps = num(speed) || undefined;
      job.etaSec = num(eta) || undefined;
      if (totalBytes > 0) job.progress = Math.min(100, (downloaded / totalBytes) * 100);
    } else if (status === "finished") {
      job.progress = 100;
    }
    return;
  }
  if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer|Fixup\w*|Metadata|EmbedThumbnail)\]/.test(line)) {
    if (!job.canceled && !isTerminal(job.status)) job.status = "processing";
    return;
  }
  if (line.startsWith("ERROR:")) {
    job.error = line.slice(6).trim();
  }
}

function finalize(job: InternalJob, code: number | null): void {
  if (job.canceled) {
    job.status = "canceled";
    return;
  }
  if (code === 0) {
    const file = pickOutputFile(job.dir);
    if (file) {
      job.fileName = file.name;
      job.filePath = file.path;
      job.fileSize = file.size;
      job.status = "complete";
      job.progress = 100;
      job.speedBps = undefined;
      job.etaSec = undefined;
      return;
    }
    job.status = "error";
    job.error = "Download finished but the output file could not be located.";
    return;
  }
  job.status = "error";
  job.error = friendlyDownloadError(job.error);
}

function friendlyDownloadError(raw?: string): string {
  if (!raw) return "The download failed. Try a different quality or check the link.";
  if (/ffmpeg/i.test(raw)) {
    return "FFmpeg failed while processing the file. Check that FFmpeg is installed correctly.";
  }
  if (/Requested format is not available/i.test(raw)) {
    return "That quality isn't available for this video. Pick another one.";
  }
  return raw;
}

const JUNK_SUFFIXES = [".part", ".ytdl", ".temp", ".tmp"];

function pickOutputFile(
  dir: string,
): { name: string; path: string; size: number } | undefined {
  try {
    const names = fs
      .readdirSync(dir)
      .filter((f) => !JUNK_SUFFIXES.some((suffix) => f.endsWith(suffix)));
    let best: { name: string; path: string; size: number } | undefined;
    for (const name of names) {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && (!best || stat.size > best.size)) {
        best = { name, path: filePath, size: stat.size };
      }
    }
    return best;
  } catch {
    return undefined;
  }
}
