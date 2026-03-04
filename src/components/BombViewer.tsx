"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";

interface BombViewerProps {
  canvasJson: object;
  layers: { canvas_json: object }[];
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

export default function BombViewer({ canvasJson, layers }: BombViewerProps) {
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

  return (
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
  );
}
