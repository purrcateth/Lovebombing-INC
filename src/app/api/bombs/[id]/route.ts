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

    // Extract beat_data: check dedicated column first, then embedded in canvas_json
    let beat_data = bomb.beat_data ?? null;
    if (!beat_data && bomb.canvas_json && typeof bomb.canvas_json === "object") {
      const cj = bomb.canvas_json as Record<string, unknown>;
      if (cj._beat_data) {
        beat_data = cj._beat_data;
      }
    }

    return NextResponse.json({ ...bomb, beat_data, layers: layers || [] });
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
      thumbnail_url = thumbnail_data;
    }

    // Embed beat_data inside canvas_json so it persists even without a dedicated column
    const canvasWithBeat = { ...canvas_json };
    if (beat_data) {
      canvasWithBeat._beat_data = beat_data;
    }

    // Try saving with beat_data column first, fall back to without
    const baseData: Record<string, unknown> = {
      canvas_json: canvasWithBeat,
      thumbnail_url,
      updated_at: new Date().toISOString(),
    };

    // First try with dedicated beat_data column
    if (beat_data !== undefined) {
      const { error } = await supabase
        .from("bombs")
        .update({ ...baseData, beat_data })
        .eq("id", id);

      if (!error) {
        return NextResponse.json({ success: true });
      }

      // Column doesn't exist — save without it (beat_data is still embedded in canvas_json)
      console.warn("Save with beat_data column failed, using canvas_json embed:", error.message);
    }

    // Save without beat_data column — beat is embedded in canvas_json
    const { error } = await supabase
      .from("bombs")
      .update(baseData)
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
