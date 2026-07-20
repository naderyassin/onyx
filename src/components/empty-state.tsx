import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/12 bg-white/[0.015] px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <Icon className="size-6 text-white/40" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
