import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { SiteExplorer } from "@/components/sites/site-explorer";

export const metadata: Metadata = {
  title: "Supported Sites",
  description: "Browse the platforms Onyx can download from.",
};

export default function SupportedPage() {
  return (
    <PageShell
      wide
      title={
        <>
          Every link, <span className="font-serif font-normal italic text-white/90">one home.</span>
        </>
      }
      description="A few of the platforms Onyx handles out of the box. Under the hood it speaks yt-dlp, so if a site hosts media, chances are it just works."
    >
      <SiteExplorer />
    </PageShell>
  );
}
