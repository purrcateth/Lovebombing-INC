"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

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
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            border: "2px solid #000",
            background: "#C0C0C0",
            padding: "20px 30px",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
          <p
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: "16px",
              color: "#000",
              margin: 0,
            }}
          >
            Loading...
          </p>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            border: "2px solid #000",
            background: "#C0C0C0",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              height: "24px",
              background:
                "repeating-linear-gradient(0deg, #FFF 0px, #FFF 1px, #C0C0C0 1px, #C0C0C0 2px)",
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
                background: "#C0C0C0",
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
            <div style={{ marginTop: "16px" }}>
              <Link
                href="/create"
                style={{
                  padding: "6px 20px",
                  border: "2px outset #DFDFDF",
                  background: "#C0C0C0",
                  fontFamily: "'VT323', monospace",
                  fontSize: "16px",
                  color: "#000",
                  textDecoration: "none",
                  fontWeight: "bold",
                }}
              >
                Create Your Own
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!nameSubmitted) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            border: "2px solid #000",
            background: "#C0C0C0",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
          {/* Pinstriped title bar */}
          <div
            style={{
              height: "24px",
              background:
                "repeating-linear-gradient(0deg, #FFF 0px, #FFF 1px, #C0C0C0 1px, #C0C0C0 2px)",
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
                background: "#C0C0C0",
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
              Collaborative Mode
            </span>
          </div>

          {/* Window body */}
          <div style={{ padding: "30px 24px", textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontWeight: "bold",
                color: "#1a1a6e",
                fontSize: "28px",
                margin: 0,
              }}
            >
              Add Your Lovebombs
            </h1>
            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                color: "#000",
                marginTop: "8px",
              }}
            >
              What&apos;s your name?
            </p>

            <form
              style={{ marginTop: "16px", textAlign: "left" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) setNameSubmitted(true);
              }}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                autoFocus
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontFamily: "'VT323', monospace",
                  fontSize: "16px",
                  background: "#FFFFFF",
                  border: "2px inset #DFDFDF",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                placeholder="Type your name"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                style={{
                  width: "100%",
                  marginTop: "12px",
                  padding: "6px 20px",
                  border: "2px outset #DFDFDF",
                  background: "#C0C0C0",
                  fontFamily: "'VT323', monospace",
                  fontSize: "16px",
                  fontWeight: "bold",
                  color: "#000",
                  cursor: "pointer",
                  opacity: !name.trim() ? 0.5 : 1,
                }}
              >
                Let&apos;s go
              </button>
            </form>
          </div>
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
