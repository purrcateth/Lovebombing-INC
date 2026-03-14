"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import type { BeatPattern } from "@/lib/types";
import BeatSequencer from "@/components/BeatSequencer";

interface BombViewerProps {
  canvasJson: object;
  layers: { canvas_json: object }[];
  beatData?: BeatPattern | null;
}

const CANVAS_SIZE = 1080;
const ANIMATED_KEY = "_isAnimatedSticker";

const isGifSource = (src?: string) => Boolean(src && /(^data:image\/gif|\.gif($|\?))/i.test(src));

const objectHasAnimation = (obj: fabric.FabricObject) => {
  const candidate = obj as fabric.FabricImage & {
    getSrc?: () => string;
    [ANIMATED_KEY]?: boolean;
  };
  if (candidate[ANIMATED_KEY]) return true;
  if (typeof candidate.getSrc === "function") {
    return isGifSource(candidate.getSrc());
  }
  return false;
};

export default function BombViewer({ canvasJson, layers, beatData }: BombViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.StaticCanvas(canvasRef.current, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      backgroundColor: "#ffffff",
    });

    const stopAnimationLoop = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const startAnimationLoopIfNeeded = () => {
      const hasAnimated = canvas.getObjects().some((obj) => objectHasAnimation(obj));
      if (!hasAnimated) {
        stopAnimationLoop();
        return;
      }
      if (animationFrameRef.current !== null) return;
      const tick = () => {
        canvas.requestRenderAll();
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    const loadCanvas = async () => {
      await canvas.loadFromJSON(canvasJson);

      // Load collaborative layers on top
      for (const layer of layers) {
        if (!layer.canvas_json) continue;
        const layerData = layer.canvas_json as { objects?: object[] };
        if (layerData.objects && Array.isArray(layerData.objects)) {
          for (const objData of layerData.objects) {
            try {
              const objects = await fabric.util.enlivenObjects([objData]);
              for (const obj of objects) {
                canvas.add(obj as fabric.FabricObject);
              }
            } catch {
              // skip objects that fail to load
            }
          }
        }
      }

      for (const obj of canvas.getObjects()) {
        if (objectHasAnimation(obj)) {
          obj.set({ objectCaching: false });
        }
      }

      canvas.renderAll();
      startAnimationLoopIfNeeded();
    };

    loadCanvas();

    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const maxDisplaySize = Math.min(containerWidth, 500);
      const newScale = maxDisplaySize / CANVAS_SIZE;
      setScale(newScale);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      stopAnimationLoop();
      canvas.dispose();
    };
  }, [canvasJson, layers]);

  const hasBeat = beatData && beatData.tracks.some((t) => t.pattern.some(Boolean));

  return (
    <div style={{ width: "100%" }}>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            padding: 0,
            background: "#FFFFFF",
            border: "2px inset #DFDFDF",
          }}
        >
          <div
            style={{
              width: CANVAS_SIZE * scale,
              height: CANVAS_SIZE * scale,
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </div>

      {/* Beat playback section */}
      {hasBeat && beatData && (
        <div
          style={{
            marginTop: "16px",
            border: "2px solid #000",
            background: "#FFD8F6",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
          }}
        >
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
            <div style={{ width: "12px", height: "12px", border: "1px solid #000", background: "#FFD8F6" }} />
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: "'VT323', monospace",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Beat
            </span>
          </div>
          <div style={{ height: "240px", overflow: "auto" }}>
            <BeatSequencer
              pattern={beatData}
              onChange={() => {}}
              readOnly
            />
          </div>
        </div>
      )}
    </div>
  );
}
