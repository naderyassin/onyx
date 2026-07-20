import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getJob } from "@/lib/server/jobs";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  opus: "audio/opus",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job || job.status !== "complete" || !job.filePath || !job.fileName) {
    return NextResponse.json(
      { code: "NOT_READY", error: "This file is not available anymore. Download it again." },
      { status: 404 },
    );
  }
  if (!fs.existsSync(job.filePath)) {
    return NextResponse.json(
      { code: "GONE", error: "The file was cleaned up. Download it again." },
      { status: 410 },
    );
  }

  job.servedAt = Date.now();
  const ext = job.fileName.split(".").pop()?.toLowerCase() ?? "";
  const nodeStream = fs.createReadStream(job.filePath);
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Length": String(job.fileSize ?? ""),
      "Content-Disposition": contentDisposition(job.fileName),
      "Cache-Control": "no-store",
    },
  });
}
