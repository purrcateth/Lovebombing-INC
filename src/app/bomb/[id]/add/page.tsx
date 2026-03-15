"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";
import type { BeatPattern } from "@/lib/types";

export default function AddToBombPage() {
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [bomb, setBomb] = useState<{
    canvas_json: object;
    layers: { canvas_json: object }[];
    beat_data?: BeatPattern | null;
    creator_name?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

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
          style={{
            border: "2px solid #000",
            background: "#FFD8F6",
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
            <div style={{ marginTop: "16px" }}>
              <Link href="/" className="aqua-cta">
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
        className="bg-canvas"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease-out",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "480px",
            border: "2px solid #000",
            background: "#FFD8F6",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s",
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
          <div style={{ padding: "30px 24px", textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
                fontWeight: 300,
                color: "#000066",
                fontSize: "32px",
                margin: 0,
                textShadow: "-2px 3px 6px rgba(0,0,0,0.15)",
              }}
            >
              Add Your Lovebombs
            </h1>
            {bomb?.creator_name && (
              <p
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: "16px",
                  color: "#808080",
                  marginTop: "8px",
                }}
              >
                Add your love to {bomb.creator_name}&apos;s lovebomb
              </p>
            )}

            <form
              style={{ marginTop: "24px" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) setNameSubmitted(true);
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                <label
                  htmlFor="collab-name"
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: 22,
                    color: "#262626",
                    whiteSpace: "nowrap",
                    letterSpacing: "1.8px",
                  }}
                >
                  Name:
                </label>
                <input
                  id="collab-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={30}
                  autoFocus
                  style={{
                    flex: 1,
                    maxWidth: "280px",
                    height: "34px",
                    background: "#FFFFFF",
                    border: "1px solid #000000",
                    outline: "none",
                    fontFamily: "'VT323', monospace",
                    fontSize: 20,
                    padding: "0 6px",
                    boxSizing: "border-box",
                  }}
                  placeholder="Type your name"
                />
              </div>
              <div style={{ marginTop: "24px" }}>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="aqua-cta"
                  style={{
                    padding: "8px 32px",
                    opacity: !name.trim() ? 0.5 : 1,
                  }}
                >
                  Let&apos;s go
                </button>
              </div>
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
      creatorBeatData={bomb?.beat_data || null}
    />
  );
}
