"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FONT = "'HIKARI', 'VT323', sans-serif";
const CURSOR = "url(/cursors/hand.svg) 6 0, pointer";

export default function CreatePage() {
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
      style={{
        backgroundColor: "#FF00FF",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        cursor: "url(/cursors/hand.svg) 6 0, default",
      }}
    >
      <div
        style={{
          background: "#F0EFF5",
          border: "1px solid #A0A0A0",
          boxShadow: "2px 2px 0px rgba(0,0,0,0.15), inset 0 0 0 1px #FFFFFF",
          padding: "48px 56px 40px",
          position: "relative",
          maxWidth: "520px",
          width: "100%",
        }}
      >
        {/* LOGIN label top-left */}
        <span
          style={{
            position: "absolute",
            top: "12px",
            left: "16px",
            fontFamily: FONT,
            fontSize: "14px",
            color: "#000000",
            textTransform: "uppercase" as const,
            letterSpacing: "0.5px",
          }}
        >
          LOGIN
        </span>

        {/* Big title in gothic */}
        <h1
          style={{
            fontFamily: "'UnifrakturMaguntia', 'Old English Text MT', fantasy",
            fontWeight: 400,
            color: "#000060",
            fontSize: "44px",
            lineHeight: 1.1,
            textAlign: "center",
            marginBottom: "16px",
            marginTop: "0",
          }}
        >
          Lovebombing, INC.
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontFamily: FONT,
            fontSize: "16px",
            color: "#000000",
            textAlign: "center",
            marginBottom: "40px",
            marginTop: "0",
          }}
        >
          Bomb your loved ones. Or your haters.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Name row */}
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

          {/* ENTER button */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              style={{
                background: "#E8E8E8",
                border: "2px solid #000000",
                borderRadius: "4px",
                padding: "6px 32px",
                fontFamily: FONT,
                fontSize: "16px",
                fontWeight: "bold",
                color: "#000000",
                cursor: !name.trim() || loading ? "default" : CURSOR,
                boxShadow: "inset 1px 1px 0px #FFFFFF, inset -1px -1px 0px #A0A0A0",
                textTransform: "uppercase" as const,
                letterSpacing: "1px",
                opacity: !name.trim() || loading ? 0.4 : 1,
              }}
            >
              {loading ? "..." : "ENTER"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
