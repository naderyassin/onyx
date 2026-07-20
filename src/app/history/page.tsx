import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { HistoryList } from "@/components/history/history-list";

export const metadata: Metadata = {
  title: "History",
  description: "Your past downloads, stored locally in this browser.",
};

export default function HistoryPage() {
  return (
    <PageShell
      title={
        <>
          Your <span className="font-serif font-normal italic text-white/90">library.</span>
        </>
      }
      description="Everything you've saved with Onyx. This list lives only in this browser — nothing is sent anywhere."
    >
      <HistoryList />
    </PageShell>
  );
}
