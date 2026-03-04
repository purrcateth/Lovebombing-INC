"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

const FONT = "'HIKARI', 'VT323', sans-serif";
const CURSOR = "url(/cursors/hand.svg) 6 0, pointer";

const cardStyle: React.CSSProperties = {
  background: "#F0EFF5",
  border: "1px solid #A0A0A0",
  boxShadow: "2px 2px 0px rgba(0,0,0,0.15), inset 0 0 0 1px #FFFFFF",
  padding: "48px 56px 40px",
  position: "relative",
  maxWidth: "520px",
  width: "100%",
};

const bgStyle: React.CSSProperties = {
  backgroundColor: "#FF00FF",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
  cursor: "url(/cursors/hand.svg) 6 0, default",
};

const labelStyle: React.CSSProperties = {
  position: "absolute",
  top: "12px",
  left: "16px",
  fontFamily: FONT,
  fontSize: "14px",
  color: "#000000",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "'UnifrakturMaguntia', 'Old English Text MT', fantasy",
  fontWeight: 400,
  color: "#000060",
  fontSize: "44px",
  lineHeight: 1.1,
  textAlign: "center",
  marginBottom: "16px",
  marginTop: "0",
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: "16px",
  color: "#000000",
  textAlign: "center",
  marginBottom: "40px",
  marginTop: "0",
};

export default function AddToBombPage() {
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [bomb, setBomb] = useState<{
    canvas_json: object;
    layers: { canvas_json: object }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBomb = async () => {
      try {
        const res = await fetch(`/api/bombs/${id}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setBomb(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchBomb();
  }, [id]);

  if (loading) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <p style={{ fontFamily: FONT, fontSize: "16px", textAlign: "center", color: "#000" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={bgStyle}>
        <div style={cardStyle}>
          <span style={labelStyle}>ERROR</span>
          <h1 style={{ ...titleStyle, fontSize: "48px" }}>Not Found</h1>
          <p style={subtitleStyle}>This lovebomb could not be found.</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <a
              href="/create"
              style={{
                background: "#E8E8E8",
                border: "2px solid #000000",
                borderRadius: "4px",
                padding: "6px 32px",
                fontFamily: FONT,
                fontSize: "16px",
                fontWeight: "bold",
                color: "#000000",
                cursor: CURSOR,
                boxShadow: "inset 1px 1px 0px #FFFFFF, inset -1px -1px 0px #A0A0A0",
                textTransform: "uppercase",
                letterSpacing: "1px",
                textDecoration: "none",
              }}
            >
              CREATE YOUR OWN
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!nameSubmitted) {
    return (
      <main style={bgStyle}>
        <div style={cardStyle}>
          <span style={labelStyle}>LOGIN</span>

          <h1 style={titleStyle}>Lovebombing, INC.</h1>

          <p style={subtitleStyle}>
            Bomb your loved ones. Or your haters.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setNameSubmitted(true);
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                justifyContent: "center",
                marginBottom: "28px",
              }}
            >
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: "16px",
                  color: "#000000",
                  whiteSpace: "nowrap",
                }}
              >
                Name:
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                autoFocus
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #000000",
                  borderBottom: "2px solid #000000",
                  padding: "4px 8px",
                  fontFamily: FONT,
                  fontSize: "16px",
                  color: "#000000",
                  outline: "none",
                  width: "240px",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                type="submit"
                disabled={!name.trim()}
                style={{
                  background: "#E8E8E8",
                  border: "2px solid #000000",
                  borderRadius: "4px",
                  padding: "6px 32px",
                  fontFamily: FONT,
                  fontSize: "16px",
                  fontWeight: "bold",
                  color: "#000000",
                  cursor: !name.trim() ? "default" : CURSOR,
                  boxShadow: "inset 1px 1px 0px #FFFFFF, inset -1px -1px 0px #A0A0A0",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  opacity: !name.trim() ? 0.4 : 1,
                }}
              >
                ENTER
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <CanvasEditor
      bombId={id}
      creatorName={name.trim()}
      isCollaborative
      backgroundCanvasJson={bomb?.canvas_json || null}
      backgroundLayers={bomb?.layers?.map((l) => l.canvas_json) || []}
    />
  );
}
