import Link from "next/link";

export default function Home() {
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
          maxWidth: "520px",
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
            gap: "6px",
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
            Lovebombing, INC.
          </span>
        </div>

        {/* Window body */}
        <div style={{ padding: "40px 30px", textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "'Apple Garamond Light', 'Apple Garamond', Garamond, 'Times New Roman', serif",
              fontWeight: 300,
              color: "#1a1a6e",
              fontSize: "48px",
              margin: 0,
              lineHeight: 1,
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
              marginTop: "12px",
            }}
          >
            show love through handmade digital art
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "center",
              marginTop: "24px",
            }}
          >
            <Link
              href="/create"
              style={{
                padding: "6px 20px",
                border: "2px outset #DFDFDF",
                background: "#C0C0C0",
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                color: "#000000",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              Create a Lovebomb
            </Link>
            <Link
              href="/bomb/demo"
              style={{
                padding: "6px 20px",
                border: "2px outset #DFDFDF",
                background: "#FFFFFF",
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                color: "#000000",
                textDecoration: "none",
              }}
            >
              View Example
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
