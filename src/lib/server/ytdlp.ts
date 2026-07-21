import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  AudioFormat,
  DownloadMode,
  InfoResult,
  PlaylistInfo,
  VideoInfo,
  VideoQuality,
} from "@/lib/types";
import { resolveBinaries } from "./binaries";
import { AppError } from "./errors";
import { isTerminal, type InternalJob } from "./jobs";
import { zipDirectory } from "./zip";

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
  entries?: (RawInfo | null)[];
  playlist_count?: number;
}

/**
 * yt-dlp needs a JavaScript runtime to solve YouTube's signature challenges
 * (without one, downloads intermittently fail with 403). The Node binary
 * running this server is always available — hand it over.
 */
function jsRuntimeArgs(): string[] {
  return ["--js-runtimes", `node:${process.execPath}`];
}

function runInfoOnce(bin: string, args: string[]): Promise<RawInfo> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: INFO_TIMEOUT_MS, maxBuffer: MAX_JSON_BYTES, windowsHide: true },
      (err, out, stderr) => {
        if (err) {
          reject(mapInfoError(err as Error & { killed?: boolean }, String(stderr ?? "")));
          return;
        }
        resolve(String(out));
      },
    );
  }).then((stdout) => {
    try {
      return JSON.parse(stdout) as RawInfo;
    } catch {
      throw new AppError("EXTRACT_FAILED", "Could not read video metadata from this link.", 502);
    }
  });
}

/**
 * Sites that throttle anonymous scraping (TikTok is the worst offender) refuse
 * a share of requests with a 403 or a bot-check page, then serve the very same
 * link moments later — the block is per-request, not per-video.
 *
 * One cheap retry, because measurement says that is all a retry is worth here:
 * the block is time-correlated, so back-to-back attempts mostly land inside the
 * same bad window (4 fast attempts recovered no more links than 1). Spacing
 * them far enough apart to help would cost the user half a minute of spinner
 * before an error, and the honest message already invites them to try again —
 * a manual retry naturally lands outside the window. Only block/rate-limit
 * answers requalify; a missing or unsupported video still fails on first pass.
 */
const INFO_ATTEMPTS = 2;
const RETRY_BASE_MS = 2_500;

function isRetryable(err: unknown): boolean {
  return err instanceof AppError && (err.code === "BLOCKED" || err.code === "RATE_LIMITED");
}

async function runInfoJson(args: string[]): Promise<RawInfo> {
  const bins = await resolveBinaries();
  if (!bins.ytdlp.found || !bins.ytdlp.path) throw YTDLP_MISSING();

  for (let attempt = 1; ; attempt++) {
    try {
      return await runInfoOnce(bins.ytdlp.path, args);
    } catch (err) {
      if (attempt >= INFO_ATTEMPTS || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
    }
  }
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  let raw = await runInfoJson(["-J", "--no-playlist", "--no-warnings", ...jsRuntimeArgs(), url]);
  if (raw._type === "playlist") raw = firstEntry(raw) ?? raw;
  return normalize(raw, url);
}

/**
 * Detects whether the link is a playlist and returns the right shape:
 * a lone video, a video that belongs to a playlist (with the list attached),
 * or a pure playlist page. Uses a cheap `--flat-playlist` probe first.
 */
export async function fetchInfo(url: string): Promise<InfoResult> {
  const flat = await runInfoJson([
    "-J",
    "--flat-playlist",
    "--no-warnings",
    ...jsRuntimeArgs(),
    url,
  ]);

  const entries = (flat.entries ?? []).filter((e): e is RawInfo => !!e);
  if (flat._type === "playlist" && entries.length > 0) {
    const playlist = buildPlaylistInfo(flat, entries, url);
    // A watch URL that also names a playlist: keep it a single-video card and
    // offer the whole list as a separate option.
    if (queryParam(url, "v")) {
      const video = await fetchVideoInfo(url);
      return { kind: "video", ...video, playlist };
    }
    return { kind: "playlist", ...playlist };
  }

  // Not a playlist. The flat probe already carries this lone video's formats,
  // so reuse it; only fall back to a full extraction if formats are missing.
  if (flat.formats?.length) return { kind: "video", ...normalize(flat, url) };
  return { kind: "video", ...(await fetchVideoInfo(url)) };
}

function firstEntry(raw: RawInfo): RawInfo | undefined {
  return (raw.entries ?? []).find((e): e is RawInfo => !!e);
}

function queryParam(rawUrl: string, key: string): string | null {
  try {
    return new URL(rawUrl).searchParams.get(key);
  } catch {
    return null;
  }
}

function buildPlaylistInfo(raw: RawInfo, entries: RawInfo[], sourceUrl: string): PlaylistInfo {
  const durations = entries
    .map((e) => e.duration)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d));
  const totalDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0))
    : undefined;

  const pickThumb = (info?: RawInfo) =>
    info?.thumbnail ?? info?.thumbnails?.filter((t) => !!t.url).at(-1)?.url;
  const thumbnail = pickThumb(raw) ?? pickThumb(entries[0]);

  return {
    id: raw.id ?? raw.webpage_url ?? sourceUrl,
    sourceUrl: raw.webpage_url ?? sourceUrl,
    extractor: prettyExtractor(raw.extractor_key),
    title: raw.title ?? "Untitled playlist",
    uploader: raw.uploader ?? raw.channel ?? raw.uploader_id,
    thumbnailUrl: thumbnail,
    count: raw.playlist_count ?? entries.length,
    totalDurationSec: totalDuration,
    previewTitles: entries.slice(0, 5).map((e) => e.title ?? "Untitled"),
  };
}

/** Pulls the HTTP status out of yt-dlp's "HTTP Error 403: Forbidden" wording. */
function httpStatus(stderr: string): number | undefined {
  const match = stderr.match(/HTTP\s?Error:?\s*(\d{3})/i);
  return match ? Number(match[1]) : undefined;
}

/** The `[TikTok]` / `[youtube]` tag yt-dlp prefixes its error lines with. */
function siteOf(stderr: string): string {
  const key = stderr.match(/ERROR:\s*\[([\w:-]+)\]/)?.[1];
  return key ? prettyExtractor(key.split(":")[0]) : "The site";
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
  // yt-dlp wraps every HTTP failure in "Unable to download webpage", so the real
  // status has to be read out before anything gets blamed on the connection.
  const status = httpStatus(stderr);
  const site = siteOf(stderr);
  if (status === 401 || status === 403) {
    return new AppError(
      "BLOCKED",
      `${site} refused the request (HTTP ${status}). It's blocking anonymous downloads right now — try again later.`,
      403,
    );
  }
  if (status === 429) {
    return new AppError(
      "RATE_LIMITED",
      `${site} is rate-limiting this machine (HTTP 429). Wait a few minutes and try again.`,
      429,
    );
  }
  if (status === 404 || status === 410) {
    return new AppError("UNAVAILABLE", "That link points to something that no longer exists.", 404);
  }
  if (status != null && status >= 500) {
    return new AppError(
      "UPSTREAM",
      `${site} is having trouble (HTTP ${status}). Try again shortly.`,
      502,
    );
  }
  // A throttling site may also answer with a bot-check page instead of an error
  // code, which yt-dlp reports as a parse failure. Same soft block as the 403,
  // and it clears on a retry just as readily, so it earns the same treatment.
  if (
    /Unable to extract universal data|Unable to extract webpage video data|Unable to extract initial state/i.test(
      stderr,
    )
  ) {
    return new AppError(
      "BLOCKED",
      `${site} served a bot check instead of the video. It's throttling automated requests — try again in a moment.`,
      403,
    );
  }
  if (
    /getaddrinfo|Unable to download webpage|Connection refused|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Network is unreachable|timed out/i.test(
      stderr,
    )
  ) {
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

// Keyed lowercase: yt-dlp's JSON says "Youtube" but its error lines say
// "[youtube]", and both land here.
const EXTRACTOR_NAMES: Record<string, string> = {
  youtube: "YouTube",
  youtubetab: "YouTube",
  youtubeplaylist: "YouTube",
  twitter: "X",
  tiktok: "TikTok",
  tiktokuser: "TikTok",
  soundcloud: "SoundCloud",
  bilibili: "Bilibili",
  generic: "Web",
};

function prettyExtractor(key?: string): string {
  if (!key) return "Web";
  return EXTRACTOR_NAMES[key.toLowerCase()] ?? key;
}

export interface DownloadOptions {
  mode: DownloadMode;
  height?: number;
  audioFormat?: AudioFormat;
  playlist?: boolean;
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

  const args = buildArgs(job, opts, ffmpegPath);
  args.push(job.url);

  // Kept on the job so a paused download can be respawned byte-for-byte.
  job.bin = bins.ytdlp.path;
  job.argv = args;
  spawnYtdlp(job);
}

/**
 * Restarts a paused job. yt-dlp resumes the `.part` file it left behind, and
 * for playlists the download archive makes it skip the items already finished.
 */
export function resumeDownload(job: InternalJob): void {
  if (!job.bin || !job.argv) throw YTDLP_MISSING();
  job.pausing = false;
  job.pausedAt = undefined;
  job.error = undefined;
  job.lastByteAt = Date.now();
  spawnYtdlp(job);
}

function spawnYtdlp(job: InternalJob): void {
  const proc = spawn(job.bin!, job.argv!, { windowsHide: true });
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

// Playlist fields ride at the end so a "|" inside a title (JSON-quoted by `j`)
// can't shift the numeric fields ahead of it.
const PROGRESS_TPL =
  "download:[dl]|%(progress.status)s|%(progress.downloaded_bytes|0)j|%(progress.total_bytes|0)j|%(progress.total_bytes_estimate|0)j|%(progress.speed|0)j|%(progress.eta|0)j|%(progress.fragment_index|0)j|%(progress.fragment_count|0)j|%(info.playlist_index|0)j|%(info.playlist_count|0)j|%(info.title)j";

function buildArgs(job: InternalJob, opts: DownloadOptions, ffmpegPath?: string): string[] {
  const contentDir = job.contentDir;
  const args = [
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
  ];

  if (opts.playlist) {
    args.push(
      "--yes-playlist",
      // Skip unavailable/private videos and keep going through the list.
      "--ignore-errors",
      // Records each finished item so resuming after a pause doesn't redownload
      // it. Lives in `dir`, not `contentDir`, so it never lands in the zip.
      "--download-archive",
      path.join(job.dir, "archive.txt"),
      // Flat files with a tight title budget: a playlist-title subfolder plus
      // long titles overflows Windows' 260-char path limit and every write
      // fails with "unable to open for writing". The zip step adds the
      // playlist-named folder instead.
      "-o",
      path.join(contentDir, "%(playlist_index)03d - %(title).100B.%(ext)s"),
    );
  } else {
    // Budget the title tighter than the final filename needs. Before ffmpeg
    // merges separate video+audio downloads, each stream is written under its
    // own intermediate name — "<title> [id].f<format_id><v|a>.<ext>.part" — and
    // that suffix (~45 chars) is what has to fit under Windows' 260-char path
    // limit, not just the merged result. A 140-byte title left no headroom and
    // failed every write on a long-titled video (e.g. Facebook posts, whose
    // "title" is the post's full caption).
    args.push("--no-playlist", "-o", path.join(contentDir, "%(title).90B [%(id)s].%(ext)s"));
  }

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

function parseTitle(json: string): string | undefined {
  if (!json || json === "null") return undefined;
  try {
    const value = JSON.parse(json) as unknown;
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Maintains the running byte total and the last-movement timestamp. yt-dlp
 * restarts `downloaded_bytes` from zero for every stream (a video and an audio
 * stream per item), so a counter that goes backwards means a new stream began
 * and the old one's bytes must be banked.
 */
function trackBytes(job: InternalJob, downloaded: number): void {
  if (downloaded < job.streamBytes) {
    job.priorBytes += job.streamBytes;
    job.streamBytes = 0;
  }
  if (downloaded !== job.streamBytes) job.lastByteAt = Date.now();
  job.streamBytes = downloaded;
}

function parseLine(job: InternalJob, line: string): void {
  if (!line) return;
  if (line.startsWith("[dl]|")) {
    const parts = line.split("|");
    const [, status, down, total, totalEst, speed, eta, fragIdx, fragCount, plIndex, plCount] =
      parts;
    const downloaded = num(down);
    const totalBytes = num(total) || num(totalEst);
    const index = num(plIndex);
    const count = num(plCount);

    if (status === "downloading" && !job.canceled && !job.pausing) {
      job.status = "downloading";
      trackBytes(job, downloaded);
      job.downloadedBytes = downloaded;
      job.totalBytes = totalBytes || undefined;
      job.speedBps = num(speed) || undefined;
      job.etaSec = num(eta) || undefined;
      job.fragmentIndex = num(fragIdx) || undefined;
      job.fragmentCount = num(fragCount) || undefined;

      // Byte totals are unknown for HLS/DASH streams — fall back to fragments
      // so the bar still moves instead of sitting at zero.
      if (totalBytes > 0) {
        job.itemProgress = Math.min(100, (downloaded / totalBytes) * 100);
      } else if (job.fragmentCount) {
        job.itemProgress = Math.min(100, ((job.fragmentIndex ?? 0) / job.fragmentCount) * 100);
      }

      if (job.isPlaylist && job.playlist) {
        if (count > 0) job.playlist.count = count;
        if (index > 0) {
          job.playlist.index = Math.max(job.playlist.index ?? 0, index);
          // Remember which items actually started; everything below the current
          // index that never started was skipped by yt-dlp.
          (job.startedIndices ??= new Set()).add(index);
          let startedBelow = 0;
          for (const i of job.startedIndices) if (i < index) startedBelow += 1;
          job.playlist.completed = startedBelow;
          job.playlist.skipped = Math.max(0, index - 1 - startedBelow);
        }
        const title = parseTitle(parts.slice(11).join("|"));
        if (title) job.playlist.currentTitle = title;
        // Overall progress across the whole list, not just the current item.
        const effCount = job.playlist.count ?? count;
        if (effCount && index > 0) {
          job.progress = Math.min(100, ((index - 1 + job.itemProgress / 100) / effCount) * 100);
        }
      } else {
        job.progress = job.itemProgress;
      }
    } else if (status === "finished") {
      // Bank the stream that just ended so the session total stays accurate.
      job.priorBytes += job.streamBytes;
      job.streamBytes = 0;
      job.lastByteAt = Date.now();
      job.itemProgress = 100;
      if (!job.isPlaylist) job.progress = 100;
    }
    return;
  }
  if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer|Fixup\w*|Metadata|EmbedThumbnail)\]/.test(line)) {
    // For playlists these fire once per item — stay "downloading" and let the
    // final zip step be the single "processing" phase.
    if (!job.isPlaylist && !job.canceled && !job.pausing && !isTerminal(job.status)) {
      job.status = "processing";
    }
    return;
  }
  // yt-dlp announces the playlist name once — it becomes the zip name.
  const plName = line.match(/^\[download\] Downloading playlist: (.+)$/)?.[1];
  if (plName && job.playlist) {
    job.playlist.title ??= plName.trim();
    return;
  }
  if (line.startsWith("ERROR:")) {
    // Whatever yt-dlp shouts on its way out of a pause isn't the user's problem.
    if (job.pausing || job.canceled) return;
    const message = line.slice(6).trim();
    if (job.isPlaylist && job.playlist) {
      // The skipped *count* is derived from playlist-index gaps above — yt-dlp
      // prints many ERROR lines per failure (retries, fragments, summary), so
      // counting them here would wildly overcount. Only log the meaningful
      // "this video is unavailable" reasons, de-duplicated, for the record.
      if (
        /unavailable|private|removed|deleted|members-only|sign in|not available|blocked|age.?restrict|copyright/i.test(
          message,
        ) &&
        job.playlist.skippedTitles.length < 25 &&
        !job.playlist.skippedTitles.includes(message)
      ) {
        job.playlist.skippedTitles.push(message);
      }
      // Keep the last raw error so a zero-file run can explain itself.
      job.error = message;
    } else {
      job.error = message;
    }
  }
}

function finalize(job: InternalJob, code: number | null): void {
  // A pause kills the process on purpose — the non-zero exit isn't a failure,
  // and the partial files stay on disk for the resume.
  if (job.pausing) {
    job.pausing = false;
    job.status = "paused";
    job.speedBps = undefined;
    job.etaSec = undefined;
    return;
  }
  if (job.canceled) {
    job.status = "canceled";
    return;
  }
  if (job.isPlaylist) {
    // With --ignore-errors yt-dlp may exit non-zero after skipping items, so we
    // judge success by whether anything actually landed on disk.
    void finalizePlaylist(job);
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
      job.itemProgress = 100;
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
  const status = httpStatus(raw);
  if (status === 401 || status === 403) {
    return "The site refused the download (HTTP 403). It's blocking anonymous downloads right now — try again later.";
  }
  if (status === 429) {
    return "The site is rate-limiting this machine (HTTP 429). Wait a few minutes and try again.";
  }
  if (/ffmpeg/i.test(raw)) {
    return "FFmpeg failed while processing the file. Check that FFmpeg is installed correctly.";
  }
  if (/Requested format is not available/i.test(raw)) {
    return "That quality isn't available for this video. Pick another one.";
  }
  if (/unable to open for writing/i.test(raw)) {
    return "Windows rejected the file path (too long). Try again — if it persists, report it.";
  }
  return raw;
}

const JUNK_SUFFIXES = [".part", ".ytdl", ".temp", ".tmp"];

/**
 * Packages a finished playlist: locate the downloaded files, zip them under a
 * folder named after the playlist, and mark the job complete. Runs async off
 * the process-close handler; the zip phase surfaces as "processing".
 */
async function finalizePlaylist(job: InternalJob): Promise<void> {
  try {
    const files = listFilesRecursive(job.contentDir).filter(
      (f) => !JUNK_SUFFIXES.some((suffix) => f.endsWith(suffix)),
    );

    if (files.length === 0) {
      job.status = "error";
      job.error = job.error
        ? friendlyDownloadError(job.error)
        : "None of the playlist's videos could be downloaded.";
      return;
    }

    job.status = "processing";
    const name = sanitizeName(job.playlist?.title ?? "playlist");
    const zipPath = path.join(job.dir, `${name}.zip`);
    const size = await zipDirectory(job.contentDir, zipPath, name);

    job.fileName = `${name}.zip`;
    job.filePath = zipPath;
    job.fileSize = size;
    if (job.playlist) {
      // Final tallies come straight from what landed on disk.
      job.playlist.completed = files.length;
      if (job.playlist.count != null) {
        job.playlist.skipped = Math.max(0, job.playlist.count - files.length);
      }
      job.playlist.currentTitle = undefined;
    }
    // Per-item errors were recorded along the way; the run itself succeeded.
    job.error = undefined;
    job.progress = 100;
    job.itemProgress = 100;
    job.speedBps = undefined;
    job.etaSec = undefined;
    job.status = "complete";
  } catch (err) {
    job.status = "error";
    job.error = `Could not package the playlist: ${(err as Error).message}`;
  }
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
      else out.push(full);
    }
  } catch {}
  return out;
}

function sanitizeName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "playlist"
  );
}

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
