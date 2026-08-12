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
import { detectCookiesBrowser } from "./cookies";
import { resolveBinaries } from "./binaries";
import { AppError } from "./errors";
import { parsePublicHttpUrl } from "./net";
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
 *
 * Some hosts run that Node subprocess inside a sandbox that breaks yt-dlp's
 * IPC with it (extra stdout, restricted APIs, etc.) — every challenge then
 * fails with an internal parse error instead of a clean one. Once detected
 * (see isJscFailure), skip the JS runtime for the rest of the process
 * lifetime: retrying it per-call would only fail the same way every time.
 */
let jsRuntimeBroken = false;

/**
 * Reading cookies straight out of a browser fails for two unrelated reasons on
 * Windows, and both are permanent for the life of the process:
 *
 *   - Chromium keeps an exclusive lock on its cookie DB the whole time it is
 *     running, so yt-dlp's copy step dies with "Could not copy Chrome cookie
 *     database" / PermissionError (yt-dlp#7271). Measured here: with Chrome and
 *     Edge open, even a FILE_SHARE_READ|WRITE open is refused.
 *   - The DPAPI unwrap of the master key can fail outright (yt-dlp#10927).
 *
 * Neither clears on a retry while the browser stays open, so the first failure
 * latches this flag and every later call skips browser extraction entirely.
 */
let browserCookiesBroken = false;

function jsRuntimeArgs(): string[] {
  if (jsRuntimeBroken) return [];
  // Node runs the challenge-solver scripts but doesn't ship them. Official
  // yt-dlp executables (what bin/ carries) bundle their own, so this only
  // covers installs that don't — a pip yt-dlp without the yt-dlp-ejs package.
  // GitHub rather than npm because npm auto-fetch is Deno/Bun-only.
  const args = [
    "--js-runtimes", `node:${process.execPath}`,
    "--remote-components", "ejs:github",
  ];

  // An explicit cookies.txt wins over browser auto-detect: it is a plain file
  // nothing holds a lock on, so it works with the browser open, which is the
  // normal case. Set COOKIES_PATH to a Netscape-format cookies.txt, or drop the
  // file next to the app. cookies.dat: the deploy pipeline strips gitignored
  // names (cookies.txt) from the uploaded archive, so the server copy ships
  // under this name.
  const cookies = [
    process.env.COOKIES_PATH,
    path.join(process.cwd(), "cookies.txt"),
    path.join(process.cwd(), "cookies.dat"),
  ].find((p) => p && fs.existsSync(p));
  if (cookies) {
    args.push("--cookies", cookies);
    return args;
  }

  // --cookies-from-browser: auto-detect the first browser whose cookie store
  // exists on this machine (Edge → Chrome → Brave → Firefox on Windows).
  // No user configuration required — just needs to be logged in to the target
  // site, and the browser closed (see browserCookiesBroken).
  const browser = browserCookiesBroken ? null : detectCookiesBrowser();
  if (browser) args.push("--cookies-from-browser", browser);
  return args;
}

const YOUTUBE_HOSTS = /(^|\.)youtu\.be$|(^|\.)(youtube\.com|youtube-nocookie\.com)$/i;

function isYouTube(url: string): boolean {
  try {
    return YOUTUBE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * YouTube increasingly requires sign-in when requests come from datacenter IPs.
 * tv_embedded was yt-dlp's bypass for this but has since been dropped by
 * yt-dlp itself (as of 2026.07.04 it logs "Skipping unsupported client" and
 * silently falls through to whatever's left) — verified live: with only
 * tv_embedded,web configured, tv_embedded got skipped, web alone hit YouTube's
 * PO-token gate, and every format got dropped ("No video formats found").
 * android_vr replaces it: same shape as tv_embedded (embedded/app player
 * rather than a browser scrape, hands back already-playable URLs with no JS
 * runtime needed) and confirmed working — verified live: real formats up to
 * 360p with no PO token required.
 *
 * mweb is kept as the retry client: a different auth path (mobile web) that
 * clears blocks android_vr doesn't. (ios, the previous retry client, was
 * re-checked here and no longer works on its own — same PO-token wall as bare
 * web — so it's been dropped rather than kept as dead weight.)
 *
 * The retry combo includes `web`, whose media URLs are signature-protected and
 * so need a JS runtime to decrypt. Where that runtime is unusable (see
 * jsRuntimeBroken) the whole request degrades to "Requested format is not
 * available", because every playable format got dropped. android_vr on its
 * own hands back already-playable URLs, so it is the one client that still
 * works with no JS runtime at all.
 */
const YT_CLIENT_PRIMARY = "android_vr,web";
const YT_CLIENT_RETRY = "mweb,web";
const YT_CLIENT_NO_JS = "android_vr";

function youtubeClientArgs(url: string, retry = false): string[] {
  if (!isYouTube(url)) return [];
  const client = jsRuntimeBroken
    ? YT_CLIENT_NO_JS
    : retry
      ? YT_CLIENT_RETRY
      : YT_CLIENT_PRIMARY;
  return ["--extractor-args", `youtube:player_client=${client}`];
}


/**
 * TikTok fingerprints the TLS handshake and 403s clients that don't look like
 * a real browser — the same link that fails bare downloads cleanly with
 * `--impersonate chrome` (curl_cffi presents a genuine Chrome handshake).
 * Scoped to TikTok rather than applied globally because impersonation reroutes
 * all traffic through curl_cffi, which has its own protocol limitations and
 * isn't bundled in every yt-dlp build.
 */
const IMPERSONATED_HOSTS = /(^|\.)(tiktok\.com|douyin\.com)$/i;

function hostMatches(url: string, hosts: RegExp): boolean {
  try {
    return hosts.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function needsImpersonation(url: string): boolean {
  return hostMatches(url, IMPERSONATED_HOSTS);
}

/**
 * TikTok's refusals are stochastic and escalate with request volume. At a calm
 * baseline, impersonation flips most blocks (a link that 403s bare extracts
 * cleanly under a Chrome handshake moments later), and a request refused under
 * one fingerprint often passes under another — so the one retry switches
 * fingerprints rather than repeating identical odds. Under sustained traffic
 * TikTok blocks regardless of fingerprint; nothing client-side clears that,
 * and the honest "try again later" error is the right answer. (The mobile-API
 * extractor args are NOT a way out: the unauthenticated app API returns empty
 * responses and yt-dlp silently falls back to the same blocked webpage.)
 */
const RETRY_IMPERSONATE_TARGET = "safari";

function rotateImpersonation(argv: string[]): string[] {
  const i = argv.indexOf("--impersonate");
  if (i === -1 || i + 1 >= argv.length) return argv;
  const next = [...argv];
  next[i + 1] = RETRY_IMPERSONATE_TARGET;
  return next;
}

// Keyed by binary path so a swapped-in yt-dlp gets re-probed.
const impersonationSupport = new Map<string, Promise<boolean>>();

/** Whether this yt-dlp build ships curl_cffi (probed once, cached). */
function supportsImpersonation(bin: string): Promise<boolean> {
  let cached = impersonationSupport.get(bin);
  if (!cached) {
    cached = new Promise((resolve) => {
      execFile(
        bin,
        ["--list-impersonate-targets"],
        { timeout: 15_000, windowsHide: true },
        (err, out) => resolve(!err && /curl_cffi/i.test(String(out))),
      );
    });
    impersonationSupport.set(bin, cached);
  }
  return cached;
}

async function impersonationArgs(bin: string, url: string): Promise<string[]> {
  if (!needsImpersonation(url)) return [];
  // "chrome" (no version) lets yt-dlp pick the best available Chrome target.
  return (await supportsImpersonation(bin)) ? ["--impersonate", "chrome"] : [];
}

/**
 * Pinterest's share button hands out pin.it links, and yt-dlp has no extractor
 * for that host. Its generic fallback does follow the redirect, but the chain
 * ends badly: pin.it hops to an invite-flavoured landing page
 * (/pin/<id>/sent/?invite_code=…) that Pinterest bounces anonymous clients off
 * to /?show_error=true, which matches no extractor at all — so a perfectly good
 * link arrives as "Unsupported URL". Walking the redirects ourselves and
 * stopping at the first /pin/<id> lands on the URL yt-dlp already handles.
 *
 * Everything that isn't a pin.it link returns immediately without a request,
 * and any failure along the way yields the original URL, so yt-dlp still gets
 * to produce its own error for a genuinely dead link.
 */
const PIN_SHORT_HOST = /^(?:[\w-]+\.)?pin\.it$/i;
const PINTEREST_HOST = /(^|\.)pinterest\.[a-z][a-z.]*$/i;
const PIN_PATH = /^\/pin\/(?:[\w-]+--)?(\d+)/;
const SHORT_LINK_HOPS = 5;
const SHORT_LINK_TIMEOUT_MS = 10_000;

async function resolveShortLink(raw: string): Promise<string> {
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return raw;
  }
  if (!PIN_SHORT_HOST.test(current.hostname)) return raw;

  for (let hop = 0; hop < SHORT_LINK_HOPS; hop++) {
    let location: string | null;
    try {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
      });
      location = res.headers.get("location");
    } catch {
      return raw;
    }
    if (!location) return raw;

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return raw;
    }
    // Each hop is attacker-influenced, so re-apply the same host hygiene the
    // API routes use before following it.
    if (!parsePublicHttpUrl(next.toString())) return raw;

    if (PINTEREST_HOST.test(next.hostname)) {
      const id = next.pathname.match(PIN_PATH)?.[1];
      if (id) return `https://www.pinterest.com/pin/${id}/`;
    }
    current = next;
  }
  return raw;
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
 *
 * For impersonated sites the retry isn't a pure repeat: it presents a
 * different browser fingerprint (see rotateImpersonation), which the site
 * scores separately, so the second attempt isn't bound to the first's odds.
 */
const INFO_ATTEMPTS = 2;
const RETRY_BASE_MS = 2_500;

// Some hosts run Node as a JS-challenge-solving subprocess inside a sandbox
// that breaks yt-dlp's IPC with it (extra stdout, restricted APIs, etc.),
// which surfaces as this internal parse error rather than a clean failure.
// Not fixable from here — the reliable move is to redo the request without
// a JS runtime at all rather than fail outright.
function isJscFailure(err: unknown): boolean {
  return err instanceof AppError && /\[jsc\]/i.test(err.message);
}

function isRetryable(err: unknown): boolean {
  return (
    err instanceof AppError &&
    (err.code === "BLOCKED" ||
      err.code === "RATE_LIMITED" ||
      err.code === "RESTRICTED" ||
      err.code === "COOKIES_FAILED" ||
      isJscFailure(err))
  );
}

function isCookieFailure(err: unknown): boolean {
  return err instanceof AppError && err.code === "COOKIES_FAILED";
}

function stripJsRuntimeArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--js-runtimes" || args[i] === "--remote-components") {
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

async function runInfoJson(url: string, args: string[]): Promise<RawInfo> {
  const bins = await resolveBinaries();
  if (!bins.ytdlp.found || !bins.ytdlp.path) throw YTDLP_MISSING();
  const argv = [...args, ...(await impersonationArgs(bins.ytdlp.path, url)), url];

  let dropJsRuntime = false;
  for (let attempt = 1; ; attempt++) {
    const isRetry = attempt > 1;
    // On retry: rotate impersonation fingerprint + switch YouTube player client.
    let base = isRetry ? rotateImpersonation(argv.slice(0, -1)) : argv.slice(0, -1);
    if (dropJsRuntime) base = stripJsRuntimeArgs(base);
    const attemptArgs = [...base, ...youtubeClientArgs(url, isRetry), url];
    try {
      return await runInfoOnce(bins.ytdlp.path, attemptArgs);
    } catch (err) {
      if (attempt >= INFO_ATTEMPTS || !isRetryable(err)) throw err;
      if (isJscFailure(err)) {
        dropJsRuntime = true;
        jsRuntimeBroken = true;
      }
      if (isCookieFailure(err)) {
        browserCookiesBroken = true;
      }
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
    }
  }
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  let raw = await runInfoJson(url, ["-J", "--no-playlist", "--no-warnings", ...jsRuntimeArgs()]);
  if (raw._type === "playlist") raw = firstEntry(raw) ?? raw;
  return normalize(raw, url);
}

/**
 * Detects whether the link is a playlist and returns the right shape:
 * a lone video, a video that belongs to a playlist (with the list attached),
 * or a pure playlist page. Uses a cheap `--flat-playlist` probe first.
 */
export async function fetchInfo(rawUrl: string): Promise<InfoResult> {
  // Resolved once here; every path below (including fetchVideoInfo) inherits it.
  const url = await resolveShortLink(rawUrl);
  const flat = await runInfoJson(url, ["-J", "--flat-playlist", "--no-warnings", ...jsRuntimeArgs()]);

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
  // Both cookie-extraction failures land here. The retry drops browser cookies
  // (see browserCookiesBroken), so this message is only ever the *final* answer
  // when the retry also failed — hence naming the fix rather than the symptom.
  if (
    /Failed to decrypt with DPAPI|Could not copy Chrome cookie database|could not find (?:\w+ )?cookies database/i.test(
      stderr,
    )
  ) {
    return new AppError(
      "COOKIES_FAILED",
      "Couldn't read browser cookies (your browser holds them locked while it's open). Close the browser, or drop a cookies.txt next to the app.",
      502,
    );
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
  // Facebook's extractor reports a removed/restricted post as "Cannot parse
  // data", which reads like a bug in the app. Verified live: a deleted video, a
  // made-up video id, and a working video all go down this same path — the
  // working one extracts fine, so reaching here means there was no video in the
  // page, not that parsing is broken.
  if (/Cannot parse data/i.test(stderr)) {
    return new AppError(
      "UNAVAILABLE",
      "This post has no downloadable video — it may have been removed, or be private.",
      404,
    );
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
  // TikTok started fronting its pages with a WAF (SlardarWAF / slardar_us_waf)
  // in early Aug 2026, which answers yt-dlp with a ~1.5KB "Please wait…"
  // interstitial instead of the page. Upstream bug, not a local one:
  // yt-dlp#17403, filed 2026-08-10, still open, and reproducing on nightly too.
  //
  // Not the network and not the account — verified live that a real browser on
  // this same connection loads the very same video fine, while every yt-dlp
  // variant gets the stub: logged out, fully logged in (sessionid + sid_tt +
  // uid_tt), with the browser's own WAF-clearance cookies (s_v_web_id +
  // x-web-secsdk-uid) grafted in, and under bare/chrome/safari impersonation.
  // So this is deliberately NOT retryable: the outcome is deterministic until
  // the extractor is fixed upstream, and a retry only costs the user a wait.
  if (/Unexpected response from webpage request/i.test(stderr)) {
    return new AppError(
      "SITE_CHANGED",
      `${site} changed its site and yt-dlp can't read it yet — a known upstream bug affecting everyone, not your connection or account. It'll need a yt-dlp update to fix.`,
      503,
    );
  }
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
  // yt-dlp writes vcodec "none" to mean *no video*; an absent or null vcodec
  // means *unknown*, which its own format selectors still treat as video.
  // Requiring the field to be present dropped every format from extractors that
  // don't report codecs (Rumble, Tumblr, Twitch clips, Loom, Internet Archive),
  // leaving those sites with an empty quality list. Only "none" disqualifies.
  const hasVideo = (f: RawFormat) => f.vcodec !== "none";
  // Left stricter on purpose: this one also decides what counts as an
  // audio-only stream, and the audio sites all label vcodec "none" already.
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

  // Settled before the argv is built so a pause/resume respawns the same URL.
  job.url = await resolveShortLink(job.url);

  const args = buildArgs(job, opts, ffmpegPath);
  args.push(
    ...youtubeClientArgs(job.url),
    ...(await impersonationArgs(bins.ytdlp.path, job.url)),
    job.url,
  );

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

/**
 * Printed once per item, just before its first byte. yt-dlp only ever reports
 * progress for the stream in flight, so without this the size of the item as a
 * whole is unknowable until it is over. `requested_formats` is the list of
 * streams a merged download will fetch (empty when there is only one, in which
 * case the item's own `filesize` is the answer).
 */
const STREAMS_TPL =
  "before_dl:[streams]|%(requested_formats.:.filesize,filesize_approx|0)j|%(filesize,filesize_approx|0)j";

const STREAMS_PREFIX = "[streams]|";

/** yt-dlp's own announcement of the formats it settled on: the item boundary,
 *  and a count of the streams to expect ("396+251" → two). */
const FORMATS_RE = /^\[info\] .+: Downloading \d+ format\(s\): (\S+)/;

function buildArgs(job: InternalJob, opts: DownloadOptions, ffmpegPath?: string): string[] {
  const contentDir = job.contentDir;
  const args = [
    "--no-warnings",
    "--newline",
    "--progress",
    "--progress-template",
    PROGRESS_TPL,
    "--print",
    STREAMS_TPL,
    // --print implies --quiet, which would swallow the [info]/[Merger]/ERROR
    // lines the parser below reads. --progress keeps the bar alive regardless.
    "--no-quiet",
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
    job.itemPriorBytes += job.streamBytes;
    job.streamsDone += 1;
    job.streamBytes = 0;
  }
  if (downloaded !== job.streamBytes) job.lastByteAt = Date.now();
  job.streamBytes = downloaded;
}

/** Sizes from `STREAMS_TPL`; a zero or null anywhere makes the sum untrustworthy. */
function parseSizes(json: string): number[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return [];
    return value.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : 0));
  } catch {
    return [];
  }
}

/**
 * A new item is about to start — also fired by a resume, which replays the item
 * from its first stream. Only the accumulators reset; the numbers already on
 * screen stay until the next progress line replaces them, a few milliseconds
 * later, so the bar never blinks back to zero.
 */
function resetItem(job: InternalJob, streamCount: number): void {
  job.streamCount = streamCount;
  job.streamsDone = 0;
  job.itemPriorBytes = 0;
  job.itemTotalBytes = undefined;
  job.streamBytes = 0;
}

/**
 * Converts the current stream's numbers into progress for the whole item.
 *
 * yt-dlp downloads a video and its audio as two separate streams and restarts
 * `downloaded_bytes` at zero for each, so a bar driven straight off
 * `downloaded / total` fills once per stream — the download visibly completing
 * twice. Measuring against the summed size of every stream (from `STREAMS_TPL`)
 * fills it exactly once, and makes the byte readout the size of the file the
 * user is actually waiting for rather than of one of its halves.
 */
function applyItemProgress(job: InternalJob, downloaded: number, streamTotal: number): void {
  // With one stream there is nothing to sum: the stream is the item. Covers
  // audio-only and muxed downloads from sites that report no size up front.
  if (!job.itemTotalBytes && job.streamCount === 1 && streamTotal > 0) {
    job.itemTotalBytes = streamTotal;
  }

  job.downloadedBytes = job.itemPriorBytes + downloaded;
  job.totalBytes = job.itemTotalBytes;

  if (job.itemTotalBytes) {
    job.itemProgress = Math.min(100, (job.downloadedBytes / job.itemTotalBytes) * 100);
    return;
  }
  // No byte totals at all (HLS/DASH): fall back to how far the current stream
  // has come, spread across the streams the item is made of, so the bar still
  // crosses the panel only once.
  const fraction =
    streamTotal > 0
      ? downloaded / streamTotal
      : job.fragmentCount
        ? (job.fragmentIndex ?? 0) / job.fragmentCount
        : 0;
  job.itemProgress = Math.min(100, ((job.streamsDone + fraction) / job.streamCount) * 100);
}

/** Drops yt-dlp's "[youtube] dQw4w9WgXcQ:" prefix — the id means nothing to the
 *  reader, and the reason is what the list is for. */
function skipReason(message: string): string {
  return message.replace(/^\[[^\]]+\]\s+\S+?:\s+/, "").trim() || message;
}

/** One failure yields many near-identical lines that differ only in a fragment
 *  or attempt number, so numbers are flattened before the duplicate check. */
function dedupeKey(reason: string): string {
  return reason.toLowerCase().replace(/\d+/g, "#");
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
      job.speedBps = num(speed) || undefined;
      job.fragmentIndex = num(fragIdx) || undefined;
      job.fragmentCount = num(fragCount) || undefined;
      applyItemProgress(job, downloaded, totalBytes);
      // yt-dlp's ETA only covers the stream in flight and would promise the file
      // seconds before its audio track has even started. Project across what is
      // left of the whole item instead, whenever its size is known.
      job.etaSec =
        job.totalBytes && job.speedBps
          ? Math.round(Math.max(0, job.totalBytes - job.downloadedBytes) / job.speedBps)
          : num(eta) || undefined;

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
      // Bank the stream that just ended. A resume finds earlier streams already
      // complete and reports them with no downloaded bytes at all, so the item
      // total takes the largest figure available — while the session total
      // counts only what actually crossed the wire this time.
      const transferred = Math.max(job.streamBytes, downloaded);
      job.priorBytes += transferred;
      job.itemPriorBytes += Math.max(transferred, totalBytes);
      job.streamBytes = 0;
      job.streamsDone += 1;
      job.lastByteAt = Date.now();
      job.fragmentIndex = undefined;
      job.fragmentCount = undefined;
      applyItemProgress(job, 0, 0);
      // Every stream landed, so the item is here whatever the arithmetic says —
      // sizes reported as approximate rarely add up to the byte.
      if (job.streamsDone >= job.streamCount) job.itemProgress = 100;
      if (!job.isPlaylist) job.progress = job.itemProgress;
    }
    return;
  }
  const formats = line.match(FORMATS_RE)?.[1];
  if (formats) {
    resetItem(job, formats.split("+").length);
    return;
  }
  if (line.startsWith(STREAMS_PREFIX)) {
    const [list, single] = line.slice(STREAMS_PREFIX.length).split("|");
    const sizes = parseSizes(list);
    // Both lines mark the same boundary; resetting on each means neither is
    // load-bearing on its own. A single-format item lists no streams, so keep
    // the count the [info] line already gave.
    resetItem(job, sizes.length || job.streamCount);
    const total = sizes.length ? sizes.reduce((a, b) => a + b, 0) : num(single);
    // One missing size makes the sum an undercount, which would run the bar
    // past 100% — better to fall back to counting streams than to lie.
    job.itemTotalBytes = total > 0 && sizes.every((s) => s > 0) ? total : undefined;
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
      // counting them here would wildly overcount. These are the reasons behind
      // that count, kept for the UI.
      //
      // Every error earns a line, not just the "video unavailable" family: a
      // throttled or blocked run skips items with 403s and fragment failures,
      // and those are exactly the ones worth showing — a bare count with no
      // reason reads as if the videos were private when the site was really
      // refusing the machine.
      const reason = skipReason(message);
      const key = dedupeKey(reason);
      if (job.playlist.skippedTitles.length < 25 && !job.skipKeys?.has(key)) {
        (job.skipKeys ??= new Set()).add(key);
        job.playlist.skippedTitles.push(reason);
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
  // A block at download time gets one respawn under a different browser
  // fingerprint before the job is failed — same rationale as the info retry.
  const status = httpStatus(job.error ?? "");
  const rotated = job.argv ? rotateImpersonation(job.argv) : undefined;
  if ((status === 401 || status === 403) && !job.retriedBlocked && rotated !== job.argv) {
    job.retriedBlocked = true;
    job.error = undefined;
    job.argv = rotated;
    spawnYtdlp(job);
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
