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
    const { contributor_name, canvas_json, beat_data } = body;

    if (!contributor_name) {
      return NextResponse.json(
        { error: "contributor_name is required" },
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

    // Soft cap: max 20 contributors per chain to keep viewer/editor performant
    const MAX_CONTRIBUTORS = 20;
    const { count: existingCount } = await supabase
      .from("bomb_layers")
      .select("id", { count: "exact", head: true })
      .eq("bomb_id", bomb_id);
    if ((existingCount ?? 0) >= MAX_CONTRIBUTORS) {
      return NextResponse.json(
        {
          error: `This lovebomb has reached its limit of ${MAX_CONTRIBUTORS} contributors. Start a new chain instead.`,
          code: "CONTRIBUTOR_LIMIT_REACHED",
        },
        { status: 409 }
      );
    }

    const layerId = uuidv4();

    const insertData: Record<string, unknown> = {
      id: layerId,
      bomb_id,
      contributor_name: contributor_name.trim().slice(0, 30),
      canvas_json: canvas_json || { objects: [] },
      created_at: new Date().toISOString(),
    };
    if (beat_data) {
      insertData.beat_data = beat_data;
    }

    const { error } = await supabase.from("bomb_layers").insert(insertData);

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
