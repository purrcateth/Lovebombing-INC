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
    let canvas_size = bomb.canvas_size ?? null;
    if (bomb.canvas_json && typeof bomb.canvas_json === "object") {
      const cj = bomb.canvas_json as Record<string, unknown>;
      if (!beat_data && cj._beat_data) beat_data = cj._beat_data;
      if (!canvas_size && cj._canvas_size) canvas_size = cj._canvas_size as string;
    }

    // Extract beat_data from each layer too
    const enrichedLayers = (layers || []).map((layer: Record<string, unknown>) => {
      let layerBeat = layer.beat_data ?? null;
      if (!layerBeat && layer.canvas_json && typeof layer.canvas_json === "object") {
        const lcj = layer.canvas_json as Record<string, unknown>;
        if (lcj._beat_data) {
          layerBeat = lcj._beat_data;
        }
      }
      return { ...layer, beat_data: layerBeat };
    });

    return NextResponse.json({ ...bomb, beat_data, canvas_size: canvas_size || "square", layers: enrichedLayers });
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
    const { canvas_json, thumbnail_data, beat_data, canvas_size } = body;

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

    // Embed extras inside canvas_json so they persist even without dedicated columns
    const canvasWithExtras = { ...canvas_json } as Record<string, unknown>;
    if (beat_data) canvasWithExtras._beat_data = beat_data;
    if (canvas_size) canvasWithExtras._canvas_size = canvas_size;

    // Try saving with all dedicated columns first, fall back step-by-step
    const baseData: Record<string, unknown> = {
      canvas_json: canvasWithExtras,
      thumbnail_url,
      updated_at: new Date().toISOString(),
    };

    // Attempt 1: with both dedicated columns
    {
      const update: Record<string, unknown> = { ...baseData };
      if (beat_data !== undefined) update.beat_data = beat_data;
      if (canvas_size !== undefined) update.canvas_size = canvas_size;
      const { error } = await supabase.from("bombs").update(update).eq("id", id);
      if (!error) return NextResponse.json({ success: true });
      console.warn("Save with dedicated columns failed, falling back:", error.message);
    }

    // Attempt 2: with beat_data only (canvas_size column might be missing)
    if (beat_data !== undefined) {
      const { error } = await supabase
        .from("bombs")
        .update({ ...baseData, beat_data })
        .eq("id", id);
      if (!error) return NextResponse.json({ success: true });
      console.warn("Save with beat_data column failed, using canvas_json embed:", error.message);
    }

    // Attempt 3: canvas_json only — extras embedded inside
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
