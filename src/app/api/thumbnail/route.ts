import { hostResolvesPrivate, parsePublicHttpUrl } from "@/lib/server/net";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Proxies remote thumbnails so referer-blocking CDNs (Instagram, Facebook…)
 * still render, and so the browser only ever loads images from our origin.
 */
export async function GET(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get("url") ?? "";
  const parsed = parsePublicHttpUrl(target);
  if (!parsed) return new Response("Invalid thumbnail URL", { status: 400 });
  if (await hostResolvesPrivate(parsed.hostname)) {
    return new Response("Blocked host", { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "image/*" },
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return new Response("Upstream image unavailable", { status: 502 });
    }
    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return new Response("Image too large", { status: 502 });
    }
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Failed to fetch image", { status: 502 });
  }
}
