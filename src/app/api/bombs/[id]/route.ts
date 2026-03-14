import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/bombs/[id] — Get a lovebomb by ID
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { data: bomb, error } = await supabase
      .from("bombs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !bomb) {
      return NextResponse.json(
        { error: "Lovebomb not found" },
        { status: 404 }
      );
    }

    // Also fetch layers
    const { data: layers } = await supabase
      .from("bomb_layers")
      .select("*")
      .eq("bomb_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ ...bomb, layers: layers || [] });
  } catch (err) {
    console.error("Get bomb error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/bombs/[id] — Update a lovebomb (save canvas)
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { canvas_json, thumbnail_data, beat_data } = body;

    if (!canvas_json) {
      return NextResponse.json(
        { error: "canvas_json is required" },
        { status: 400 }
      );
    }

    // If thumbnail data is provided, store it
    let thumbnail_url = null;
    if (thumbnail_data) {
      // Store thumbnail as base64 in the record for now
      // In production, upload to Supabase Storage
      thumbnail_url = thumbnail_data;
    }

    const updateData: Record<string, unknown> = {
      canvas_json,
      thumbnail_url,
      updated_at: new Date().toISOString(),
    };

    // Only include beat_data if provided (column may not exist yet)
    if (beat_data !== undefined) {
      updateData.beat_data = beat_data;
    }

    const { error } = await supabase
      .from("bombs")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: "Failed to save lovebomb" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update bomb error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
