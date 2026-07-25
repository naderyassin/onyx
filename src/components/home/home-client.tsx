"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { LogoMark, OnyxPixelTitle, PowerSparkIcon } from "@/components/logo";
import { BinaryNotice } from "@/components/home/binary-notice";
import { ModeSelector, MODE_ITEMS, type ModeItem } from "@/components/home/mode-selector";
import { PlaylistCard } from "@/components/home/playlist-card";
import { UrlBar } from "@/components/home/url-bar";
import { VideoCard, VideoCardSkeleton } from "@/components/home/video-card";
import { useDownload } from "@/hooks/use-download";
import { useVideoInfo } from "@/hooks/use-video-info";
import { fadeRise } from "@/lib/motion";
import { getSettings } from "@/lib/settings";
import { TOTAL_SUPPORTED_LABEL } from "@/lib/sites";
import type { AudioFormat, DownloadMode, PlaylistInfo, SelectableMode } from "@/lib/types";
import { isValidUrl, normalizeUrl } from "@/lib/validate";

const BASE_MODE_ITEMS: ModeItem<SelectableMode>[] = [
  MODE_ITEMS.auto,
  MODE_ITEMS.video,
  MODE_ITEMS.audio,
];

export function HomeClient() {
  const searchParams = useSearchParams();
  const info = useVideoInfo();
  const dl = useDownload();

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<SelectableMode>("auto");
  const [selectedHeight, setSelectedHeight] = useState<number | undefined>();
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");
  // Whole-playlist controls (used by the Playlist mode / a pure playlist card).
  const [playlistItemMode, setPlaylistItemMode] = useState<DownloadMode>("auto");
  const [playlistHeight, setPlaylistHeight] = useState<number | undefined>(undefined);
  const [isDesktop, setIsDesktop] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const data = info.data;
  const playlistData: PlaylistInfo | null =
    data?.kind === "playlist" ? data : data?.kind === "video" ? (data.playlist ?? null) : null;
  const showPlaylist =
    data?.kind === "playlist" || (data?.kind === "video" && mode === "playlist" && !!data.playlist);
  const modeItems: ModeItem<SelectableMode>[] =
    data?.kind === "video" && data.playlist
      ? [...BASE_MODE_ITEMS, MODE_ITEMS.playlist]
      : BASE_MODE_ITEMS;

  const { fetchInfo, clear: clearInfo } = info;
  const { reset: resetDl, active: dlActive } = dl;

  const doFetch = useCallback(
    (raw: string) => {
      const normalized = normalizeUrl(raw);
      if (!normalized) return;
      resetDl();
      void fetchInfo(normalized);
    },
    [fetchInfo, resetDl],
  );

  const handlePasteText = useCallback(
    (text: string) => {
      setUrl(text);
      if (getSettings().autoFetch && isValidUrl(text)) doFetch(text);
    },
    [doFetch],
  );

  // Adopt persisted defaults once, after hydration.
  useEffect(() => {
    const settings = getSettings();
    setMode(settings.defaultMode);
    setAudioFormat(settings.audioFormat);
    setPlaylistItemMode(
      settings.defaultMode === "video" || settings.defaultMode === "audio"
        ? settings.defaultMode
        : "auto",
    );
    setPlaylistHeight(settings.videoQuality === "best" ? undefined : Number(settings.videoQuality));
    
    // Check if we're running inside the Electron app
    if (typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("electron")) {
      setIsDesktop(true);
    }
  }, []);

  // "Playlist" mode only exists while a playlist is attached — fall back if the
  // loaded link is a plain single video.
  useEffect(() => {
    if (mode === "playlist" && !(data?.kind === "video" && data.playlist)) {
      setMode(getSettings().defaultMode);
    }
  }, [data, mode]);

  // Support /?url=… deep links (used by "Download again" in History).
  useEffect(() => {
    const initial = searchParams.get("url");
    if (initial && isValidUrl(initial)) {
      setUrl(initial);
      doFetch(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl/Cmd+V anywhere on the page drops the link into the flow.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const text = event.clipboardData?.getData("text")?.trim();
      if (!text) return;
      event.preventDefault();
      inputRef.current?.focus();
      handlePasteText(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handlePasteText]);

  // Preselect a quality when new info arrives, honoring the saved preference.
  useEffect(() => {
    const data = info.data;
    if (!data || data.kind !== "video") return;
    const heights = data.qualities.map((q) => q.height);
    if (!heights.length) {
      setSelectedHeight(undefined);
      return;
    }
    const pref = getSettings().videoQuality;
    if (pref === "best") {
      setSelectedHeight(heights[0]);
      return;
    }
    const target = Number(pref);
    const within = heights.filter((h) => h <= target);
    setSelectedHeight(within.length ? within[0] : heights[heights.length - 1]);
  }, [info.data]);

  // Clearing the input dismisses the card (unless a download is running).
  useEffect(() => {
    if (!url.trim() && !dlActive) {
      clearInfo();
      resetDl();
    }
  }, [url, dlActive, clearInfo, resetDl]);

  const handlePasteClick = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast("Your clipboard is empty");
        return;
      }
      inputRef.current?.focus();
      handlePasteText(text);
    } catch {
      toast.error("Clipboard access was blocked — press Ctrl+V instead");
      inputRef.current?.focus();
    }
  };

  const handleDownload = () => {
    const data = info.data;
    if (!data) return;

    if (showPlaylist && playlistData) {
      const itemMode = playlistItemMode;
      const label =
        itemMode === "audio"
          ? audioFormat.toUpperCase()
          : itemMode === "video"
            ? playlistHeight
              ? `${playlistHeight}p`
              : "Best"
            : "Auto";
      void dl.start({
        url: playlistData.sourceUrl,
        mode: itemMode,
        height: itemMode === "video" ? playlistHeight : undefined,
        audioFormat,
        playlist: true,
        meta: {
          title: playlistData.title,
          uploader: playlistData.uploader,
          thumbnailUrl: playlistData.thumbnailUrl,
          extractor: playlistData.extractor,
          qualityLabel: `Playlist · ${label}`,
        },
      });
      return;
    }

    if (data.kind !== "video") return;
    const singleMode = mode as DownloadMode;
    const selectedLabel = data.qualities.find((q) => q.height === selectedHeight)?.label;
    const qualityLabel =
      singleMode === "audio"
        ? audioFormat.toUpperCase()
        : singleMode === "video"
          ? (selectedLabel ?? "Best")
          : "Auto";
    void dl.start({
      url: data.sourceUrl,
      mode: singleMode,
      height: singleMode === "video" ? selectedHeight : undefined,
      audioFormat,
      meta: {
        title: data.title,
        uploader: data.uploader,
        thumbnailUrl: data.thumbnailUrl,
        extractor: data.extractor,
        qualityLabel,
      },
    });
  };

  const handleReset = () => {
    dl.reset();
    clearInfo();
    setUrl("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-5 pt-[clamp(4.5rem,14dvh,8rem)] pb-[clamp(1.5rem,8dvh,7rem)]">
      {!isDesktop && (
        <a
          href="/downloads/Onyx-Setup.exe"
          download
          className="fixed top-5 right-5 md:top-8 md:right-8 z-50 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/20 hover:scale-105 active:scale-95 border border-white/20"
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">Download for Windows</span>
        </a>
      )}
      <motion.div
        initial="hidden"
        animate="visible"
        className="flex w-full max-w-2xl flex-col items-center"
      >
        <motion.div custom={0} variants={fadeRise} className="flex flex-col items-center">
          <motion.div
            animate={{
              y: [-6, 6, -6],
              filter: [
                "drop-shadow(0 0 24px rgba(255,255,255,0.35))",
                "drop-shadow(0 0 38px rgba(255,255,255,0.65))",
                "drop-shadow(0 0 24px rgba(255,255,255,0.35))",
              ],
            }}
            transition={{
              duration: 3.5,
              ease: "easeInOut",
              repeat: Infinity,
            }}
            className="size-[clamp(3.5rem,11dvh,9rem)] mb-[clamp(0.5rem,3dvh,1.5rem)]"
          >
            <PowerSparkIcon className="size-full" />
          </motion.div>

          <h1 className="w-full mb-[clamp(0.5rem,3dvh,1.5rem)] text-center">
            <OnyxPixelTitle className="mx-auto max-w-[clamp(200px,38dvh,480px)] drop-shadow-[0_0_28px_rgba(255,255,255,0.3)]" />
          </h1>

          <div className="font-mono text-sm md:text-base text-white/95 border border-white/40 rounded-xl px-5 py-2.5 bg-black/70 shadow-[inset_0_0_15px_rgba(255,255,255,0.06)] flex items-center gap-2.5 mb-2">
            <span>&gt; Save the internet, beautifully.</span>
            <span className="inline-block w-2.5 h-4 bg-white animate-pulse" />
          </div>
        </motion.div>

        <motion.div custom={3} variants={fadeRise} className="mt-[clamp(1rem,5dvh,2.5rem)] w-full">
          <UrlBar
            value={url}
            onChange={setUrl}
            onSubmit={() => doFetch(url)}
            onPasteText={handlePasteText}
            onPasteClick={handlePasteClick}
            onClear={() => setUrl("")}
            loading={info.state === "loading"}
            isValid={isValidUrl(url)}
            inputRef={inputRef}
          />
        </motion.div>

        {data?.kind !== "playlist" && (
          <motion.div custom={4} variants={fadeRise} className="mt-[clamp(0.5rem,3dvh,1.25rem)]">
            <ModeSelector
              value={mode}
              onChange={setMode}
              items={modeItems}
              layoutId="home-mode"
            />
          </motion.div>
        )}

        <BinaryNotice />

        <div className="w-full">
          <AnimatePresence mode="wait" initial={false}>
            {info.state === "loading" && <VideoCardSkeleton key="skeleton" />}
            {info.state === "error" && (
              <motion.p
                key="error"
                role="alert"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="mt-8 text-center text-sm text-destructive/90"
              >
                {info.error}
              </motion.p>
            )}
            {info.state === "success" &&
              data &&
              (showPlaylist && playlistData ? (
                <PlaylistCard
                  key={`playlist-${playlistData.id}`}
                  playlist={playlistData}
                  itemMode={playlistItemMode}
                  onSelectItemMode={setPlaylistItemMode}
                  height={playlistHeight}
                  onSelectHeight={setPlaylistHeight}
                  audioFormat={audioFormat}
                  onSelectAudioFormat={setAudioFormat}
                  job={dl.job}
                  onDownload={handleDownload}
                  onPause={() => void dl.pause()}
                  onResume={() => void dl.resume()}
                  onCancel={() => void dl.cancel()}
                  onSaveAgain={dl.saveAgain}
                  onReset={handleReset}
                />
              ) : data.kind === "video" ? (
                <VideoCard
                  key={data.id}
                  info={data}
                  mode={mode as DownloadMode}
                  selectedHeight={selectedHeight}
                  onSelectHeight={setSelectedHeight}
                  audioFormat={audioFormat}
                  onSelectAudioFormat={setAudioFormat}
                  job={dl.job}
                  onDownload={handleDownload}
                  onPause={() => void dl.pause()}
                  onResume={() => void dl.resume()}
                  onCancel={() => void dl.cancel()}
                  onSaveAgain={dl.saveAgain}
                  onReset={handleReset}
                />
              ) : null)}
          </AnimatePresence>
        </div>
      </motion.div>

      <p className="pointer-events-none fixed inset-x-0 bottom-5 hidden text-center text-xs text-white/25 sm:block">
        {TOTAL_SUPPORTED_LABEL} supported sites ·{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
          Ctrl&thinsp;V
        </kbd>{" "}
        anywhere to paste
      </p>
    </div>
  );
}
