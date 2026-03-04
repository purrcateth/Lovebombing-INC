import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/bombs/[id]/layer — Add a collaborative layer
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: bomb_id } = await context.params;
    const body = await request.json();
    const { contributor_name, canvas_json } = body;

    if (!contributor_name || !canvas_json) {
      return NextResponse.json(
        { error: "contributor_name and canvas_json are required" },
        { status: 400 }
      );
    }

    // Check that the bomb exists
    const { data: bomb, error: bombError } = await supabase
      .from("bombs")
      .select("id")
      .eq("id", bomb_id)
      .single();

    if (bombError || !bomb) {
      return NextResponse.json(
        { error: "Lovebomb not found" },
        { status: 404 }
      );
    }

    const layerId = uuidv4();

    const { error } = await supabase.from("bomb_layers").insert({
      id: layerId,
      bomb_id,
      contributor_name: contributor_name.trim().slice(0, 30),
      canvas_json,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Supabase layer insert error:", error);
      return NextResponse.json(
        { error: "Failed to save layer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: layerId });
  } catch (err) {
    console.error("Create layer error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
