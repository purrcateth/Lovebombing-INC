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
const TITLE_FONT = "'ChiKareGo2', 'VT323', 'Geneva', monospace";

// Check if canvas has actual user content (not just empty/default)
function canvasHasContent(canvasJson: object): boolean {
  const cj = canvasJson as { objects?: unknown[]; _beat_data?: unknown };
  if (!cj.objects || !Array.isArray(cj.objects)) return false;
  // Filter out internal keys — only count real objects
  return cj.objects.length > 0;
}

export default function BombViewer({ canvasJson, layers, beatData }: BombViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const beatContainerRef = useRef<HTMLDivElement>(null);
  const beatGridRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const beatRef = useRef<BeatSequencerHandle>(null);
  const [scale, setScale] = useState(1);
  const [beatScale, setBeatScale] = useState(1);
  const [beatGridHeight, setBeatGridHeight] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);

  const hasCanvas = canvasHasContent(canvasJson) || layers.length > 0;
  const hasBeat = !!(beatData && beatData.tracks.some((t) => t.pattern.some(Boolean)));

  useEffect(() => {
    if (!hasCanvas || !canvasRef.current) return;

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
  }, [canvasJson, layers, hasCanvas]);

  // Scale beat grid to fit container
  useEffect(() => {
    if (!hasBeat || !beatContainerRef.current) return;

    const handleBeatResize = () => {
      if (!beatContainerRef.current) return;
      const containerWidth = beatContainerRef.current.clientWidth;
      // Beat grid natural width: label(72) + padding(24) + 16 cells(44) + 15 gaps(3) + 3 group gaps(8) = ~869px
      const beatNaturalWidth = 72 + 24 + 16 * 44 + 15 * 3 + 3 * 8;
      if (containerWidth < beatNaturalWidth) {
        setBeatScale(containerWidth / beatNaturalWidth);
      } else {
        setBeatScale(1);
      }

      // Measure actual beat grid height for proper container sizing
      if (beatGridRef.current) {
        setBeatGridHeight(beatGridRef.current.scrollHeight);
      }
    };

    // Small delay to let the beat grid render first
    const timer = setTimeout(handleBeatResize, 100);
    window.addEventListener("resize", handleBeatResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleBeatResize);
    };
  }, [hasBeat]);

  const handlePlayBeat = useCallback(() => {
    if (beatRef.current) {
      beatRef.current.play();
      setTimeout(() => forceUpdate((n) => n + 1), 50);
    }
  }, []);

  const isPlaying = beatRef.current?.isPlaying ?? false;

  // Nothing to show
  if (!hasCanvas && !hasBeat) {
    return null;
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Canvas — only if there are actual objects */}
      {hasCanvas && (
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
      )}

      {/* Beat playback section */}
      {hasBeat && beatData && (
        <div
          ref={beatContainerRef}
          style={{
            marginTop: hasCanvas ? "16px" : 0,
            border: "2px solid #000",
            background: "#FFD8F6",
            boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
            overflow: "hidden",
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
                fontFamily: TITLE_FONT,
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              Beat
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

          {/* Beat grid — scaled to fit without horizontal scroll */}
          <div
            style={{
              overflow: "hidden",
              height: beatGridHeight && beatScale < 1
                ? `${beatGridHeight * beatScale}px`
                : "auto",
            }}
          >
            <div
              ref={beatGridRef}
              style={{
                transform: beatScale < 1 ? `scale(${beatScale})` : "none",
                transformOrigin: "top left",
              }}
            >
              <BeatSequencer
                ref={beatRef}
                pattern={beatData}
                onChange={() => {}}
                readOnly
                hideTransport
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
