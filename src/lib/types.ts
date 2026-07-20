export type DownloadMode = "auto" | "video" | "audio";
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

export type JobStatus =
  | "starting"
  | "downloading"
  | "processing"
  | "complete"
  | "error"
  | "canceled";

export interface JobState {
  id: string;
  status: JobStatus;
  /** 0–100 for the stream currently downloading. */
  progress: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaSec?: number;
  fileName?: string;
  fileSize?: number;
  error?: string;
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
  mode: DownloadMode;
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
