import { NextResponse } from "next/server";
import { getJob, isTerminal, publicState } from "@/lib/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUSH_INTERVAL_MS = 400;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!getJob(id)) {
    return NextResponse.json({ code: "NOT_FOUND", error: "Download not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {}
      };
      const push = () => {
        if (closed) return;
        const job = getJob(id);
        if (!job) {
          close();
          return;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(publicState(job))}\n\n`));
        } catch {
          close();
          return;
        }
        if (isTerminal(job.status)) close();
      };
      timer = setInterval(push, PUSH_INTERVAL_MS);
      req.signal.addEventListener("abort", close);
      push();
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
