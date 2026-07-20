"use client";

import { motion, useAnimation } from "framer-motion";
import { ArrowDown, ClipboardPaste, Link2, Loader2, X } from "lucide-react";

interface UrlBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPasteText: (text: string) => void;
  onPasteClick: () => void;
  onClear: () => void;
  loading: boolean;
  isValid: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function UrlBar({
  value,
  onChange,
  onSubmit,
  onPasteText,
  onPasteClick,
  onClear,
  loading,
  isValid,
  inputRef,
}: UrlBarProps) {
  const controls = useAnimation();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      void controls.start({ x: [0, -9, 9, -6, 6, 0], transition: { duration: 0.4 } });
      return;
    }
    onSubmit();
  };

  return (
    <motion.form animate={controls} onSubmit={handleSubmit} noValidate>
      <div className="relative flex h-16 items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.03] pl-5 pr-2 transition-all duration-300 hover:border-white/20 focus-within:border-white/30 focus-within:bg-white/[0.05] focus-within:shadow-[0_0_60px_-16px_rgba(255,255,255,0.3)]">
        <Link2 className="size-[18px] shrink-0 text-white/35" aria-hidden />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (text.trim()) {
              e.preventDefault();
              onPasteText(text.trim());
            }
          }}
          placeholder="Paste a video link…"
          aria-label="Video link"
          spellCheck={false}
          autoComplete="off"
          inputMode="url"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
        />
        {value && !loading && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear link"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onPasteClick}
          aria-label="Paste from clipboard"
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-sm text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <ClipboardPaste className="size-4" aria-hidden />
          <span className="hidden sm:inline">Paste</span>
        </button>
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 sm:px-5"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ArrowDown className="size-4" aria-hidden />
          )}
          {loading ? "Fetching" : "Download"}
        </button>
      </div>
    </motion.form>
  );
}
