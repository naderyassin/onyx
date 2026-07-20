import { NextResponse } from "next/server";
import { resolveBinaries } from "@/lib/server/binaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const status = await resolveBinaries(fresh);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
