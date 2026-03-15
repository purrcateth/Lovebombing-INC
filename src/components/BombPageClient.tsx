"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import BombViewer from "@/components/BombViewer";
import type { BeatPattern } from "@/lib/types";

const TOTAL_HEARTS = 10;
const HEART_INTERVAL = 200;

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

interface BombPageClientProps {
  bomb: {
    creator_name: string;
    canvas_json: object;
    beat_data?: BeatPattern | null;
    layers: { canvas_json: object }[];
  };
  id: string;
}

export default function BombPageClient({ bomb, id }: BombPageClientProps) {
  const [mounted, setMounted] = useState(false);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Show loading for hearts to fill, then fade to content
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowContent(true);
    }, TOTAL_HEARTS * HEART_INTERVAL + 300);
    return () => clearTimeout(timer);
  }, []);

  if (!showContent) {
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
              Opening your lovebomb...
            </p>

            <HeartProgressBar />

            <p
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "14px",
                color: "#808080",
                marginTop: "16px",
              }}
            >
              Loading canvas, stickers, and beats...
            </p>
          </div>
        </div>
      </div>
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
        opacity: 0,
        animation: "pageFadeIn 0.8s ease-out 0.1s both",
      }}
    >
      {/* Mac Finder Window */}
      <div
        style={{
          width: "100%",
          maxWidth: "900px",
          border: "2px solid #000",
          background: "#FFD8F6",
          boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          opacity: 0,
          animation: "slideUp 0.6s ease-out 0.2s both",
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
              fontFamily: "'ChiKareGo2', 'VT323', monospace",
              fontSize: "16px",
              fontWeight: "bold",
            }}
          >
            Lovebombing, INC.
          </span>
        </div>

        {/* Window body */}
        <div style={{ padding: "24px" }}>
          <div
            style={{
              textAlign: "center",
              marginBottom: "20px",
              opacity: 0,
              animation: "slideUp 0.5s ease-out 0.4s both",
            }}
          >
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
              Someone made this just for you
            </p>
          </div>

          <div style={{ opacity: 0, animation: "pageFadeIn 0.6s ease-out 0.5s both" }}>
            <BombViewer canvasJson={bomb.canvas_json} layers={bomb.layers || []} beatData={bomb.beat_data} />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "12px",
              marginTop: "20px",
              opacity: 0,
              animation: "slideUp 0.5s ease-out 0.7s both",
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
