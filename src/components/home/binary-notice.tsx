"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import type { HealthStatus } from "@/lib/types";

export function BinaryNotice() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setHealth(json as HealthStatus | null))
      .catch(() => {});
  }, []);

  if (!health || (health.ytdlp.found && health.ffmpeg.found)) return null;

  const message = !health.ytdlp.found
    ? "yt-dlp isn't installed — downloads won't work yet."
    : "FFmpeg isn't installed — audio extraction and quality merging are limited.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs text-white/60"
      role="status"
    >
      <TriangleAlert className="size-3.5 shrink-0 text-white/50" aria-hidden />
      <span>{message}</span>
      <Link
        href="/settings"
        className="shrink-0 font-medium text-white underline underline-offset-4 hover:no-underline"
      >
        Fix in Settings
      </Link>
    </motion.div>
  );
}
