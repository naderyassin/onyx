import { ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <ArrowDownToLine className={cn("size-4 text-white", iconClassName)} strokeWidth={1.8} />
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-xl lowercase tracking-tight text-white", className)}>
      onyx
    </span>
  );
}
