import { NextResponse } from "next/server";
import { resolveBinaries } from "@/lib/server/binaries";
import { findCookieFile, isLoopbackRequest } from "@/lib/server/cookie-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const status = await resolveBinaries(fresh);
  const cookiesFound = Boolean(findCookieFile());
  return NextResponse.json(
    { ...status, cookies: cookiesFound, cookieImport: isLoopbackRequest(req) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
