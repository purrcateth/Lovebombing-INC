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
      className="bg-create"
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
          maxWidth: "430px",
          border: "2px solid #000000",
          background: "#f7d4e6",
          boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
        }}
      >
        {/* Pinstriped title bar */}
        <div
          style={{
            height: "24px",
            background:
              "repeating-linear-gradient(0deg, #FFF6FB 0px, #FFF6FB 1px, #F5CFE2 1px, #F5CFE2 2px)",
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
              background: "#f5cfe2",
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
              fontFamily:
                "'Apple Garamond Light', 'Apple Garamond', Garamond, 'Times New Roman', serif",
              fontWeight: 300,
              color: "#1a1a6e",
              fontSize: "72px",
              margin: 0,
              textShadow: "2px 2px 0 rgba(0, 0, 0, 0.2)",
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
              aria-label={loading ? "Creating..." : "Take me there"}
              style={{
                width: "36%",
                marginTop: "14px",
                marginLeft: "auto",
                marginRight: "auto",
                aspectRatio: "1675 / 539",
                minHeight: "44px",
                border: "none",
                padding: 0,
                background: "url('/backgrounds/frame1.png') center / cover no-repeat",
                cursor: !name.trim() || loading ? "not-allowed" : "pointer",
                opacity: !name.trim() || loading ? 0.5 : 1,
                position: "relative",
                display: "block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  width: "1px",
                  height: "1px",
                  padding: 0,
                  margin: "-1px",
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              >
                {loading ? "Creating..." : "Take me there"}
              </span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
