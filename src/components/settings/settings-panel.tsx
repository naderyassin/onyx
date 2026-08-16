"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpCircle, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModeSelector } from "@/components/home/mode-selector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { clearHistory } from "@/lib/history";
import { resetSettings, updateSettings, useSettings } from "@/lib/settings";
import type {
  AudioFormat,
  BinaryStatus,
  HealthStatus,
  VideoQualityPreference,
} from "@/lib/types";
import { cn } from "@/lib/utils";

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5 divide-y divide-white/[0.06]">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: BinaryStatus }) {
  return (
    <span className="inline-flex max-w-52 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-white/70">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status.found ? "bg-emerald-400" : "bg-destructive",
        )}
      />
      <span className="truncate">{status.found ? (status.version ?? "Installed") : "Missing"}</span>
    </span>
  );
}

const QUALITY_OPTIONS: { value: VideoQualityPreference; label: string }[] = [
  { value: "best", label: "Best available" },
  { value: "2160", label: "4K · 2160p" },
  { value: "1440", label: "QHD · 1440p" },
  { value: "1080", label: "Full HD · 1080p" },
  { value: "720", label: "HD · 720p" },
  { value: "480", label: "SD · 480p" },
];

const AUDIO_OPTIONS: { value: AudioFormat; label: string }[] = [
  { value: "mp3", label: "MP3 · universal" },
  { value: "m4a", label: "M4A · AAC" },
  { value: "opus", label: "Opus · efficient" },
];

export function SettingsPanel() {
  const settings = useSettings();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingCookies, setUpdatingCookies] = useState(false);
  const cookieInput = useRef<HTMLInputElement>(null);

  const loadHealth = useCallback(async (fresh: boolean) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/health${fresh ? "?fresh=1" : ""}`);
      if (res.ok) setHealth((await res.json()) as HealthStatus);
    } catch {
      // Server unreachable — leave the previous state in place.
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth(false);
  }, [loadHealth]);

  const handleUpdateYtdlp = useCallback(async () => {
    setUpdating(true);
    try {
      const res = await fetch("/api/update-ytdlp", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; output: string };
      // Extract the most relevant line from yt-dlp's output.
      const lines = data.output.split(/\r?\n/).filter(Boolean);
      const summary = lines.at(-1) ?? "Update complete.";
      if (data.ok) {
        toast.success(summary);
        // Refresh the version pill.
        await loadHealth(true);
      } else {
        toast.error(summary || "Update failed.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setUpdating(false);
    }
  }, [loadHealth]);

  const handleCookieFile = useCallback(async (file?: File) => {
    if (!file) return;
    setUpdatingCookies(true);
    try {
      const res = await fetch("/api/cookies", {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: await file.text(),
      });
      const data = (await res.json()) as { installed?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not import cookies.");
      toast.success("Cookies imported. You can retry the playlist now.");
      await loadHealth(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import cookies.");
    } finally {
      setUpdatingCookies(false);
    }
  }, [loadHealth]);

  const handleRemoveCookies = useCallback(async () => {
    setUpdatingCookies(true);
    try {
      const res = await fetch("/api/cookies", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Imported cookies removed");
      await loadHealth(true);
    } catch {
      toast.error("Could not remove the cookie file.");
    } finally {
      setUpdatingCookies(false);
    }
  }, [loadHealth]);

  const selectTriggerClass =
    "h-10 w-44 rounded-xl border-white/12 bg-white/[0.03] text-sm hover:bg-white/[0.05]";

  return (
    <div className="flex flex-col gap-6">
      <Section title="Downloads" description="Defaults applied every time you paste a link.">
        <Row label="Default mode" hint="Auto picks the best video with audio.">
          <ModeSelector
            size="sm"
            layoutId="settings-mode"
            value={settings.defaultMode}
            onChange={(mode) => updateSettings({ defaultMode: mode })}
          />
        </Row>
        <Row label="Video quality" hint="Preselected when a video offers multiple resolutions.">
          <Select
            value={settings.videoQuality}
            onValueChange={(value) =>
              updateSettings({ videoQuality: value as VideoQualityPreference })
            }
          >
            <SelectTrigger className={selectTriggerClass} aria-label="Preferred video quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Audio format" hint="Used when downloading in Audio mode.">
          <Select
            value={settings.audioFormat}
            onValueChange={(value) => updateSettings({ audioFormat: value as AudioFormat })}
          >
            <SelectTrigger className={selectTriggerClass} aria-label="Preferred audio format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title="Behavior">
        <Row label="Fetch on paste" hint="Look up a link automatically the moment it's pasted.">
          <Switch
            checked={settings.autoFetch}
            onCheckedChange={(checked) => updateSettings({ autoFetch: checked })}
            aria-label="Fetch on paste"
          />
        </Row>
        <Row label="Save history" hint="Keep a local record of completed downloads.">
          <Switch
            checked={settings.saveHistory}
            onCheckedChange={(checked) => updateSettings({ saveHistory: checked })}
            aria-label="Save history"
          />
        </Row>
      </Section>

      {health?.cookieImport && <Section
        title="YouTube access"
        description="Use your signed-in session for playlists that YouTube blocks anonymously."
      >
        <Row
          label="cookies.txt"
          hint="Export a Netscape-format cookies.txt from your browser, then import it here. It stays on this PC."
        >
          <div className="flex items-center gap-2">
            <input
              ref={cookieInput}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(event) => {
                void handleCookieFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              disabled={updatingCookies}
              onClick={() => cookieInput.current?.click()}
              className="h-10 gap-2 rounded-xl border-white/15 bg-transparent px-4 hover:bg-white/[0.06]"
            >
              <FileUp className="size-4" />
              {health?.cookies ? "Replace" : "Import"}
            </Button>
            {health?.cookies && (
              <Button
                variant="ghost"
                size="icon"
                disabled={updatingCookies}
                onClick={() => void handleRemoveCookies()}
                aria-label="Remove imported cookies"
                className="size-10 rounded-xl text-white/55 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </Row>
      </Section>}

      <Section
        title="System"
        description="The tools Onyx uses on this machine."
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Re-check installed tools"
            onClick={() => void loadHealth(true)}
            className="size-9 rounded-lg text-white/60 hover:text-white"
          >
            <RefreshCw className={cn(checking && "animate-spin")} />
          </Button>
        }
      >
        <Row
          label="yt-dlp"
          hint={
            health && !health.ytdlp.found
              ? "Install with:  winget install yt-dlp.yt-dlp"
              : "Extracts media from supported sites."
          }
        >
          <div className="flex items-center gap-2">
            {health ? (
              <StatusPill status={health.ytdlp} />
            ) : (
              <span className="font-mono text-xs text-white/40">checking…</span>
            )}
            {health?.ytdlp.found && (
              <Button
                id="update-ytdlp-btn"
                variant="ghost"
                size="sm"
                disabled={updating}
                onClick={() => void handleUpdateYtdlp()}
                className="h-8 gap-1.5 rounded-lg px-2.5 text-xs text-white/60 hover:text-white disabled:opacity-50"
                aria-label="Update yt-dlp to the latest version"
              >
                <ArrowUpCircle
                  className={cn("size-3.5", updating && "animate-spin")}
                />
                {updating ? "Updating…" : "Update"}
              </Button>
            )}
          </div>
        </Row>
        <Row
          label="FFmpeg"
          hint={
            health && !health.ffmpeg.found
              ? "Install with:  winget install Gyan.FFmpeg"
              : "Merges streams and converts audio."
          }
        >
          {health ? (
            <StatusPill status={health.ffmpeg} />
          ) : (
            <span className="font-mono text-xs text-white/40">checking…</span>
          )}
        </Row>
      </Section>

      <Section title="Data" description="Everything Onyx stores lives in this browser.">
        <Row label="Download history" hint="Remove all locally saved entries.">
          <ConfirmDialog
            title="Clear download history?"
            description="This removes every entry from this browser. Downloaded files on your disk are not touched."
            actionLabel="Clear history"
            onConfirm={() => {
              clearHistory();
              toast("History cleared");
            }}
          >
            <Button
              variant="outline"
              className="h-10 rounded-xl border-white/15 bg-transparent px-4 hover:bg-white/[0.06]"
            >
              Clear history
            </Button>
          </ConfirmDialog>
        </Row>
        <Row label="Settings" hint="Restore Onyx to its defaults.">
          <Button
            variant="outline"
            className="h-10 rounded-xl border-white/15 bg-transparent px-4 hover:bg-white/[0.06]"
            onClick={() => {
              resetSettings();
              toast("Settings reset to defaults");
            }}
          >
            Reset
          </Button>
        </Row>
      </Section>
    </div>
  );
}
