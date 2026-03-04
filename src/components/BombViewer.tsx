"use client";

import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";

interface BombViewerProps {
  canvasJson: object;
  layers: { canvas_json: object }[];
}

const CANVAS_SIZE = 1080;

export default function BombViewer({ canvasJson, layers }: BombViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.StaticCanvas(canvasRef.current, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      backgroundColor: "#ffffff",
    });

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

      canvas.renderAll();
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
          background: "#AAAAAA",
          borderRadius: "2px",
          boxShadow:
            "inset 1px 1px 2px rgba(0,0,0,0.25), inset -1px -1px 1px rgba(255,255,255,0.5)",
          border: "1px solid #555555",
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
