"use client";

import { motion } from "framer-motion";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "@/lib/motion";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="flex flex-col items-center"
      >
        <div className="grid size-14 place-items-center rounded-2xl border border-white/12 bg-white/[0.04]">
          <TriangleAlert className="size-6 text-white/70" strokeWidth={1.6} />
        </div>
        <h1 className="mt-6 text-2xl font-medium tracking-tight">
          Something went <span className="font-serif italic">sideways.</span>
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          An unexpected error interrupted the page. Nothing was lost — try again.
        </p>
        <Button
          onClick={reset}
          className="mt-7 h-11 rounded-xl bg-white px-6 text-black hover:bg-white/90"
        >
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
      </motion.div>
    </div>
  );
}
