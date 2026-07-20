"use client";

import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#101010",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#f5f5f5",
              borderRadius: "14px",
            },
          }}
        />
      </TooltipProvider>
    </MotionConfig>
  );
}
