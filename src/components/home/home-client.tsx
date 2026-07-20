"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { LogoMark } from "@/components/logo";
import { BinaryNotice } from "@/components/home/binary-notice";
import { ModeSelector } from "@/components/home/mode-selector";
import { UrlBar } from "@/components/home/url-bar";
import { VideoCard, VideoCardSkeleton } from "@/components/home/video-card";
import { useDownload } from "@/hooks/use-download";
import { useVideoInfo } from "@/hooks/use-video-info";
import { fadeRise } from "@/lib/motion";
import { getSettings } from "@/lib/settings";
import { TOTAL_SUPPORTED_LABEL } from "@/lib/sites";
import type { AudioFormat, DownloadMode } from "@/lib/types";
import { isValidUrl, normalizeUrl } from "@/lib/validate";

export function HomeClient() {
  const searchParams = useSearchParams();
  const info = useVideoInfo();
  const dl = useDownload();

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<DownloadMode>("auto");
  const [selectedHeight, setSelectedHeight] = useState<number | undefined>();
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");
  const inputRef = useRef<HTMLInputElement | null>(null);

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
  }, []);

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
    if (!data) return;
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
    const selectedLabel = data.qualities.find((q) => q.height === selectedHeight)?.label;
    const qualityLabel =
      mode === "audio" ? audioFormat.toUpperCase() : mode === "video" ? (selectedLabel ?? "Best") : "Auto";
    void dl.start({
      url: data.sourceUrl,
      mode,
      height: mode === "video" ? selectedHeight : undefined,
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
    <div className="flex min-h-svh flex-col items-center justify-center px-5 pb-28 pt-32">
      <motion.div
        initial="hidden"
        animate="visible"
        className="flex w-full max-w-2xl flex-col items-center"
      >
        <motion.div custom={0} variants={fadeRise}>
          <LogoMark className="size-12 rounded-2xl" iconClassName="size-5" />
        </motion.div>

        <motion.h1
          custom={1}
          variants={fadeRise}
          className="mt-7 text-center text-[clamp(2.2rem,6vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.03em]"
        >
          Save the internet,{" "}
          <span className="font-serif font-normal italic text-white/90">beautifully.</span>
        </motion.h1>

        <motion.p
          custom={2}
          variants={fadeRise}
          className="mt-4 max-w-md text-center text-sm leading-relaxed text-muted-foreground md:text-[15px]"
        >
          Paste a link from YouTube, X, TikTok or {TOTAL_SUPPORTED_LABEL} other sites — Onyx
          fetches it in the best quality, right on your machine.
        </motion.p>

        <motion.div custom={3} variants={fadeRise} className="mt-10 w-full">
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

        <motion.div custom={4} variants={fadeRise} className="mt-5">
          <ModeSelector value={mode} onChange={setMode} layoutId="home-mode" />
        </motion.div>

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
            {info.state === "success" && info.data && (
              <VideoCard
                key={info.data.id}
                info={info.data}
                mode={mode}
                selectedHeight={selectedHeight}
                onSelectHeight={setSelectedHeight}
                audioFormat={audioFormat}
                onSelectAudioFormat={setAudioFormat}
                job={dl.job}
                onDownload={handleDownload}
                onCancel={() => void dl.cancel()}
                onSaveAgain={dl.saveAgain}
                onReset={handleReset}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <p className="pointer-events-none fixed inset-x-0 bottom-5 hidden text-center text-xs text-white/25 sm:block">
        Runs locally · powered by yt-dlp + FFmpeg ·{" "}
        <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
          Ctrl&thinsp;V
        </kbd>{" "}
        anywhere to paste
      </p>
    </div>
  );
}
