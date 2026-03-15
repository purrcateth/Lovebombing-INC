"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

const TOTAL_HEARTS = 10;
const HEART_INTERVAL = 200; // ms per heart

function HeartProgressBar() {
  const [filledHearts, setFilledHearts] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFilledHearts((prev) => {
        if (prev >= TOTAL_HEARTS) {
          clearInterval(timer);
          return TOTAL_HEARTS;
        }
        return prev + 1;
      });
    }, HEART_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        justifyContent: "center",
        alignItems: "center",
        marginTop: "24px",
      }}
    >
      {Array.from({ length: TOTAL_HEARTS }, (_, i) => (
        <span
          key={i}
          style={{
            fontSize: "22px",
            transition: "all 0.3s ease-out",
            opacity: i < filledHearts ? 1 : 0.2,
            transform: i < filledHearts ? "scale(1)" : "scale(0.7)",
            filter: i < filledHearts ? "none" : "grayscale(1)",
          }}
        >
          {i < filledHearts ? "💗" : "🤍"}
        </span>
      ))}
    </div>
  );
}

export default function CanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

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

  // Show loading for at least 2.2s (hearts fill up), then fade to canvas
  useEffect(() => {
    if (!dataReady) return;
    const timer = setTimeout(() => {
      setShowCanvas(true);
    }, TOTAL_HEARTS * HEART_INTERVAL + 300);
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
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease-out",
        }}
      >
        <div
          style={{
            background: "#FFD8F6",
            border: "2px solid #000",
            textAlign: "center",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
            maxWidth: 400,
            width: "100%",
            position: "relative",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s",
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
                fontFamily: "'ChiKareGo2', 'VT323', monospace",
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

            {/* Heart progress bar */}
            <HeartProgressBar />

            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "14px",
                color: "#808080",
                marginTop: "16px",
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
    <div
      style={{
        opacity: 1,
        animation: "pageFadeIn 0.8s ease-out both",
      }}
    >
      <CanvasEditor bombId={id} creatorName={creatorName || "Anonymous"} />
    </div>
  );
}
