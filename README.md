# Onyx

A minimal, dark, premium-feeling web app for downloading video and audio from
1,800+ sites. Paste a link, preview the media, pick a quality, and save the
file — everything runs locally on your machine.

Built with **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · Framer Motion · lucide-react**, powered on the backend by
**yt-dlp** and **FFmpeg** through Next.js API routes.

## Features

- **One-page flow** — paste a URL and a preview card animates in with the
  thumbnail, title, author, duration, available qualities, and estimated size.
- **Three modes** — Auto (best video+audio), Video (pick a resolution), Audio
  (MP3 / M4A / Opus extraction).
- **Live progress** — realtime percent, speed, and ETA streamed over
  Server-Sent Events, with cancel support and an automatic browser save when
  the file is ready.
- **History** — completed downloads are remembered locally (localStorage only).
- **Settings** — default mode/quality/format, behavior toggles, and a live
  status check for the yt-dlp/FFmpeg binaries.
- **Privacy-first** — no accounts, no telemetry, no external services. The
  server side is just yt-dlp + FFmpeg on your own machine.

## Prerequisites

| Tool | Purpose | Install (Windows) | Install (macOS) |
|------|---------|-------------------|-----------------|
| Node.js 20+ | Runs the app | [nodejs.org](https://nodejs.org) | `brew install node` |
| yt-dlp | Media extraction | `winget install yt-dlp.yt-dlp` | `brew install yt-dlp` |
| FFmpeg | Merging / audio conversion | `winget install Gyan.FFmpeg` | `brew install ffmpeg` |

The app starts without yt-dlp/FFmpeg and shows a notice; downloads need
yt-dlp, and audio extraction / stream merging need FFmpeg. The **Settings**
page shows live binary status. If a binary isn't on your PATH, point to it
explicitly via `.env.local` (see `.env.example`).

## Getting started

```bash
npm install
npm run dev       # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Architecture

```
src/
├── app/
│   ├── page.tsx                     # Home — the whole paste→preview→download flow
│   ├── supported/  history/  settings/
│   ├── layout.tsx  template.tsx     # Shell, fonts, page transitions
│   └── api/
│       ├── info/                    # POST — yt-dlp metadata → normalized VideoInfo
│       ├── download/                # POST — start a job (yt-dlp spawn)
│       │   └── [id]/                # GET status · DELETE cancel
│       │       ├── events/          # GET — SSE progress stream
│       │       └── file/            # GET — stream the finished file
│       ├── health/                  # GET — binary detection status
│       └── thumbnail/               # GET — image proxy (beats referer-blocking CDNs)
├── components/
│   ├── home/                        # url-bar, mode-selector, video-card, …
│   ├── history/  sites/  settings/  layout/
│   └── ui/                          # shadcn/ui primitives
├── hooks/                           # use-video-info, use-download
└── lib/
    ├── server/                      # ytdlp pipeline, job store, binary resolver
    └── …                            # types, stores, formatting, motion presets
```

Design notes:

- **Job store** lives on `globalThis` so it survives dev HMR and is shared
  across route chunks; a sweeper deletes finished jobs and their temp files.
- **Downloads** go to a per-job temp dir (`%TMP%/onyx-downloads/<id>`), then
  stream to the browser with a proper `Content-Disposition` and get cleaned up.
- **Progress** is parsed from a custom `--progress-template`; the client
  subscribes via SSE and falls back to polling if the stream drops.
- **History & settings** are client-side localStorage stores exposed through
  `useSyncExternalStore` hooks — the backend stays stateless.

## Environment variables

Optional — only needed when a binary isn't on PATH (see `.env.example`):

| Var | Meaning |
|-----|---------|
| `YTDLP_PATH` | Absolute path to the yt-dlp executable |
| `FFMPEG_PATH` | Absolute path to the ffmpeg executable |
| `COOKIES_PATH` | Absolute path to a Netscape-format cookies file (see Deploying below) |

## Deploying (e.g. Hostinger)

YouTube, Instagram, and Facebook throttle or block anonymous requests from
server IPs much more aggressively than from a home connection. On a host,
downloads from those sites will need a logged-in session's cookies:

1. Export cookies (Netscape format) for the target site while logged in — the
   "Get cookies.txt LOCALLY" browser extension works well.
2. Upload the file to the server **named `cookies.dat`**, not `cookies.txt`.
   Some upload/deploy pipelines drop `.gitignore`d filenames (`cookies.txt` is
   gitignored on purpose, since it's a live credential — see below), and
   `cookies.dat` survives that. Or set `COOKIES_PATH` to wherever you put it,
   which works under either filename.
3. Treat that file as a password, not a config value — it's a live session
   token for the account it was exported from. Don't commit it, don't post it,
   and prefer a path outside the web root if the host serves static files from
   the app directory. Sessions expire; expect to re-export periodically.

TikTok is unaffected by any of this — as of Aug 2026 its extractor is broken
upstream by a TikTok-side change (yt-dlp
[#17403](https://github.com/yt-dlp/yt-dlp/issues/17403)), so no cookies fix
it; it needs a yt-dlp update.

## A note on use

Onyx is a local tool built on yt-dlp. Download only content you have the
right to save — your own uploads, openly licensed media, or content whose
platform permits it.
