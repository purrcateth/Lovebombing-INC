"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

export default function CanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);

  useEffect(() => {
    const fetchBomb = async () => {
      try {
        const res = await fetch(`/api/bombs/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setCreatorName(data.creator_name);
      } catch {
        setCreatorName("Anonymous");
      } finally {
        setDataReady(true);
      }
    };
    fetchBomb();
  }, [id]);

  // Show loading screen for at least 2 seconds, then fade to canvas
  useEffect(() => {
    if (!dataReady) return;
    const timer = setTimeout(() => {
      setShowCanvas(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [dataReady]);

  if (!showCanvas) {
    return (
      <div
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
            background: "#FFD8F6",
            border: "2px solid #000",
            textAlign: "center",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
            maxWidth: 380,
            width: "100%",
            position: "relative",
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
                fontSize: "14px",
                fontWeight: "bold",
              }}
            >
              Lovebombing, INC.
            </span>
          </div>

          {/* Loading content */}
          <div style={{ padding: "36px 32px 40px" }}>
            <p
              style={{
                fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
                fontWeight: 300,
                fontSize: "28px",
                color: "#000066",
                margin: 0,
                textShadow: "-2px 3px 6px rgba(0,0,0,0.15)",
              }}
            >
              Preparing your canvas...
            </p>

            {/* Progress bar */}
            <div
              style={{
                marginTop: "24px",
                width: "100%",
                height: "18px",
                border: "2px solid #000",
                background: "#FFF",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  background: "repeating-linear-gradient(90deg, #6699CC 0px, #6699CC 8px, #4477AA 8px, #4477AA 16px)",
                  animation: "progressFill 2s ease-in-out forwards",
                }}
              />
            </div>

            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "14px",
                color: "#808080",
                marginTop: "12px",
              }}
            >
              Loading stickers, brushes, and sounds...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-fade-in">
      <CanvasEditor bombId={id} creatorName={creatorName || "Anonymous"} />
    </div>
  );
}
