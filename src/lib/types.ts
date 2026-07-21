export type DownloadMode = "auto" | "video" | "audio";
/** The download modes surfaced in the UI selector, including the whole-playlist scope. */
export type SelectableMode = DownloadMode | "playlist";
export type AudioFormat = "mp3" | "m4a" | "opus";

export interface VideoQuality {
  height: number;
  fps?: number;
  /** Display label, e.g. "1080p" or "2160p60". */
  label: string;
  estBytes?: number;
  approx: boolean;
}

export interface VideoInfo {
  id: string;
  sourceUrl: string;
  /** Pretty extractor name, e.g. "YouTube". */
  extractor: string;
  title: string;
  uploader?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  qualities: VideoQuality[];
  audioEstBytes?: number;
  autoEstBytes?: number;
  bestHeight?: number;
}

export interface PlaylistInfo {
  id: string;
  /** The URL to hand back to yt-dlp to download the whole list. */
  sourceUrl: string;
  extractor: string;
  title: string;
  uploader?: string;
  thumbnailUrl?: string;
  /** Number of videos in the playlist. */
  count: number;
  /** Summed duration of the entries that reported one, when available. */
  totalDurationSec?: number;
  /** Titles of the first few videos, for a preview. */
  previewTitles: string[];
}

/**
 * `/api/info` returns either a single video (optionally belonging to a
 * playlist) or a pure playlist page. Discriminated on `kind`.
 */
export type VideoResult = { kind: "video" } & VideoInfo & { playlist?: PlaylistInfo };
export type PlaylistResult = { kind: "playlist" } & PlaylistInfo;
export type InfoResult = VideoResult | PlaylistResult;

export type JobStatus =
  | "starting"
  | "downloading"
  | "paused"
  | "processing"
  | "complete"
  | "error"
  | "canceled";

export interface PlaylistProgress {
  /** Playlist title, once yt-dlp reports it. */
  title?: string;
  /** Total number of videos, when known. */
  count?: number;
  /** 1-based index of the video currently downloading. */
  index?: number;
  /** Title of the video currently downloading. */
  currentTitle?: string;
  /** Videos fully downloaded so far. */
  completed: number;
  /** Videos skipped because they were unavailable/private. */
  skipped: number;
  /** Titles (or messages) of skipped videos, for the log. */
  skippedTitles: string[];
}

export interface JobState {
  id: string;
  status: JobStatus;
  /** 0–100 for the job as a whole — the entire list, for playlist jobs. */
  progress: number;
  /** 0–100 for the single file currently downloading. */
  itemProgress: number;
  /** Bytes of the current file, summed across the streams it is built from. */
  downloadedBytes: number;
  /** Size of the current file — every one of its streams together. */
  totalBytes?: number;
  /** Bytes pulled since the job started, across every stream and playlist item. */
  sessionBytes: number;
  speedBps?: number;
  etaSec?: number;
  /** Wall-clock seconds since the job started. */
  elapsedSec?: number;
  /** Fragment counters — the only progress signal for streams with no byte total. */
  fragmentIndex?: number;
  fragmentCount?: number;
  /** Seconds since the byte counter last moved; grows while a download is stuck. */
  stalledSec?: number;
  fileName?: string;
  fileSize?: number;
  error?: string;
  /** Present only for playlist jobs. */
  playlist?: PlaylistProgress;
}

export interface BinaryStatus {
  found: boolean;
  version?: string;
  path?: string;
}

export interface HealthStatus {
  ytdlp: BinaryStatus;
  ffmpeg: BinaryStatus;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  uploader?: string;
  thumbnailUrl?: string;
  extractor?: string;
  mode: SelectableMode;
  qualityLabel?: string;
  fileName?: string;
  fileSize?: number;
  downloadedAt: number;
}

export type VideoQualityPreference = "best" | "2160" | "1440" | "1080" | "720" | "480";

export interface AppSettings {
  defaultMode: DownloadMode;
  videoQuality: VideoQualityPreference;
  audioFormat: AudioFormat;
  autoFetch: boolean;
  saveHistory: boolean;
}

export interface ApiError {
  code: string;
  error: string;
}
