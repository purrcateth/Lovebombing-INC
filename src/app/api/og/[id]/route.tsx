import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { data: bomb } = await supabase
      .from("bombs")
      .select("creator_name, thumbnail_url")
      .eq("id", id)
      .single();

    const creatorName = bomb?.creator_name || "Someone";
    const thumbnailUrl = bomb?.thumbnail_url;

    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#C0C0C0",
            fontFamily: "monospace",
          }}
        >
          {/* Mac window frame */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#FFFFFF",
              border: "3px solid #000000",
              boxShadow: "6px 6px 0px #000000",
              width: 900,
              overflow: "hidden",
            }}
          >
            {/* Title bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderBottom: "2px solid #000000",
                padding: "6px 12px",
                background: "#FFFFFF",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 20,
                  fontWeight: "bold",
                  fontFamily: "monospace",
                }}
              >
                Lovebomb from {creatorName}
              </div>
            </div>

            {/* Content */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 40,
                gap: 20,
              }}
            >
              {thumbnailUrl && thumbnailUrl.startsWith("data:") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt="Lovebomb preview"
                  width={350}
                  height={350}
                  style={{
                    border: "2px solid #000000",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    fontSize: 80,
                    fontFamily: "monospace",
                  }}
                >
                  [Lovebomb]
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  fontSize: 36,
                  fontWeight: "bold",
                  color: "#000000",
                  textAlign: "center",
                  fontFamily: "serif",
                }}
              >
                You received a Lovebomb!
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 18,
                  color: "#404040",
                  fontFamily: "monospace",
                }}
              >
                lovebombing.app
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch {
    // Fallback OG image
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#C0C0C0",
            fontFamily: "monospace",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#FFFFFF",
              border: "3px solid #000000",
              boxShadow: "6px 6px 0px #000000",
              padding: 60,
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 48,
                fontWeight: "bold",
                color: "#000000",
                fontFamily: "serif",
              }}
            >
              Lovebombing
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "#404040",
                fontFamily: "monospace",
              }}
            >
              Create &amp; share digital love notes
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
