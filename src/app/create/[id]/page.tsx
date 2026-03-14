"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

export default function CanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    };
    fetchBomb();
  }, [id]);

  if (loading) {
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
          className="page-window loading-pulse"
          style={{
            background: "#FFD8F6",
            border: "2px solid #000",
            padding: "40px 32px",
            textAlign: "center",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
            maxWidth: 360,
          }}
        >
          {/* Title bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
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
              Loading...
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "20px",
                color: "#000",
              }}
            >
              Preparing your canvas...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CanvasEditor bombId={id} creatorName={creatorName || "Anonymous"} />
  );
}
