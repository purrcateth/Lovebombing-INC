"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import type { BeatPattern, BombLayer, CanvasSize } from "@/lib/types";
import { CANVAS_SIZES } from "@/lib/types";
import BeatSequencer, { BeatSequencerHandle } from "@/components/BeatSequencer";

interface ContributorBeat {
  name: string;
  beatData: BeatPattern;
}

interface BombViewerProps {
  canvasJson: object;
  layers: BombLayer[];
  beatData?: BeatPattern | null;
  creatorName?: string;
  canvasSize?: CanvasSize;
}

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
  return cj.objects.length > 0;
}

// Check if a layer has actual visual objects
function layerHasContent(layerJson: object): boolean {
  const lj = layerJson as { objects?: unknown[] };
  if (!lj.objects || !Array.isArray(lj.objects)) return false;
  return lj.objects.length > 0;
}

// Check if a beat pattern has any actual content
function beatHasContent(beat: BeatPattern | null | undefined): boolean {
  if (!beat || !beat.tracks) return false;
  return beat.tracks.some((t) => t.pattern.some(Boolean));
}

export default function BombViewer({ canvasJson, layers, beatData, creatorName, canvasSize = "square" }: BombViewerProps) {
  const dims = CANVAS_SIZES[canvasSize];
  const CANVAS_W = dims.width;
  const CANVAS_H = dims.height;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [scale, setScale] = useState(1);
  const [, forceUpdate] = useState(0);

  // Build list of all contributor beats
  const allBeats: ContributorBeat[] = [];
  if (beatHasContent(beatData) && beatData) {
    allBeats.push({ name: creatorName || "Creator", beatData });
  }
  for (const layer of layers) {
    if (beatHasContent(layer.beat_data)) {
      allBeats.push({ name: layer.contributor_name, beatData: layer.beat_data! });
    }
  }

  const hasCanvas = canvasHasContent(canvasJson) || layers.some((l) => l.canvas_json && layerHasContent(l.canvas_json));
  const hasAnyBeat = allBeats.length > 0;

  // Accordion state for each beat
  const [openAccordions, setOpenAccordions] = useState<Set<number>>(new Set());
  const beatRefs = useRef<(BeatSequencerHandle | null)[]>([]);
  const beatContainerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [beatScales, setBeatScales] = useState<number[]>([]);

  const toggleAccordion = (index: number) => {
    setOpenAccordions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  useEffect(() => {
    if (!hasCanvas || !canvasRef.current) return;

    const canvas = new fabric.StaticCanvas(canvasRef.current, {
      width: CANVAS_W,
      height: CANVAS_H,
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
      // Fit inside container width AND cap displayed dimensions at 800px
      const scaleByWidth = containerWidth / CANVAS_W;
      const scaleByCap = 800 / Math.max(CANVAS_W, CANVAS_H);
      const newScale = Math.min(scaleByWidth, scaleByCap);
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

  // Scale beat grids to fit container
  useEffect(() => {
    if (!hasAnyBeat) return;

    const measureScales = () => {
      const beatNaturalWidth = 72 + 24 + 16 * 44 + 15 * 3 + 3 * 8;
      const newScales = allBeats.map((_, i) => {
        const container = beatContainerRefs.current[i];
        if (!container) return 1;
        const w = container.clientWidth;
        return w < beatNaturalWidth ? w / beatNaturalWidth : 1;
      });
      setBeatScales(newScales);
    };

    const t1 = setTimeout(measureScales, 100);
    const t2 = setTimeout(measureScales, 500);
    window.addEventListener("resize", measureScales);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measureScales);
    };
  }, [hasAnyBeat, allBeats.length, openAccordions.size]);

  const handlePlayBeat = useCallback((index: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ref = beatRefs.current[index];
    if (ref) {
      ref.play();
      setTimeout(() => forceUpdate((n) => n + 1), 50);
    }
  }, []);

  // Nothing to show
  if (!hasCanvas && !hasAnyBeat) {
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
                width: CANVAS_W * scale,
                height: CANVAS_H * scale,
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

      {/* Beat sections — one accordion per contributor */}
      {hasAnyBeat && (
        <div style={{ marginTop: hasCanvas ? "16px" : 0 }}>
          {allBeats.map((contrib, i) => {
            const isOpen = openAccordions.has(i);
            const isPlayingThis = beatRefs.current[i]?.isPlaying ?? false;
            const hasDrums = contrib.beatData.tracks.some(
              (t) => !t.instrument.startsWith("melody_") && !t.instrument.startsWith("recording_") && t.pattern.some(Boolean)
            );
            const hasMelody = contrib.beatData.tracks.some(
              (t) => t.instrument.startsWith("melody_") && t.pattern.some(Boolean)
            );
            const hasRecording = contrib.beatData.tracks.some(
              (t) => t.instrument.startsWith("recording_") && t.pattern.some(Boolean)
            );
            const contentLabel = [hasDrums && "Beat", hasMelody && "Melody", hasRecording && "Recording"].filter(Boolean).join(" & ");

            return (
              <div
                key={i}
                style={{
                  border: "2px solid #000",
                  background: "#FFD8F6",
                  boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
                  overflow: "hidden",
                  marginBottom: i < allBeats.length - 1 ? "8px" : 0,
                }}
              >
                {/* Accordion header / title bar */}
                <div
                  onClick={() => toggleAccordion(i)}
                  style={{
                    height: "28px",
                    background:
                      "repeating-linear-gradient(0deg, #FFF 0px, #FFF 1px, #FFD8F6 1px, #FFD8F6 2px)",
                    borderBottom: isOpen ? "2px solid #000" : "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 8px",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <div style={{ width: "12px", height: "12px", border: "1px solid #000", background: "#FFD8F6" }} />

                  {/* Play button in header */}
                  <button
                    onClick={(e) => handlePlayBeat(i, e)}
                    style={{
                      width: 22,
                      height: 22,
                      border: "1px solid #808080",
                      background: isPlayingThis ? "#FF6B9D" : "#FFD8F6",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontFamily: MAC_FONT,
                      borderRadius: 0,
                      marginLeft: "8px",
                      flexShrink: 0,
                    }}
                  >
                    {isPlayingThis ? "\u25A0" : "\u25B6"}
                  </button>

                  <span
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontFamily: TITLE_FONT,
                      fontSize: "14px",
                      fontWeight: "normal",
                    }}
                  >
                    {contrib.name}&apos;s {contentLabel}
                  </span>

                  <span style={{ fontSize: "12px", fontFamily: MAC_FONT, color: "#808080" }}>
                    {contrib.beatData.bpm} BPM
                  </span>

                  {/* Chevron */}
                  <span
                    style={{
                      marginLeft: "6px",
                      fontSize: "10px",
                      fontFamily: MAC_FONT,
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  >
                    {"\u25BC"}
                  </span>
                </div>

                {/* Beat grid — visible when accordion is open */}
                {isOpen && (
                  <div ref={(el) => { beatContainerRefs.current[i] = el; }}>
                    <div
                      style={{
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          transform: (beatScales[i] ?? 1) < 1 ? `scale(${beatScales[i]})` : "none",
                          transformOrigin: "top left",
                        }}
                      >
                        <BeatSequencer
                          ref={(el) => { beatRefs.current[i] = el; }}
                          pattern={contrib.beatData}
                          onChange={() => {}}
                          readOnly
                          hideTransport
                          showAll
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
