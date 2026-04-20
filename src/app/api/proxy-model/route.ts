import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = ["estuary-public.s3.us-west-1.amazonaws.com", "localhost", "minio"];
const ALLOWED_PATH_PREFIXES = ["/agent_models/", "/agent_images/", "/static/agent_models/", "/static/agent_images/", "/estuary-public/agent_models/", "/estuary-public/agent_images/"];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  if (!ALLOWED_PATH_PREFIXES.some((p) => parsed.pathname.startsWith(p))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  // Rewrite Docker-internal minio hostname to localhost for local dev
  let fetchUrl = url;
  if (parsed.hostname === "minio") {
    fetchUrl = url.replace(`${parsed.protocol}//minio:`, `${parsed.protocol}//localhost:`);
  }

  const upstream = await fetch(fetchUrl);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: upstream.status });
  }

  const body = upstream.body;
  return new NextResponse(body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "model/gltf-binary",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
