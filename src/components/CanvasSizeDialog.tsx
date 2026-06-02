"use client";

import { useState, useEffect } from "react";
import { CANVAS_SIZES, type CanvasSize } from "@/lib/types";

interface CanvasSizeDialogProps {
  initialSize?: CanvasSize;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  /** When true, renders inline (no fixed overlay) for use inside an existing dialog/popover */
  inline?: boolean;
  onConfirm: (size: CanvasSize) => void;
  onCancel?: () => void;
}

export default function CanvasSizeDialog({
  initialSize = "square",
  title = "Choose your canvas",
  subtitle = "Pick the shape your lovebomb will live in.",
  confirmLabel = "Open canvas",
  inline = false,
  onConfirm,
  onCancel,
}: CanvasSizeDialogProps) {
  const [selected, setSelected] = useState<CanvasSize>(initialSize);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const sizes: CanvasSize[] = ["square", "landscape", "vertical"];

  const dialogInner = (
    <div
      style={{
        width: "100%",
        maxWidth: "560px",
        background: "#FFD8F6",
        border: "2px solid #000",
        boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
      }}
    >
      {/* Pinstriped title bar */}
      <div
        style={{
          height: "26px",
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
            cursor: onCancel ? "pointer" : "default",
          }}
          onClick={onCancel}
        />
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "'ChiKareGo2', 'VT323', monospace",
            fontSize: "16px",
          }}
        >
          {title}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "28px 28px 24px", textAlign: "center" }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
            fontWeight: 300,
            color: "#000066",
            fontSize: "32px",
            textShadow: "-2px 3px 6px rgba(0,0,0,0.15)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "8px 0 24px",
            fontFamily: "'ChiKareGo2', 'VT323', monospace",
            fontSize: "14px",
            color: "#262626",
          }}
        >
          {subtitle}
        </p>

        {/* Three size cards */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            marginBottom: "24px",
            flexWrap: "wrap",
          }}
        >
          {sizes.map((sizeKey) => {
            const spec = CANVAS_SIZES[sizeKey];
            const isSelected = selected === sizeKey;
            // Visual proxy box — scaled to fit a 90px envelope
            const maxBox = 90;
            const aspect = spec.width / spec.height;
            const boxW = aspect >= 1 ? maxBox : maxBox * aspect;
            const boxH = aspect >= 1 ? maxBox / aspect : maxBox;

            return (
              <button
                key={sizeKey}
                type="button"
                onClick={() => setSelected(sizeKey)}
                style={{
                  width: "140px",
                  background: isSelected ? "#FFFFFF" : "#FFD8F6",
                  border: isSelected ? "2px inset #DFDFDF" : "2px outset #DFDFDF",
                  cursor: "pointer",
                  padding: "14px 8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  fontFamily: "'VT323', monospace",
                }}
              >
                {/* Visual proxy of the canvas shape */}
                <div
                  style={{
                    width: maxBox,
                    height: maxBox,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: boxW,
                      height: boxH,
                      background: "#FFFFFF",
                      border: "2px solid #000",
                      boxShadow: "2px 2px 0 rgba(0,0,0,0.4)",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontFamily: "'ChiKareGo2', 'VT323', monospace",
                    fontSize: "16px",
                    color: "#000",
                  }}
                >
                  {spec.label}
                </div>
                <div
                  style={{
                    fontFamily: "'Apple Garamond Light', Garamond, serif",
                    fontStyle: "italic",
                    fontSize: "13px",
                    color: "#000066",
                  }}
                >
                  {spec.subtitle}
                </div>
                <div
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: "12px",
                    color: "#808080",
                  }}
                >
                  {spec.aspectLabel} &middot; {spec.width}&times;{spec.height}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="aqua-cta"
              style={{ padding: "8px 24px", fontSize: "16px" }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            className="aqua-cta"
            style={{ padding: "8px 32px", fontSize: "16px" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (inline) return dialogInner;

  return (
    <div
      className="bg-create"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 9999,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.4s ease-out",
      }}
    >
      {dialogInner}
    </div>
  );
}
