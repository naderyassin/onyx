import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { resolveBinaries } from "@/lib/server/binaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const status = await resolveBinaries(fresh);
  const cookiesFound = [
    process.env.COOKIES_PATH,
    path.join(process.cwd(), "cookies.txt"),
    path.join(process.cwd(), "cookies.dat"),
  ].some((p) => p && fs.existsSync(p));
  return NextResponse.json(
    { ...status, cookies: cookiesFound },
    { headers: { "Cache-Control": "no-store" } },
  );
}
