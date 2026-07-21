import { NextResponse } from "next/server";
import type { AudioFormat, DownloadMode } from "@/lib/types";
import { normalizeUrl } from "@/lib/validate";
import { AppError } from "@/lib/server/errors";
import { createJob, destroyJob } from "@/lib/server/jobs";
import { parsePublicHttpUrl } from "@/lib/server/net";
import { startDownload } from "@/lib/server/ytdlp";

export const runtime = "nodejs";

const MODES: DownloadMode[] = ["auto", "video", "audio"];
const AUDIO_FORMATS: AudioFormat[] = ["mp3", "m4a", "opus"];

interface DownloadBody {
  url?: unknown;
  mode?: unknown;
  height?: unknown;
  audioFormat?: unknown;
  playlist?: unknown;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: DownloadBody;
  try {
    body = (await req.json()) as DownloadBody;
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST", error: "Invalid request body." }, { status: 400 });
  }

  const normalized = normalizeUrl(String(body.url ?? ""));
  const parsed = normalized ? parsePublicHttpUrl(normalized) : null;
  if (!parsed) {
    return NextResponse.json(
      { code: "INVALID_URL", error: "Enter a valid public video link." },
      { status: 400 },
    );
  }

  const mode = MODES.includes(body.mode as DownloadMode) ? (body.mode as DownloadMode) : "auto";

  let height: number | undefined;
  if (mode === "video" && body.height != null) {
    const h = Number(body.height);
    if (!Number.isInteger(h) || h < 144 || h > 4320) {
      return NextResponse.json(
        { code: "BAD_REQUEST", error: "Invalid quality selection." },
        { status: 400 },
      );
    }
    height = h;
  }

  const audioFormat = AUDIO_FORMATS.includes(body.audioFormat as AudioFormat)
    ? (body.audioFormat as AudioFormat)
    : "mp3";

  const playlist = body.playlist === true;

  const job = createJob(parsed.toString(), mode, playlist);
  try {
    await startDownload(job, { mode, height, audioFormat, playlist });
  } catch (err) {
    destroyJob(job.id);
    if (err instanceof AppError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { code: "INTERNAL", error: "Could not start the download." },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
