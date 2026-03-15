"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import type { BeatPattern } from "@/lib/types";
import BeatSequencer, { BeatSequencerHandle } from "@/components/BeatSequencer";

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
    _isAnimatedSticker?: boolean;
  };
  if (candidate._isAnimatedSticker) return true;
  if (typeof candidate.getSrc === "function") {
    return isGifSource(candidate.getSrc());
  }
  return false;
};

const MAC_FONT = "'VT323', 'Geneva', monospace";

export default function BombViewer({ canvasJson, layers, beatData }: BombViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const beatRef = useRef<BeatSequencerHandle>(null);
  const [scale, setScale] = useState(1);
  const [, forceUpdate] = useState(0);

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
      // Much bigger display — up to 800px on desktop
      const maxDisplaySize = Math.min(containerWidth, 800);
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

  const handlePlayBeat = useCallback(() => {
    if (beatRef.current) {
      beatRef.current.play();
      // Force re-render to update button state
      setTimeout(() => forceUpdate((n) => n + 1), 50);
    }
  }, []);

  const isPlaying = beatRef.current?.isPlaying ?? false;

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
            <div style={{ width: "12px", height: "12px", border: "1px solid #000", background: "#FFD8F6" }} />
            <span
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: MAC_FONT,
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              🎵 Beat
            </span>
          </div>

          {/* Play controls bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              background: "#f0d8ec",
              borderBottom: "1px solid #ccc",
            }}
          >
            <button
              onClick={handlePlayBeat}
              style={{
                width: 40,
                height: 40,
                border: "2px outset #DFDFDF",
                background: isPlaying ? "#FF6B9D" : "#FFD8F6",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                fontFamily: MAC_FONT,
                borderRadius: 0,
              }}
            >
              {isPlaying ? "■" : "▶"}
            </button>
            <span
              style={{
                fontFamily: MAC_FONT,
                fontSize: "18px",
                color: "#000066",
              }}
            >
              {isPlaying ? "Now playing..." : "Press play to listen"}
            </span>
            <span
              style={{
                fontFamily: MAC_FONT,
                fontSize: "14px",
                color: "#808080",
                marginLeft: "auto",
              }}
            >
              {beatData.bpm} BPM
            </span>
          </div>

          {/* Beat grid */}
          <div style={{ maxHeight: "300px", overflow: "auto" }}>
            <BeatSequencer
              ref={beatRef}
              pattern={beatData}
              onChange={() => {}}
              readOnly
              hideTransport
            />
          </div>
        </div>
      )}
    </div>
  );
}
