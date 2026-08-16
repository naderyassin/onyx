import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  findCookieFile,
  isLocalAppRequest,
  isNetscapeCookieFile,
  writableCookieFile,
} from "@/lib/server/cookie-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COOKIE_BYTES = 5 * 1024 * 1024;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { installed: Boolean(findCookieFile()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isLocalAppRequest(req)) {
    return NextResponse.json({ error: "Cookie import is available only in the desktop app." }, { status: 403 });
  }
  const contents = await req.text();
  if (Buffer.byteLength(contents) > MAX_COOKIE_BYTES) {
    return NextResponse.json({ error: "Cookie file is too large." }, { status: 413 });
  }
  if (!isNetscapeCookieFile(contents)) {
    return NextResponse.json(
      { error: "Choose a Netscape-format cookies.txt file." },
      { status: 400 },
    );
  }

  const destination = writableCookieFile();
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.writeFile(destination, contents, { encoding: "utf8", mode: 0o600 });
  return NextResponse.json({ installed: true });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  if (!isLocalAppRequest(req)) {
    return NextResponse.json({ error: "Cookie removal is available only in the desktop app." }, { status: 403 });
  }
  const destination = writableCookieFile();
  await fs.promises.rm(destination, { force: true });
  return NextResponse.json({ installed: Boolean(findCookieFile()) });
}
