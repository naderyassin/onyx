import { NextResponse } from "next/server";
import { cancelJob, getJob, publicState } from "@/lib/server/jobs";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Download not found." }, { status: 404 });
  }
  return NextResponse.json(publicState(job), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const ok = cancelJob(id);
  if (!ok) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Download not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
