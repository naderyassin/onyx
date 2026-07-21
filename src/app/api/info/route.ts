import { NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/validate";
import { AppError } from "@/lib/server/errors";
import { parsePublicHttpUrl } from "@/lib/server/net";
import { fetchInfo } from "@/lib/server/ytdlp";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST", error: "Invalid request body." }, { status: 400 });
  }

  const rawUrl =
    typeof body === "object" && body !== null && "url" in body
      ? String((body as { url: unknown }).url ?? "")
      : "";
  const normalized = normalizeUrl(rawUrl);
  const parsed = normalized ? parsePublicHttpUrl(normalized) : null;
  if (!parsed) {
    return NextResponse.json(
      { code: "INVALID_URL", error: "Enter a valid public video link." },
      { status: 400 },
    );
  }

  try {
    const info = await fetchInfo(parsed.toString());
    return NextResponse.json(info);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { code: "INTERNAL", error: "Something went wrong while fetching video details." },
      { status: 500 },
    );
  }
}
