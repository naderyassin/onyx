import { cn } from "@/lib/utils";

interface PageShellProps {
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}

export function PageShell({ title, description, children, wide }: PageShellProps) {
  return (
    <div className={cn("mx-auto w-full px-5 pb-24 pt-36", wide ? "max-w-4xl" : "max-w-2xl")}>
      <header>
        <h1 className="text-3xl font-medium tracking-[-0.02em] sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            {description}
          </p>
        )}
      </header>
      <div className="mt-10">{children}</div>
    </div>
  );
}
