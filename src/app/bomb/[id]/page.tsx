import { Metadata } from "next";
import Link from "next/link";
import BombViewer from "@/components/BombViewer";

const MAC_FONT = "'HIKARI', 'VT323', 'Chicago', sans-serif";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getBomb(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/bombs/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bomb = await getBomb(id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!bomb) {
    return { title: "Lovebomb not found" };
  }

  return {
    title: "You received a Lovebomb!",
    description: `Open to see what ${bomb.creator_name} made for you`,
    openGraph: {
      title: "You received a Lovebomb!",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [
        {
          url: `${baseUrl}/api/og/${id}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "You received a Lovebomb!",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [`${baseUrl}/api/og/${id}`],
    },
  };
}

// ── Shared inline styles ──
const pageStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  background: "#FF00FF",
  cursor: "url(/cursors/hand.svg) 6 0, default",
};

const windowStyle: React.CSSProperties = {
  width: "100%",
  background: "#DDDDDD",
  border: "2px solid #555555",
  borderRadius: "6px",
  boxShadow: "4px 4px 12px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const titleBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: "22px",
  padding: "0 6px",
  background: "linear-gradient(180deg, #CCCCCC 0%, #AAAAAA 100%)",
  borderBottom: "1px solid #555555",
  gap: "8px",
  userSelect: "none",
};

const titleBtnGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  alignItems: "center",
};

const closeBtnStyle: React.CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: "#FF5F56",
  border: "1px solid #E0443E",
};

const minimizeBtnStyle: React.CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: "#FFBD2E",
  border: "1px solid #DEA123",
};

const zoomBtnStyle: React.CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "50%",
  background: "#27C93F",
  border: "1px solid #1DAD2B",
};

const titleTextStyle: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  fontSize: "12px",
  fontWeight: "bold",
  color: "#000000",
  letterSpacing: "0.5px",
  fontFamily: MAC_FONT,
};

const btnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "13px",
  fontFamily: MAC_FONT,
  background: "#DDDDDD",
  border: "1px solid #888888",
  borderRadius: "4px",
  boxShadow:
    "inset 1px 1px 0px rgba(255,255,255,0.7), inset -1px -1px 0px rgba(0,0,0,0.2), 1px 1px 1px rgba(0,0,0,0.15)",
  cursor: "url(/cursors/hand.svg) 6 0, pointer",
  color: "#000000",
  textDecoration: "none",
  textAlign: "center",
  flex: 1,
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: "13px",
  fontFamily: MAC_FONT,
  background: "#000000",
  border: "1px solid #000000",
  borderRadius: "4px",
  boxShadow: "2px 2px 4px rgba(0,0,0,0.3)",
  cursor: "url(/cursors/hand.svg) 6 0, pointer",
  color: "#FFFFFF",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center",
  flex: 1,
};

export default async function BombPage({ params }: PageProps) {
  const { id } = await params;
  const bomb = await getBomb(id);

  if (!bomb) {
    return (
      <main style={pageStyle}>
        {/* Mac error dialog */}
        <div style={{ ...windowStyle, maxWidth: "400px" }}>
          <div style={titleBarStyle}>
            <div style={titleBtnGroupStyle}>
              <div style={closeBtnStyle} />
              <div style={minimizeBtnStyle} />
              <div style={zoomBtnStyle} />
            </div>
            <span style={titleTextStyle}>Error</span>
            <span style={{ width: "44px" }} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "14px",
              padding: "24px",
            }}
          >
            {/* Pixel X icon */}
            <svg
              width="48"
              height="48"
              viewBox="0 0 16 16"
              style={{ imageRendering: "pixelated" as const }}
            >
              <rect
                x="2"
                y="2"
                width="12"
                height="12"
                fill="none"
                stroke="black"
                strokeWidth="1"
              />
              <line
                x1="4"
                y1="4"
                x2="12"
                y2="12"
                stroke="black"
                strokeWidth="1.5"
              />
              <line
                x1="12"
                y1="4"
                x2="4"
                y2="12"
                stroke="black"
                strokeWidth="1.5"
              />
            </svg>
            <h1
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: "bold",
                color: "#000000",
                fontFamily: MAC_FONT,
              }}
            >
              Lovebomb not found
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "#000000",
                textAlign: "center",
                fontFamily: MAC_FONT,
              }}
            >
              The application &quot;Lovebomb&quot; could not be found. It may
              have been moved or deleted.
            </p>
            <Link href="/create" style={btnPrimaryStyle}>
              Create Your Own
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ ...pageStyle, padding: "16px 16px 32px" }}>
      {/* Mac window containing the lovebomb */}
      <div style={{ ...windowStyle, maxWidth: "640px" }}>
        <div style={titleBarStyle}>
          <div style={titleBtnGroupStyle}>
            <div style={closeBtnStyle} />
            <div style={minimizeBtnStyle} />
            <div style={zoomBtnStyle} />
          </div>
          <span style={titleTextStyle}>
            Lovebomb from {bomb.creator_name}
          </span>
          <span style={{ width: "44px" }} />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
            padding: "16px",
          }}
        >
          <BombViewer
            canvasJson={bomb.canvas_json}
            layers={bomb.layers || []}
          />

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: "2px",
              background:
                "linear-gradient(to right, transparent, #888888, transparent)",
            }}
          />

          <div
            style={{
              display: "flex",
              width: "100%",
              maxWidth: "360px",
              gap: "10px",
            }}
          >
            <Link href={`/bomb/${id}/add`} style={btnPrimaryStyle}>
              Add Your Art
            </Link>
            <Link href="/create" style={btnStyle}>
              Create Your Own
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
