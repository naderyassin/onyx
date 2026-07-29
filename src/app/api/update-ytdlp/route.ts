import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { resolveBinaries } from "@/lib/server/binaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  const bins = await resolveBinaries(false);

  if (!bins.ytdlp.found || !bins.ytdlp.path) {
    return NextResponse.json(
      { error: "yt-dlp is not installed on this machine." },
      { status: 503 },
    );
  }

  const bin = bins.ytdlp.path;

  const result = await new Promise<{ ok: boolean; output: string }>((resolve) => {
    execFile(
      bin,
      ["-U"],
      { timeout: 120_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        resolve({ ok: !err || err.code === 0, output });
      },
    );
  });

  // Bust the binary cache so the new version is reflected on next health check.
  await resolveBinaries(true);

  return NextResponse.json(
    { ok: result.ok, output: result.output },
    { status: result.ok ? 200 : 500 },
  );
}
