export type SiteCategory = "Video" | "Social" | "Music" | "Live" | "Learning";

export interface SupportedSite {
  name: string;
  domain: string;
  category: SiteCategory;
  popular?: boolean;
}

export const SITE_CATEGORIES: SiteCategory[] = ["Video", "Social", "Music", "Live", "Learning"];

/** Curated highlights — yt-dlp itself supports 1,800+ extractors. */
export const SUPPORTED_SITES: SupportedSite[] = [
  { name: "YouTube", domain: "youtube.com", category: "Video", popular: true },
  { name: "Vimeo", domain: "vimeo.com", category: "Video", popular: true },
  { name: "X (Twitter)", domain: "x.com", category: "Social", popular: true },
  { name: "Instagram", domain: "instagram.com", category: "Social", popular: true },
  { name: "TikTok", domain: "tiktok.com", category: "Social", popular: true },
  { name: "Reddit", domain: "reddit.com", category: "Social", popular: true },
  { name: "Facebook", domain: "facebook.com", category: "Social" },
  { name: "Twitch", domain: "twitch.tv", category: "Live", popular: true },
  { name: "Kick", domain: "kick.com", category: "Live" },
  { name: "SoundCloud", domain: "soundcloud.com", category: "Music", popular: true },
  { name: "Bandcamp", domain: "bandcamp.com", category: "Music" },
  { name: "Mixcloud", domain: "mixcloud.com", category: "Music" },
  { name: "Dailymotion", domain: "dailymotion.com", category: "Video" },
  { name: "Bilibili", domain: "bilibili.com", category: "Video" },
  { name: "Rumble", domain: "rumble.com", category: "Video" },
  { name: "Odysee", domain: "odysee.com", category: "Video" },
  { name: "Streamable", domain: "streamable.com", category: "Video" },
  { name: "Loom", domain: "loom.com", category: "Video" },
  { name: "Bluesky", domain: "bsky.app", category: "Social" },
  { name: "Tumblr", domain: "tumblr.com", category: "Social" },
  { name: "Pinterest", domain: "pinterest.com", category: "Social" },
  { name: "VK", domain: "vk.com", category: "Social" },
  { name: "LinkedIn", domain: "linkedin.com", category: "Social" },
  { name: "TED", domain: "ted.com", category: "Learning" },
  { name: "Internet Archive", domain: "archive.org", category: "Video" },
  { name: "MIT OpenCourseWare", domain: "ocw.mit.edu", category: "Learning" },
];

export const TOTAL_SUPPORTED_LABEL = "1,800+";
export const YTDLP_SUPPORTED_SITES_URL =
  "https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md";
