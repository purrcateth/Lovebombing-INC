import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

// POST /api/bombs — Create a new lovebomb
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { creator_name } = body;

    if (!creator_name || typeof creator_name !== "string") {
      return NextResponse.json(
        { error: "creator_name is required" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const { error } = await supabase.from("bombs").insert({
      id,
      creator_name: creator_name.trim().slice(0, 30),
      canvas_json: {},
      thumbnail_url: null,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { error: "Failed to create lovebomb" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id });
  } catch (err) {
    console.error("Create bomb error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
