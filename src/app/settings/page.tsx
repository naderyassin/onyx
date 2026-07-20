import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { SettingsPanel } from "@/components/settings/settings-panel";

export const metadata: Metadata = {
  title: "Settings",
  description: "Tune how Onyx downloads and behaves.",
};

export default function SettingsPage() {
  return (
    <PageShell
      title={
        <>
          Tuned to <span className="font-serif font-normal italic text-white/90">taste.</span>
        </>
      }
      description="Defaults for new downloads, app behavior, and the state of the tools Onyx relies on. Everything is stored locally."
    >
      <SettingsPanel />
    </PageShell>
  );
}
