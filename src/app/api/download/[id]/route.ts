import { NextResponse } from "next/server";
import { cancelJob, getJob, pauseJob, publicState } from "@/lib/server/jobs";
import { resumeDownload } from "@/lib/server/ytdlp";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// A fresh response per call — a Response body can only be consumed once.
const notFound = () =>
  NextResponse.json({ code: "NOT_FOUND", error: "Download not found." }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return notFound();
  return NextResponse.json(publicState(job), { headers: { "Cache-Control": "no-store" } });
}

/** Pause or resume an in-flight download. */
export async function PATCH(req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return notFound();

  let action: unknown;
  try {
    ({ action } = (await req.json()) as { action?: unknown });
  } catch {
    action = undefined;
  }

  if (action === "pause") {
    const result = pauseJob(id);
    if (result === "not-found") return notFound();
    if (result === "not-pausable") {
      return NextResponse.json(
        { code: "NOT_PAUSABLE", error: "This download can't be paused right now." },
        { status: 409 },
      );
    }
    return NextResponse.json(publicState(job));
  }

  if (action === "resume") {
    if (job.status !== "paused") {
      return NextResponse.json(
        { code: "NOT_PAUSED", error: "This download isn't paused." },
        { status: 409 },
      );
    }
    try {
      resumeDownload(job);
    } catch {
      return NextResponse.json(
        { code: "RESUME_FAILED", error: "Could not resume the download." },
        { status: 500 },
      );
    }
    return NextResponse.json(publicState(job));
  }

  return NextResponse.json(
    { code: "BAD_REQUEST", error: "Expected action 'pause' or 'resume'." },
    { status: 400 },
  );
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const ok = cancelJob(id);
  if (!ok) return notFound();
  return NextResponse.json({ ok: true });
}
