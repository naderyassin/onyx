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

## A note on use

Onyx is a local tool built on yt-dlp. Download only content you have the
right to save — your own uploads, openly licensed media, or content whose
platform permits it.
