// Keepalive cron — hits Supabase once a day so the free-tier project never
// goes idle long enough to auto-pause. Configured in vercel.json.
//
// Without this, Supabase pauses after ~7 days of inactivity, blocking all
// reads/writes until manually restored. The data itself is safe either way —
// pausing only stops the compute layer — but it's a UX hit (saves fail mid-flow).
//
// Vercel Hobby plan allows daily cron jobs only, which is plenty for our needs.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const startedAt = Date.now();
  try {
    // Trivial query — fetches just the count of one row. Cheap on Supabase,
    // but counts as a real hit so the project stays "active".
    const { count, error } = await supabase
      .from("bombs")
      .select("*", { count: "exact", head: true })
      .limit(1);

    const elapsedMs = Date.now() - startedAt;

    if (error) {
      console.error("[keepalive] Supabase query failed:", error);
      return NextResponse.json(
        { ok: false, error: error.message, elapsedMs },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      pingedAt: new Date().toISOString(),
      bombCount: count ?? 0,
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    console.error("[keepalive] unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: String(err), elapsedMs },
      { status: 500 },
    );
  }
}
