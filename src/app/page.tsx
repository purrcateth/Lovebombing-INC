"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // Trigger fade-in on mount (works with both refresh and client navigation)
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

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
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.7s ease-out",
      }}
    >
      {/* Pink window */}
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#FFD8F6",
          border: "1px solid #262626",
          boxShadow: "1px 1px 0px 0px #262626",
          position: "relative",
          overflow: "hidden",
          padding: "53px 44px 43px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "24px",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.6s ease-out 0.15s, transform 0.6s ease-out 0.15s",
        }}
      >
        {/* Inner highlight lines (top + left = white) */}
        <div style={{ position: "absolute", top: 1, left: 0, right: 0, height: 1, background: "#FFFFFF" }} />
        <div style={{ position: "absolute", top: 0, left: 1, bottom: 0, width: 1, background: "#FFFFFF" }} />
        {/* Inner shadow lines (bottom + right = gray) */}
        <div style={{ position: "absolute", bottom: 1, left: 0, right: 0, height: 1, background: "#808080" }} />
        <div style={{ position: "absolute", top: 0, right: 1, bottom: 0, width: 1, background: "#808080" }} />

        {/* Title — TAYBang */}
        <h1
          style={{
            fontFamily: "'TAYBang', 'Apple Garamond Light', Georgia, serif",
            fontWeight: "normal",
            fontStyle: "normal",
            fontSize: 80,
            color: "#000066",
            lineHeight: "normal",
            margin: 0,
            textShadow: "-3.5px 6px 12px rgba(0,0,0,0.25), 0px 4.5px 4.5px rgba(0,0,0,0.25)",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 0.5s ease-out 0.3s, transform 0.5s ease-out 0.3s",
          }}
        >
          Lovebombing
        </h1>

        {/* Poetic manifesto — Ray Johnson mail art lineage */}
        <p
          style={{
            fontFamily: "'TAYSundae', 'Apple Garamond Light', Garamond, Georgia, serif",
            fontSize: 15,
            lineHeight: 1.7,
            color: "#3a3a5e",
            margin: 0,
            maxWidth: 460,
            textAlign: "center",
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.6s ease-out 0.55s",
          }}
        >
          In the lineage of Ray Johnson&apos;s mail art, Lovebombing is a participatory work that travels through a network of senders and receivers, gathering meaning as it moves. Each piece is composed by hand, the maker chooses a frame (square, landscape, or vertical, the formats of the Polaroid, the screen, and the phone), arranges a canvas of images, clips, and stickers pulled from a shared archive and from their own scraps, and builds a beat from scratch on a small sequencer. The making itself is recorded, a timelapse of the gesture, kept alongside the finished piece. Each receiver adds a layer, visual or sonic, or composes something in response, and sends it forward. The work holds that intimacy in the internet age is built less from grand declarations than from accumulated shorthand, and from the visible labor of having made something for someone. Each piece is small. The chain is the work.
        </p>

        {/* Name input row */}
        <form
          onSubmit={handleSubmit}
          style={{
            margin: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(10px)",
            transition: "opacity 0.5s ease-out 0.6s, transform 0.5s ease-out 0.6s",
          }}
        >
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
                fontFamily: "'ChiKareGo2', 'VT323', 'Geneva', monospace",
                fontSize: 18,
                color: "#262626",
                whiteSpace: "nowrap",
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
          <div style={{ display: "flex", justifyContent: "center", marginTop: 0 }}>
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
