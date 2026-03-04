import Link from "next/link";

const MAC_FONT = "'HIKARI', 'VT323', 'Chicago', sans-serif";
const SERIF_FONT = "'UnifrakturMaguntia', 'Old English Text MT', fantasy";

export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        background: "#FF00FF",
        cursor: "url(/cursors/hand.svg) 6 0, default",
      }}
    >
      {/* Mac OS 9 Platinum window */}
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#DDDDDD",
          border: "2px solid #555555",
          borderRadius: "6px",
          boxShadow: "4px 4px 12px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        {/* Title bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "22px",
            padding: "0 6px",
            background: "linear-gradient(180deg, #CCCCCC 0%, #AAAAAA 100%)",
            borderBottom: "1px solid #555555",
            gap: "8px",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#FF5F56",
                border: "1px solid #E0443E",
              }}
            />
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#FFBD2E",
                border: "1px solid #DEA123",
              }}
            />
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#27C93F",
                border: "1px solid #1DAD2B",
              }}
            />
          </div>
          <span
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: "12px",
              fontWeight: "bold",
              color: "#000000",
              letterSpacing: "0.5px",
              fontFamily: MAC_FONT,
            }}
          >
            Welcome to Lovebombing
          </span>
          <span style={{ width: "44px" }} />
        </div>

        {/* Window content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            padding: "36px 32px",
          }}
        >
          {/* Retro Mac icon - pixelated bomb */}
          <div
            style={{
              fontFamily: MAC_FONT,
              imageRendering: "pixelated" as const,
              fontSize: "48px",
            }}
          >
            <svg
              width="80"
              height="80"
              viewBox="0 0 16 16"
              style={{ imageRendering: "pixelated" as const }}
            >
              <rect x="6" y="0" width="4" height="2" fill="black" />
              <rect x="4" y="2" width="2" height="2" fill="black" />
              <rect x="10" y="2" width="2" height="2" fill="black" />
              <rect x="4" y="4" width="8" height="2" fill="black" />
              <rect x="2" y="6" width="12" height="2" fill="black" />
              <rect x="2" y="8" width="12" height="2" fill="black" />
              <rect x="2" y="10" width="12" height="2" fill="black" />
              <rect x="4" y="12" width="8" height="2" fill="black" />
              <rect x="6" y="14" width="4" height="2" fill="black" />
              <rect x="10" y="1" width="2" height="3" fill="black" />
              <rect x="12" y="0" width="2" height="2" fill="black" />
            </svg>
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: SERIF_FONT,
              fontWeight: 400,
              color: "#000060",
              fontSize: "44px",
              lineHeight: 1.1,
              textAlign: "center",
              margin: 0,
            }}
          >
            Lovebombing, INC.
          </h1>

          <p
            style={{
              maxWidth: "360px",
              textAlign: "center",
              fontSize: "16px",
              color: "#000000",
              fontFamily: MAC_FONT,
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Create handmade digital collage art and share it with anyone through a link.
          </p>

          {/* Divider */}
          <div
            style={{
              width: "100%",
              height: "2px",
              background: "linear-gradient(to right, transparent, #888888, transparent)",
            }}
          />

          <Link
            href="/create"
            style={{
              padding: "6px 24px",
              fontSize: "14px",
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
            }}
          >
            Create a Lovebomb
          </Link>

          <p
            style={{
              fontSize: "11px",
              color: "#888888",
              fontFamily: MAC_FONT,
              margin: 0,
            }}
          >
            v1.0 &bull; Mac OS 9
          </p>
        </div>
      </div>
    </main>
  );
}
