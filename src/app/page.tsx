"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/bombs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_name: name.trim() }),
      });
      const data = await res.json();
      router.push(`/create/${data.id}`);
    } catch {
      alert("Something went wrong. Please try again!");
      setLoading(false);
    }
  };

  return (
    <main
      className="bg-create"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      {/* Pink window */}
      <div
        className="page-window"
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#FFD8F6",
          border: "1px solid #262626",
          boxShadow: "1px 1px 0px 0px #262626",
          position: "relative",
          overflow: "hidden",
          padding: "32px 44px 40px",
          textAlign: "center",
        }}
      >
        {/* Inner highlight lines (top + left = white) */}
        <div style={{ position: "absolute", top: 1, left: 0, right: 0, height: 1, background: "#FFFFFF" }} />
        <div style={{ position: "absolute", top: 0, left: 1, bottom: 0, width: 1, background: "#FFFFFF" }} />
        {/* Inner shadow lines (bottom + right = gray) */}
        <div style={{ position: "absolute", bottom: 1, left: 0, right: 0, height: 1, background: "#808080" }} />
        <div style={{ position: "absolute", top: 0, right: 1, bottom: 0, width: 1, background: "#808080" }} />

        {/* Title — Apple Garamond Light */}
        <h1
          style={{
            fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, 'Times New Roman', serif",
            fontWeight: 300,
            fontStyle: "normal",
            fontSize: 80,
            color: "#000066",
            lineHeight: "normal",
            margin: 0,
            textShadow: "-3.5px 6px 12px rgba(0,0,0,0.25), 0px 4.5px 4.5px rgba(0,0,0,0.25)",
          }}
        >
          Lovebombing
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: "'B612 Mono', monospace",
            fontSize: 14,
            color: "#262626",
            letterSpacing: "1.1px",
            margin: "16px 0 0",
            whiteSpace: "nowrap",
            textShadow: "0px 0px 1px #262626, 0px 0px 1px #262626",
          }}
        >
          Bomb your loved ones.Or your haters.
        </p>

        {/* Name input row */}
        <form onSubmit={handleSubmit} style={{ marginTop: "52px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              width: 430,
              height: 34,
              margin: "0 auto",
            }}
          >
            <label
              htmlFor="name-input"
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: 22,
                color: "#262626",
                whiteSpace: "nowrap",
                letterSpacing: "1.8px",
                textShadow: "0px 0px 1px #262626, 0px 0px 1px #262626",
              }}
            >
              Name:
            </label>
            <input
              id="name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoFocus
              style={{
                flex: 1,
                height: "100%",
                background: "#FFFFFF",
                border: "1px solid #000000",
                outline: "none",
                fontFamily: "'VT323', monospace",
                fontSize: 20,
                padding: "0 6px",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* CTA button — frame1.png aqua button */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: "36px" }}>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: !name.trim() || loading ? "not-allowed" : "pointer",
                opacity: !name.trim() || loading ? 0.5 : 1,
              }}
            >
              <img
                src="/backgrounds/frame1.png"
                alt="Take me there"
                style={{
                  height: 80,
                  width: "auto",
                  display: "block",
                }}
              />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
