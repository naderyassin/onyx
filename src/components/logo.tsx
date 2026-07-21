import { ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";

export function PowerSparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="36,4 20,30 32,30 26,60 46,28 34,28" fill="white" />
      <path d="M10 16H14V20H10V16ZM50 18H54V22H50V18Z" fill="white" />
    </svg>
  );
}

export function LogoMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-gradient-to-b from-white/12 to-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
        className,
      )}
    >
      <PowerSparkIcon className={cn("size-5 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]", iconClassName)} />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-pixel text-lg tracking-wider text-white uppercase", className)}>
      onyx
    </span>
  );
}

export function OnyxPixelTitle({ className }: { className?: string }) {
  return (
    <img
      src="/onyx-logo.png?v=4"
      alt="ONYX"
      className={cn("w-full max-w-[480px] h-auto select-none object-contain pointer-events-none", className)}
    />
  );
}
