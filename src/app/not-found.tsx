import Link from "next/link";
import { MoveLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm tracking-[0.3em] text-white/35">404</p>
      <h1 className="mt-4 text-3xl font-medium tracking-tight">
        This page doesn&apos;t <span className="font-serif italic">exist.</span>
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The link may be broken, or the page may have been moved.
      </p>
      <Button
        asChild
        className="mt-8 h-11 rounded-xl bg-white px-6 text-black hover:bg-white/90"
      >
        <Link href="/">
          <MoveLeft data-icon="inline-start" />
          Back home
        </Link>
      </Button>
    </div>
  );
}
