"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      {/* Mac Window */}
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          border: "2px solid #000000",
          background: "#C0C0C0",
          boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
        }}
      >
        {/* Pinstriped title bar */}
        <div
          style={{
            height: "24px",
            background:
              "repeating-linear-gradient(0deg, #FFFFFF 0px, #FFFFFF 1px, #C0C0C0 1px, #C0C0C0 2px)",
            borderBottom: "2px solid #000000",
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
            New Lovebomb
          </span>
        </div>

        {/* Window body */}
        <div style={{ padding: "30px 24px", textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: "bold",
              color: "#1a1a6e",
              fontSize: "36px",
              margin: 0,
            }}
          >
            Lovebombing
          </h1>
          <p
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: "16px",
              color: "#000000",
              marginTop: "8px",
            }}
          >
            show love through handmade digital art
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ marginTop: "20px", textAlign: "left" }}
          >
            <label
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                fontWeight: "bold",
                color: "#000000",
                display: "block",
                marginBottom: "4px",
              }}
            >
              What&apos;s your name?
            </label>
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
              disabled={!name.trim() || loading}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "6px 20px",
                border: "2px outset #DFDFDF",
                background: "#C0C0C0",
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                fontWeight: "bold",
                color: "#000000",
                cursor: "pointer",
                opacity: !name.trim() || loading ? 0.5 : 1,
              }}
            >
              {loading ? "Creating..." : "Let's go!"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
