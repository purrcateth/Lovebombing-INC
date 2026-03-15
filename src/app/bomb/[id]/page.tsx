import { Metadata } from "next";
import Link from "next/link";
import BombViewer from "@/components/BombViewer";
import { supabase } from "@/lib/supabase";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getBomb(id: string) {
  try {
    const { data: bomb, error } = await supabase
      .from("bombs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !bomb) return null;

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

    return { ...bomb, beat_data, layers: layers || [] };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bomb = await getBomb(id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!bomb) return { title: "Lovebomb not found" };

  return {
    title: "You received a Lovebomb!",
    description: `Open to see what ${bomb.creator_name} made for you`,
    openGraph: {
      title: "You received a Lovebomb!",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [{ url: `${baseUrl}/api/og/${id}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "You received a Lovebomb!",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [`${baseUrl}/api/og/${id}`],
    },
  };
}

export default async function BombPage({ params }: PageProps) {
  const { id } = await params;
  const bomb = await getBomb(id);

  if (!bomb) {
    return (
      <main
        className="bg-canvas"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          className="page-window"
          style={{
            width: "100%",
            maxWidth: "480px",
            border: "2px solid #000",
            background: "#FFD8F6",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              height: "24px",
              background:
                "repeating-linear-gradient(0deg, #FFF 0px, #FFF 1px, #FFD8F6 1px, #FFD8F6 2px)",
              borderBottom: "2px solid #000",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                border: "1px solid #000",
                background: "#FFD8F6",
              }}
            />
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Error
            </span>
          </div>
          <div style={{ padding: "30px 24px", textAlign: "center" }}>
            <p style={{ fontSize: "48px", margin: 0 }}>&#x26A0;</p>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: "bold",
                color: "#1a1a6e",
                fontSize: "28px",
                margin: "8px 0 0 0",
              }}
            >
              This lovebomb doesn&apos;t exist
            </h1>
            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                color: "#000",
                marginTop: "8px",
              }}
            >
              Try sending a fresh one to someone special.
            </p>
            <div style={{ marginTop: "16px" }}>
              <Link href="/create" className="aqua-cta">
                Create your own
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="bg-canvas"
      style={{
        padding: "20px",
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "40px",
      }}
    >
      {/* Mac Finder Window — wider for bigger canvas */}
      <div
        className="page-window"
        style={{
          width: "100%",
          maxWidth: "900px",
          border: "2px solid #000",
          background: "#FFD8F6",
          boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
        }}
      >
        {/* Pinstriped title bar */}
        <div
          style={{
            height: "24px",
            background:
              "repeating-linear-gradient(0deg, #FFF 0px, #FFF 1px, #FFD8F6 1px, #FFD8F6 2px)",
            borderBottom: "2px solid #000",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "12px",
              border: "1px solid #000",
              background: "#FFD8F6",
            }}
          />
          <span
            style={{
              flex: 1,
              textAlign: "center",
              fontFamily: "'VT323', monospace",
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            Lovebombing, INC.
          </span>
        </div>

        {/* Window body */}
        <div style={{ padding: "24px" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <h1
              style={{
                fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, 'Times New Roman', serif",
                fontWeight: 300,
                fontStyle: "normal",
                color: "#000066",
                fontSize: "44px",
                margin: 0,
                textShadow: "-2px 3px 6px rgba(0,0,0,0.25), 0px 2px 3px rgba(0,0,0,0.25)",
              }}
            >
              A lovebomb from {bomb.creator_name}
            </h1>
            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                color: "#808080",
                margin: "8px 0 0",
              }}
            >
              Someone made this just for you 💗
            </p>
          </div>

          <BombViewer canvasJson={bomb.canvas_json} layers={bomb.layers || []} beatData={bomb.beat_data} />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            <Link href={`/bomb/${id}/add`} className="aqua-cta">
              Add Your Lovebombs
            </Link>
            <Link href="/" className="aqua-cta">
              Create Your Own
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
