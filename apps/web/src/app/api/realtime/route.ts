import { NextResponse } from "next/server";
import { checkAllRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const feeds = await checkAllRealtime();
  return NextResponse.json({
    integrity:
      "No simulated realtime payloads. Status is not_connected until env URLs are set and reachable.",
    feeds,
  });
}
