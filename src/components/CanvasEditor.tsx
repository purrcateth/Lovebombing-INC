"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { stickerCategories } from "@/lib/stickers";
import type { StickerCategory, BeatPattern } from "@/lib/types";
import BeatSequencer, { BeatSequencerHandle } from "@/components/BeatSequencer";
import { createDefaultPattern } from "@/lib/audioEngine";
import { parseGif } from "@/lib/gifParser";

interface CanvasEditorProps {
  bombId: string;
  creatorName: string;
  initialCanvasJson?: object | null;
  isCollaborative?: boolean;
  backgroundCanvasJson?: object | null;
  backgroundLayers?: object[];
  creatorBeatData?: BeatPattern | null;
}

type ToolType = "pointer" | "pencil" | "eraser";

const MAX_OBJECTS = 100;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB for videos
const CANVAS_SIZE = 1080;

// Custom property to mark locked background objects
const LOCKED_KEY = "_isLockedBackground";
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

/**
 * Create a Fabric image from a video element using a proxy canvas.
 */
function createVideoFabricImage(
  video: HTMLVideoElement,
  width: number,
  height: number
): fabric.FabricImage {
  const proxy = document.createElement("canvas");
  proxy.width = width;
  proxy.height = height;
  const ctx = proxy.getContext("2d")!;
  ctx.drawImage(video, 0, 0, width, height);

  let running = true;
  const tick = () => {
    if (!running) return;
    try { ctx.drawImage(video, 0, 0, width, height); } catch { /* */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const fabricImg = new fabric.FabricImage(proxy as unknown as HTMLImageElement);
  fabricImg.set({ objectCaching: false, dirty: true });
  (fabricImg as fabric.FabricImage & Record<string, unknown>)[ANIMATED_KEY] = true;
  (fabricImg as fabric.FabricImage & Record<string, unknown>)._stopProxy = () => { running = false; };
  return fabricImg;
}

// Global registry to prevent GIF animation data from being garbage collected
const gifAnimationRegistry = new Map<number, {
  proxy: HTMLCanvasElement;
  frames: { imageData: ImageData; delay: number }[];
  running: boolean;
}>();
let gifRegistryId = 0;

/**
 * Create a Fabric image from an animated GIF.
 * Uses a pure-JS GIF parser (works on ALL browsers: Safari, Firefox, Chrome).
 * Decodes every frame from the binary data, then cycles through them on a proxy canvas.
 */
async function createGifFabricImage(
  file: Blob
): Promise<{ fabricImg: fabric.FabricImage; width: number; height: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const gif = parseGif(arrayBuffer);

  if (gif.frames.length === 0) {
    // Fallback: load as static image
    const objectUrl = URL.createObjectURL(file);
    const img = await fabric.FabricImage.fromURL(objectUrl);
    URL.revokeObjectURL(objectUrl);
    return { fabricImg: img, width: img.width || 150, height: img.height || 150 };
  }

  const w = gif.width;
  const h = gif.height;
  const proxy = document.createElement("canvas");
  proxy.width = w;
  proxy.height = h;
  const ctx = proxy.getContext("2d")!;

  // Draw first frame
  ctx.putImageData(gif.frames[0].imageData, 0, 0);

  // Store in registry to prevent GC
  const regId = gifRegistryId++;
  const entry = {
    proxy,
    frames: gif.frames.map((f) => ({ imageData: f.imageData, delay: f.delay })),
    running: true,
  };
  gifAnimationRegistry.set(regId, entry);

  // Cycle through frames
  let currentFrame = 0;
  const cycleFrames = () => {
    if (!entry.running) return;
    currentFrame = (currentFrame + 1) % entry.frames.length;
    ctx.putImageData(entry.frames[currentFrame].imageData, 0, 0);
    const delay = entry.frames[currentFrame].delay || 100;
    setTimeout(cycleFrames, Math.max(delay, 16));
  };
  setTimeout(cycleFrames, entry.frames[0].delay || 100);

  const fabricImg = new fabric.FabricImage(proxy as unknown as HTMLImageElement);
  fabricImg.set({ objectCaching: false, dirty: true });
  (fabricImg as fabric.FabricImage & Record<string, unknown>)[ANIMATED_KEY] = true;
  (fabricImg as fabric.FabricImage & Record<string, unknown>)._gifRegId = regId;
  (fabricImg as fabric.FabricImage & Record<string, unknown>)._stopProxy = () => {
    entry.running = false;
    gifAnimationRegistry.delete(regId);
  };

  return { fabricImg, width: w, height: h };
}

// ─── Mac OS Retro Inline Styles ───────────────────────────────────
const MAC = {
  bg: "#FFD8F6",
  bgDark: "#808080",
  bgLight: "#DFDFDF",
  border: "#808080",
  borderDark: "#000000",
  borderLight: "#FFFFFF",
  pinstripes:
    "repeating-linear-gradient(0deg, #FFFFFF 0px, #FFFFFF 1px, #FFD8F6 1px, #FFD8F6 2px)",
  inset:
    "inset 1px 1px 2px rgba(0,0,0,0.3), inset -1px -1px 1px rgba(255,255,255,0.5)",
  outset:
    "1px 1px 0px rgba(0,0,0,0.2), inset 1px 1px 0px rgba(255,255,255,0.7), inset -1px -1px 0px rgba(0,0,0,0.15)",
  btnOutset:
    "inset 1px 1px 0px rgba(255,255,255,0.9), inset -1px -1px 0px rgba(0,0,0,0.25), 1px 1px 1px rgba(0,0,0,0.15)",
  btnActive:
    "inset 1px 1px 2px rgba(0,0,0,0.3), inset -1px -1px 1px rgba(255,255,255,0.4)",
  font: "'VT323', 'Geneva', monospace",
  fontSize: "16px",
};

// Reusable style objects
const styles = {
  root: {
    display: "flex",
    height: "100vh",
    flexDirection: "column" as const,
    background:
      "url('/backgrounds/lovebombing_cloudsbg.png') center center / cover fixed no-repeat",
    fontFamily: MAC.font,
    fontSize: MAC.fontSize,
    padding: "12px",
    boxSizing: "border-box" as const,
  },
  rootDesktop: {
    flexDirection: "row" as const,
    gap: "12px",
    padding: "42px 42px 14px 42px",
  },
  // ─── Title Bar ──────────────────
  titleBar: {
    display: "flex",
    alignItems: "center",
    height: "24px",
    padding: "0 8px",
    background: MAC.pinstripes,
    borderBottom: `2px solid ${MAC.borderDark}`,
    gap: "8px",
    userSelect: "none" as const,
    flexShrink: 0,
  },
  closeBox: {
    width: "12px",
    height: "12px",
    border: `1px solid ${MAC.borderDark}`,
    background: MAC.bg,
  },
  titleText: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: "16px",
    fontWeight: "bold" as const,
    color: "#000000",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    fontFamily: MAC.font,
  },
  titleCounter: {
    fontSize: "14px",
    color: "#000000",
    fontFamily: MAC.font,
    whiteSpace: "nowrap" as const,
  },
  // ─── Status Bar ──────────────────
  statusBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "20px",
    padding: "0 8px",
    background: MAC.bg,
    borderTop: `1px solid ${MAC.borderDark}`,
    fontSize: "14px",
    fontFamily: MAC.font,
    color: "#000000",
    userSelect: "none" as const,
    flexShrink: 0,
    gap: "8px",
  },
  // ─── Mac Button ──────────────────
  btn: {
    padding: "3px 12px",
    fontSize: "16px",
    fontFamily: MAC.font,
    background: MAC.bg,
    border: `2px outset ${MAC.bgLight}`,
    borderRadius: "0px",
    boxShadow: "none",
    cursor: "pointer",
    color: "#000000",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  btnActive: {
    padding: "3px 12px",
    fontSize: "16px",
    fontFamily: MAC.font,
    background: "#000000",
    border: `2px inset ${MAC.bgDark}`,
    borderRadius: "0px",
    boxShadow: "none",
    cursor: "pointer",
    color: "#FFFFFF",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  btnPrimary: {
    padding: "3px 16px",
    fontSize: "16px",
    fontFamily: MAC.font,
    background: MAC.bg,
    border: `2px outset ${MAC.bgLight}`,
    borderRadius: "0px",
    boxShadow: "none",
    cursor: "pointer",
    color: "#000000",
    fontWeight: "bold" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  // ─── Sticker Sidebar ──────────────────
  sidebar: {
    background: MAC.bg,
    border: `2px solid ${MAC.borderDark}`,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
  },
  sidebarDesktop: {
    width: "220px",
    height: "100%",
    boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
    borderTop: "2px solid #000000",
  },
  sidebarMobile: {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "50vh",
    zIndex: 40,
    borderTop: `2px solid ${MAC.borderDark}`,
  },
  paletteTitleBar: {
    display: "flex",
    alignItems: "center",
    height: "22px",
    padding: "0 8px",
    background: MAC.pinstripes,
    borderBottom: `2px solid ${MAC.borderDark}`,
    fontSize: "16px",
    fontWeight: "bold" as const,
    fontFamily: MAC.font,
    color: "#000000",
    userSelect: "none" as const,
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
    gap: "6px",
  },
  stickerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "3px",
  },
  stickerGridDesktop: {
    gridTemplateColumns: "repeat(2, 1fr)",
  },
  stickerBtn: {
    display: "flex",
    aspectRatio: "1",
    alignItems: "center",
    justifyContent: "center",
    border: `1px solid ${MAC.border}`,
    background: "#FFFFFF",
    padding: "3px",
    cursor: "grab",
    borderRadius: "0px",
  },
  // ─── Canvas Area ──────────────────
  canvasArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    minHeight: 0,
    position: "relative" as const,
    border: `2px solid ${MAC.borderDark}`,
    background: MAC.bg,
    boxShadow: "2px 2px 0px rgba(0,0,0,0.5)",
  },
  mainPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  },
  canvasSunken: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    margin: "4px",
    background: "#FFFFFF",
    borderRadius: "0px",
    boxShadow: MAC.inset,
    border: `2px inset ${MAC.bgLight}`,
  },
  // ─── Toolbar ──────────────────
  toolbar: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "5px",
    padding: "8px 12px",
    background: "#a8c9e3",
    border: `1px solid ${MAC.borderDark}`,
    boxShadow: "2px 2px 0px rgba(0,0,0,0.35)",
    flexShrink: 0,
  },
  toolbarDivider: {
    width: "1px",
    height: "20px",
    background: MAC.border,
    margin: "0 4px",
  },
  colorSwatch: {
    width: "18px",
    height: "18px",
    border: "1px solid #808080",
    cursor: "pointer",
    padding: 0,
  },
  colorSwatchActive: {
    width: "18px",
    height: "18px",
    border: "2px solid #000000",
    cursor: "pointer",
    padding: 0,
  },
  colorPalette: {
    display: "flex",
    alignItems: "center",
    gap: "0px",
    border: `2px inset ${MAC.bgLight}`,
    padding: "2px",
    background: "#FFFFFF",
    borderRadius: "0px",
  },
  // ─── Share Popup ──────────────────
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.4)",
    padding: "16px",
  },
  dialog: {
    background: MAC.bg,
    border: `2px solid ${MAC.borderDark}`,
    borderRadius: "0px",
    boxShadow: "3px 3px 0px rgba(0,0,0,0.5)",
    width: "100%",
    maxWidth: "420px",
    overflow: "hidden",
  },
  dialogBody: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "14px",
    padding: "24px 20px",
  },
  input: {
    flex: 1,
    padding: "4px 6px",
    fontSize: "16px",
    fontFamily: MAC.font,
    background: "#FFFFFF",
    border: `2px inset ${MAC.bgLight}`,
    borderRadius: "0px",
    boxShadow: "none",
    outline: "none",
    color: "#000000",
  },
  // ─── Zoom Badge ──────────────────
  zoomBadge: {
    position: "absolute" as const,
    right: "12px",
    top: "32px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 8px",
    background: MAC.bg,
    border: `2px solid ${MAC.borderDark}`,
    borderRadius: "0px",
    boxShadow: "2px 2px 0px rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  // ─── Resize Handle ──────────────────
  resizeHandle: {
    position: "absolute" as const,
    bottom: "2px",
    right: "2px",
    width: "14px",
    height: "14px",
    background: `linear-gradient(135deg, transparent 30%, ${MAC.border} 30%, ${MAC.border} 40%, transparent 40%, transparent 55%, ${MAC.border} 55%, ${MAC.border} 65%, transparent 65%, transparent 80%, ${MAC.border} 80%, ${MAC.border} 90%, transparent 90%)`,
    cursor: "nwse-resize",
    zIndex: 5,
  },
};

export default function CanvasEditor({
  bombId,
  creatorName,
  initialCanvasJson,
  isCollaborative = false,
  backgroundCanvasJson,
  backgroundLayers,
  creatorBeatData,
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedCountRef = useRef(0);

  const [activeTool, setActiveTool] = useState<ToolType>("pointer");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(4);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stickers, setStickers] = useState<StickerCategory[]>(stickerCategories);
  const [objectCount, setObjectCount] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "beats">("canvas");
  const [beatData, setBeatData] = useState<BeatPattern>(createDefaultPattern());
  const beatRef = useRef<BeatSequencerHandle>(null);
  const creatorBeatRef = useRef<BeatSequencerHandle>(null);
  const [, forceUpdate] = useState(0); // force re-render when beat state changes
  const hasCreatorBeat = !!(creatorBeatData && creatorBeatData.tracks.some((t) => t.pattern.some(Boolean)));
  const animationFrameRef = useRef<number | null>(null);

  const stopAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const syncAnimationLoop = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) {
      stopAnimationLoop();
      return;
    }

    const hasAnimated = canvas.getObjects().some((obj) => objectHasAnimation(obj));

    if (hasAnimated && animationFrameRef.current === null) {
      const tick = () => {
        if (!fabricRef.current) {
          stopAnimationLoop();
          return;
        }
        // Mark all animated objects as dirty so Fabric re-draws them
        fabricRef.current.getObjects().forEach((obj) => {
          if (objectHasAnimation(obj)) {
            obj.dirty = true;
          }
        });
        fabricRef.current.requestRenderAll();
        animationFrameRef.current = requestAnimationFrame(tick);
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    if (!hasAnimated) {
      stopAnimationLoop();
    }
  }, [stopAnimationLoop]);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const loadStickers = async () => {
      try {
        const response = await fetch("/api/stickers");
        if (!response.ok) return;
        const payload = (await response.json()) as { categories?: StickerCategory[] };
        if (payload.categories && payload.categories.length > 0) {
          setStickers(payload.categories);
        }
      } catch {
        // keep fallback library if API fails
      }
    };

    loadStickers();
  }, []);

  const updateObjectCount = useCallback(() => {
    if (fabricRef.current) {
      const total = fabricRef.current.getObjects().length;
      setObjectCount(total - lockedCountRef.current);
    }
  }, []);

  const lockObject = (obj: fabric.FabricObject) => {
    obj.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      lockScalingX: true,
      lockScalingY: true,
      opacity: 0.7,
    });
    (obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY] = true;
  };

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      backgroundColor: "#ffffff",
      isDrawingMode: false,
    });

    fabricRef.current = canvas;

    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = brushColor;
    canvas.freeDrawingBrush.width = brushSize;

    canvas.on("object:added", () => {
      updateObjectCount();
      setHistory((prev) => [...prev, JSON.stringify(canvas.toJSON())]);
      syncAnimationLoop();
    });
    canvas.on("object:removed", () => {
      updateObjectCount();
      syncAnimationLoop();
    });

    const initCanvas = async () => {
      if (isCollaborative && backgroundCanvasJson) {
        const bgData = backgroundCanvasJson as { objects?: object[] };
        if (bgData.objects && Array.isArray(bgData.objects)) {
          try {
            const objects = await fabric.util.enlivenObjects(bgData.objects);
            for (const obj of objects) {
              lockObject(obj as fabric.FabricObject);
              canvas.add(obj as fabric.FabricObject);
            }
          } catch {
            // skip if loading fails
          }
        }

        if (backgroundLayers && backgroundLayers.length > 0) {
          for (const layerJson of backgroundLayers) {
            const layerData = layerJson as { objects?: object[] };
            if (layerData.objects && Array.isArray(layerData.objects)) {
              try {
                const objects = await fabric.util.enlivenObjects(layerData.objects);
                for (const obj of objects) {
                  lockObject(obj as fabric.FabricObject);
                  canvas.add(obj as fabric.FabricObject);
                }
              } catch {
                // skip
              }
            }
          }
        }

        lockedCountRef.current = canvas.getObjects().length;
        canvas.renderAll();
      }

      if (!isCollaborative && initialCanvasJson && Object.keys(initialCanvasJson).length > 0) {
        await canvas.loadFromJSON(initialCanvasJson);
        canvas.renderAll();
        updateObjectCount();
      }

      for (const obj of canvas.getObjects()) {
        if (objectHasAnimation(obj)) {
          obj.set({
            objectCaching: false,
            statefullCache: false,
            noScaleCache: true,
            dirty: true,
          });
        }
      }

      syncAnimationLoop();
    };

    initCanvas();

    // Zoom with scroll wheel / trackpad pinch
    const handleWheel = (opt: fabric.TEvent<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      let zoom = canvas.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.min(Math.max(zoom, 0.3), 5);

      const point = new fabric.Point(e.offsetX, e.offsetY);
      canvas.zoomToPoint(point, zoom);
      setZoomLevel(zoom);
    };
    canvas.on("mouse:wheel", handleWheel);

    // Touch pinch-to-zoom support
    let lastTouchDist = 0;
    let lastTouchCenter = { x: 0, y: 0 };

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

    const getTouchCenter = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    });

    const canvasEl = canvasRef.current!;
    const upperEl = canvasEl.parentElement?.querySelector(".upper-canvas") as HTMLElement | null;
    const targetEl = upperEl || canvasEl;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastTouchDist = getTouchDist(e.touches[0], e.touches[1]);
        lastTouchCenter = getTouchCenter(e.touches[0], e.touches[1]);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const newDist = getTouchDist(e.touches[0], e.touches[1]);
        const center = getTouchCenter(e.touches[0], e.touches[1]);

        if (lastTouchDist > 0) {
          const scaleFactor = newDist / lastTouchDist;
          let zoom = canvas.getZoom() * scaleFactor;
          zoom = Math.min(Math.max(zoom, 0.3), 5);

          const rect = targetEl.getBoundingClientRect();
          const point = new fabric.Point(
            center.x - rect.left,
            center.y - rect.top
          );
          canvas.zoomToPoint(point, zoom);
          setZoomLevel(zoom);
        }

        lastTouchDist = newDist;
        lastTouchCenter = center;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastTouchDist = 0;
      }
    };

    targetEl.addEventListener("touchstart", handleTouchStart, { passive: false });
    targetEl.addEventListener("touchmove", handleTouchMove, { passive: false });
    targetEl.addEventListener("touchend", handleTouchEnd);

    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const newScale = Math.min(containerWidth / CANVAS_SIZE, 1);
      setScale(newScale);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      targetEl.removeEventListener("touchstart", handleTouchStart);
      targetEl.removeEventListener("touchmove", handleTouchMove);
      targetEl.removeEventListener("touchend", handleTouchEnd);
      stopAnimationLoop();
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fabricRef.current?.freeDrawingBrush) return;
    fabricRef.current.freeDrawingBrush.color = activeTool === "eraser" ? "#FFFFFF" : brushColor;
    fabricRef.current.freeDrawingBrush.width = brushSize;
  }, [activeTool, brushColor, brushSize]);

  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.isDrawingMode = activeTool === "pencil" || activeTool === "eraser";
    if (activeTool === "pointer") {
      fabricRef.current.selection = true;
    }
  }, [activeTool]);

  const addStickerAtPosition = async (src: string, canvasX?: number, canvasY?: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const userObjects = canvas.getObjects().length - lockedCountRef.current;
    if (userObjects >= MAX_OBJECTS) {
      alert("Canvas is full! Remove some items first.");
      return;
    }

    try {
      const isAnimated = isGifSource(src);
      const targetSize = 150;
      const left = canvasX !== undefined ? canvasX - (targetSize / 2) : CANVAS_SIZE / 2 - (targetSize / 2);
      const top = canvasY !== undefined ? canvasY - (targetSize / 2) : CANVAS_SIZE / 2 - (targetSize / 2);

      if (isAnimated) {
        // For GIF stickers: fetch blob, decode frames with ImageDecoder
        const response = await fetch(src);
        const blob = await response.blob();
        const { fabricImg, width: w, height: h } = await createGifFabricImage(blob);
        const scaleX = targetSize / w;
        const scaleY = targetSize / h;
        const s = Math.min(scaleX, scaleY);
        fabricImg.set({ scaleX: s, scaleY: s, left, top });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
      } else {
        const img = await fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" });
        const scaleX = targetSize / (img.width || 150);
        const scaleY = targetSize / (img.height || 150);
        const s = Math.min(scaleX, scaleY);
        img.set({ scaleX: s, scaleY: s, left, top });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
      }
      setActiveTool("pointer");
      setSidebarOpen(false);
    } catch {
      alert("Could not load sticker. Please try another one.");
    }
  };

  const addSticker = (src: string) => addStickerAtPosition(src);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCanvas(false);

    const stickerSrc = e.dataTransfer.getData("sticker-src");
    if (!stickerSrc || !fabricRef.current || !canvasRef.current) return;

    const canvasEl = canvasRef.current;
    const rect = canvasEl.getBoundingClientRect();
    const zoom = fabricRef.current.getZoom();
    const vpt = fabricRef.current.viewportTransform;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const canvasX = (screenX / (rect.width / CANVAS_SIZE) - (vpt ? vpt[4] : 0)) / zoom;
    const canvasY = (screenY / (rect.height / CANVAS_SIZE) - (vpt ? vpt[5] : 0)) / zoom;

    addStickerAtPosition(stickerSrc, canvasX, canvasY);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCanvas(true);
  };

  const handleDragLeave = () => {
    setDragOverCanvas(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isGif = file.type === "image/gif";
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      alert(isVideo ? "Video is too large! Max size is 1GB." : "Image is too large! Max size is 5MB.");
      return;
    }

    const canvas = fabricRef.current;
    if (!canvas) return;

    const userObjects = canvas.getObjects().length - lockedCountRef.current;
    if (userObjects >= MAX_OBJECTS) {
      alert("Canvas is full! Remove some items first.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);

    try {
      if (isVideo) {
        // Videos: load <video>, use proxy canvas that copies each frame
        const video = document.createElement("video");
        video.src = objectUrl;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.style.position = "fixed";
        video.style.left = "-9999px";
        video.style.visibility = "hidden";
        document.body.appendChild(video);

        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("Could not load video"));
          video.load();
        });

        try { await video.play(); } catch { /* muted autoplay usually works */ }

        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        const fabricImg = createVideoFabricImage(video, w, h);
        const canvasMax = CANVAS_SIZE * 0.4;
        const s = Math.min(canvasMax / w, canvasMax / h, 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: CANVAS_SIZE / 2 - (w * s) / 2,
          top: CANVAS_SIZE / 2 - (h * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } else if (isGif) {
        // GIFs: use ImageDecoder API to manually decode each frame
        const { fabricImg, width: w, height: h } = await createGifFabricImage(file);
        const canvasMax = CANVAS_SIZE * 0.4;
        const s = Math.min(canvasMax / w, canvasMax / h, 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: CANVAS_SIZE / 2 - (w * s) / 2,
          top: CANVAS_SIZE / 2 - (h * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } else {
        // Regular static images: use data URL
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string;
          try {
            const fabricImg = await fabric.FabricImage.fromURL(dataUrl);
            const canvasMax = CANVAS_SIZE * 0.4;
            const s = Math.min(canvasMax / (fabricImg.width || canvasMax), canvasMax / (fabricImg.height || canvasMax), 1);
            fabricImg.set({
              scaleX: s, scaleY: s,
              left: CANVAS_SIZE / 2 - ((fabricImg.width || 0) * s) / 2,
              top: CANVAS_SIZE / 2 - ((fabricImg.height || 0) * s) / 2,
            });
            canvas.add(fabricImg);
            canvas.setActiveObject(fabricImg);
            canvas.renderAll();
            setActiveTool("pointer");
          } catch {
            alert("Could not load image. Please try another one.");
          }
        };
        reader.readAsDataURL(file);
      }
    } catch {
      alert("Could not load file. Please try another one.");
    }
    e.target.value = "";
  };

  const deleteSelected = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    if (active.length === 0) return;
    const deletable = active.filter(
      (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
    );
    deletable.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
  };

  const handleUndo = () => {
    const canvas = fabricRef.current;
    if (!canvas || history.length === 0) return;

    const newHistory = [...history];
    newHistory.pop();

    if (newHistory.length === 0) {
      const allObjects = canvas.getObjects();
      const userObjects = allObjects.filter(
        (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
      );
      userObjects.forEach((obj) => canvas.remove(obj));
      canvas.renderAll();
    } else {
      const prevState = newHistory[newHistory.length - 1];
      canvas.loadFromJSON(JSON.parse(prevState)).then(() => {
        canvas.renderAll();
      });
    }
    setHistory(newHistory);
    updateObjectCount();
  };

  const clearCanvas = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const allObjects = canvas.getObjects();
    const userObjects = allObjects.filter(
      (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
    );
    if (userObjects.length === 0) return;
    const ok = window.confirm("Clean page? This removes all objects and drawings.");
    if (!ok) return;
    userObjects.forEach((obj) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    updateObjectCount();
  };

  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const userObjects = canvas.getObjects().filter(
      (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
    );

    if (isCollaborative && userObjects.length === 0) {
      alert("Add something to the canvas first!");
      return;
    }
    if (!isCollaborative && canvas.getObjects().length === 0) {
      alert("Add something to the canvas first!");
      return;
    }

    setSaving(true);
    try {
      let canvasJson;

      if (isCollaborative) {
        const fullJson = canvas.toJSON() as { objects: object[]; version: string };
        const userObjectsJson = {
          ...fullJson,
          objects: fullJson.objects.slice(lockedCountRef.current),
        };
        canvasJson = userObjectsJson;
      } else {
        canvasJson = canvas.toJSON();
      }

      const thumbnailDataUrl = canvas.toDataURL({
        format: "png",
        quality: 0.8,
        multiplier: 0.5,
      });

      const endpoint = isCollaborative
        ? `/api/bombs/${bombId}/layer`
        : `/api/bombs/${bombId}`;

      const body = isCollaborative
        ? {
            contributor_name: creatorName,
            canvas_json: canvasJson,
          }
        : {
            canvas_json: canvasJson,
            thumbnail_data: thumbnailDataUrl,
            beat_data: beatData.tracks.some((t) => t.pattern.some(Boolean)) ? beatData : null,
          };

      const res = await fetch(endpoint, {
        method: isCollaborative ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Save failed");

      const origin = window.location.origin;
      const link = `${origin}/bomb/${bombId}`;
      setShareLink(link);
      setShowSharePopup(true);
    } catch {
      alert("Failed to save. Please try again!");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      alert("Link copied!");
    } catch {
      const input = document.createElement("input");
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      alert("Link copied!");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "You received a Lovebomb!",
          text: `${creatorName} made a lovebomb for you!`,
          url: shareLink,
        });
      } catch {
        // User cancelled share
      }
    } else {
      copyLink();
    }
  };

  const colors = [
    "#000000", "#404040", "#808080", "#C0C0C0", "#FFFFFF",
    "#800000", "#FF0000", "#008000", "#00FF00", "#000080",
    "#0000FF", "#800080", "#FF00FF",
  ];

  // Estimate "disk" size from object count
  const diskMB = Math.max(1, Math.round(objectCount * 0.3 + 0.5));

  return (
    <div
      style={{
        ...styles.root,
        ...(isDesktop ? styles.rootDesktop : {}),
      }}
    >
      {/* ─── Mobile Sticker Toggle ─── */}
      {!isDesktop && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            ...styles.btn,
            position: "fixed",
            bottom: "56px",
            left: "12px",
            zIndex: 50,
            fontSize: "16px",
            padding: "4px 10px",
          }}
        >
          {sidebarOpen ? "X Close" : "Stickers"}
        </button>
      )}

      {/* ─── Sticker Sidebar (Mac Palette Window) ─── */}
      <div
        style={{
          ...styles.sidebar,
          ...(isDesktop
            ? styles.sidebarDesktop
            : {
                ...styles.sidebarMobile,
                transform: sidebarOpen ? "translateY(0)" : "translateY(100%)",
              }),
        }}
      >
        {/* Palette title bar with pinstripes */}
        <div style={styles.paletteTitleBar}>
          <div style={{ width: "10px", height: "10px", border: "1px solid #000", background: "#FFD8F6" }} />
          <span>Stickers</span>
        </div>
        <div style={{ padding: "8px" }}>
          {/* Upload button — aqua pill style */}
          <label
            className="aqua-cta"
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "8px",
              textAlign: "center" as const,
              fontSize: "14px",
              boxSizing: "border-box" as const,
              padding: "4px 16px",
            }}
          >
            Upload Media
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
          </label>

          {/* Sticker categories */}
          {stickers.map((category) => (
            <div key={category.name} style={{ marginBottom: "10px" }}>
              <h3
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: "#000000",
                  fontFamily: MAC.font,
                }}
              >
                {category.name}
              </h3>
              <div
                style={{
                  ...styles.stickerGrid,
                  ...(isDesktop ? styles.stickerGridDesktop : {}),
                }}
              >
                {category.stickers.map((sticker) => (
                  <button
                    key={sticker.name}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("sticker-src", sticker.src);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addSticker(sticker.src)}
                    style={styles.stickerBtn}
                    title={sticker.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sticker.src}
                      alt={sticker.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        pointerEvents: "none",
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.mainPanel}>
        {/* ─── Main Canvas Area (Mac Finder Window) ─── */}
        <div style={styles.canvasArea}>
        {/* Pinstriped window title bar */}
        <div style={styles.titleBar}>
          <div style={styles.closeBox} />
          <span style={styles.titleText}>
            Lovebombing, INC.
          </span>
          <span style={styles.titleCounter}>
            {objectCount}/{MAX_OBJECTS}
          </span>
        </div>

        {/* ─── Tab Bar ─── */}
        <div
          style={{
            display: "flex",
            background: MAC.bg,
            borderBottom: "1px solid #808080",
            padding: "0",
          }}
        >
          <button
            onClick={() => setActiveTab("canvas")}
            style={{
              flex: 1,
              padding: "4px 0",
              fontFamily: MAC.font,
              fontSize: "14px",
              border: "none",
              borderRight: "1px solid #808080",
              background: activeTab === "canvas" ? "#FFFFFF" : MAC.bg,
              fontWeight: activeTab === "canvas" ? "bold" : "normal",
              cursor: "pointer",
              borderRadius: 0,
              color: "#000",
            }}
          >
            Canvas
          </button>
          <button
            onClick={() => setActiveTab("beats")}
            style={{
              flex: 1,
              padding: "4px 0",
              fontFamily: MAC.font,
              fontSize: "14px",
              border: "none",
              background: activeTab === "beats" ? "#FFFFFF" : MAC.bg,
              fontWeight: activeTab === "beats" ? "bold" : "normal",
              cursor: "pointer",
              borderRadius: 0,
              color: "#000",
            }}
          >
            Beat Maker
          </button>
        </div>

        {/* Canvas area — sunken inset panel */}
        {activeTab === "canvas" ? (
        <>
        <div
          ref={containerRef}
          style={{
            ...styles.canvasSunken,
            ...(dragOverCanvas ? { background: "#E0E0E0" } : {}),
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center center",
              border: "1px solid #000000",
              boxShadow: "2px 2px 4px rgba(0,0,0,0.2)",
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Zoom indicator badge */}
        {zoomLevel !== 1 && (
          <div style={styles.zoomBadge}>
            <span style={{ fontSize: "14px", color: "#000", fontFamily: MAC.font }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => {
                fabricRef.current?.setZoom(1);
                fabricRef.current?.setViewportTransform([1, 0, 0, 1, 0, 0]);
                setZoomLevel(1);
              }}
              style={{ ...styles.btn, padding: "1px 8px", fontSize: "14px" }}
            >
              Reset
            </button>
          </div>
        )}

        {/* Resize handle */}
        <div style={styles.resizeHandle} />

        {/* ─── Status Bar ─── */}
        <div style={styles.statusBar}>
          <span>{objectCount} items</span>
          <span>{diskMB} MB in disk</span>
          <span>888 MB available</span>
        </div>
        </>
        ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "500px", height: "100%" }}>
          {/* Creator's beat (read-only) — shown when in collaborative mode */}
          {isCollaborative && hasCreatorBeat && creatorBeatData && (
            <div style={{ borderBottom: "2px solid #808080" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  background: "#f0d8ec",
                  borderBottom: "1px solid #ccc",
                }}
              >
                <button
                  onClick={() => { creatorBeatRef.current?.play(); forceUpdate((n) => n + 1); }}
                  style={{
                    width: 28,
                    height: 28,
                    border: "2px outset #DFDFDF",
                    background: creatorBeatRef.current?.isPlaying ? "#FF6B9D" : "#FFD8F6",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontFamily: "'VT323', monospace",
                    borderRadius: 0,
                  }}
                >
                  {creatorBeatRef.current?.isPlaying ? "■" : "▶"}
                </button>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: "14px", color: "#000066", fontWeight: "bold" }}>
                  Creator&apos;s Beat
                </span>
                <span style={{ fontFamily: "'VT323', monospace", fontSize: "12px", color: "#808080" }}>
                  (read-only)
                </span>
              </div>
              <div style={{ maxHeight: "200px", overflow: "auto" }}>
                <BeatSequencer
                  ref={creatorBeatRef}
                  pattern={creatorBeatData}
                  onChange={() => {}}
                  readOnly
                  hideTransport
                />
              </div>
            </div>
          )}

          {/* User's own beat (editable) */}
          {isCollaborative && hasCreatorBeat && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                background: "#d8ecf0",
                borderBottom: "1px solid #ccc",
              }}
            >
              <span style={{ fontFamily: "'VT323', monospace", fontSize: "14px", color: "#000066", fontWeight: "bold" }}>
                Your Beat
              </span>
              <span style={{ fontFamily: "'VT323', monospace", fontSize: "12px", color: "#808080" }}>
                (tap cells to add notes)
              </span>
            </div>
          )}
          <div style={{ flex: 1, display: "flex" }}>
            <BeatSequencer
              ref={beatRef}
              pattern={beatData}
              onChange={(p) => { setBeatData(p); forceUpdate((n) => n + 1); }}
              hideTransport
            />
          </div>
        </div>
        )}
        </div>

        {/* ─── Bottom Toolbar ─── */}
        <div style={styles.toolbar}>
          {activeTab === "canvas" ? (
            <>
              {/* Pointer tool */}
              <button
                onClick={() => setActiveTool("pointer")}
                style={activeTool === "pointer" ? styles.btnActive : styles.btn}
              >
                Select
              </button>

              {/* Pencil tool */}
              <button
                onClick={() => setActiveTool("pencil")}
                style={activeTool === "pencil" ? styles.btnActive : styles.btn}
              >
                Draw
              </button>

              {/* Eraser tool */}
              <button
                onClick={() => setActiveTool("eraser")}
                style={activeTool === "eraser" ? styles.btnActive : styles.btn}
              >
                Eraser
              </button>

              {/* Color palette */}
              {activeTool === "pencil" && (
                <div style={styles.colorPalette}>
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setBrushColor(color)}
                      style={{
                        ...(brushColor === color
                          ? styles.colorSwatchActive
                          : styles.colorSwatch),
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Brush size slider */}
              {(activeTool === "pencil" || activeTool === "eraser") && (
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: "60px", cursor: "pointer" }}
                />
              )}

              {/* Divider */}
              <div style={styles.toolbarDivider} />

              {/* Delete */}
              <button onClick={deleteSelected} style={styles.btn}>
                Delete
              </button>

              {/* Undo */}
              <button onClick={handleUndo} style={styles.btn}>
                Undo
              </button>

              {/* Clean page */}
              <button onClick={clearCanvas} style={styles.btn}>
                Clean Page
              </button>
            </>
          ) : (
            <>
              {/* ─── Beat Maker Controls ─── */}
              {/* Play/Stop */}
              <button
                onClick={() => { beatRef.current?.play(); forceUpdate((n) => n + 1); }}
                style={{
                  ...styles.btn,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px",
                  background: beatRef.current?.isPlaying ? "#FF6B9D" : "#FFD8F6",
                  color: "#000",
                }}
              >
                {beatRef.current?.isPlaying ? "■" : "▶"}
              </button>

              {/* BPM */}
              <span style={{ fontFamily: "'VT323', Geneva, monospace", fontSize: "14px", color: "#000" }}>BPM:</span>
              <input
                type="range"
                min={60}
                max={200}
                value={beatData.bpm}
                onChange={(e) => { beatRef.current?.setBpm(Number(e.target.value)); }}
                style={{ width: "60px", cursor: "pointer" }}
              />
              <span style={{ fontFamily: "'VT323', Geneva, monospace", fontSize: "14px", color: "#000", minWidth: "26px" }}>
                {beatData.bpm}
              </span>

              <div style={styles.toolbarDivider} />

              {/* Drums / Melody tabs */}
              <button
                onClick={() => { beatRef.current?.setActiveSection("drums"); forceUpdate((n) => n + 1); }}
                style={{
                  ...styles.btn,
                  background: beatRef.current?.activeSection === "drums" ? "#FFF" : "#FFD8F6",
                  fontWeight: beatRef.current?.activeSection === "drums" ? "bold" : "normal",
                }}
              >
                Drums
              </button>
              <button
                onClick={() => { beatRef.current?.setActiveSection("melody"); forceUpdate((n) => n + 1); }}
                style={{
                  ...styles.btn,
                  background: beatRef.current?.activeSection === "melody" ? "#FFF" : "#E8A0FF",
                  fontWeight: beatRef.current?.activeSection === "melody" ? "bold" : "normal",
                }}
              >
                Melody
              </button>

              <div style={styles.toolbarDivider} />

              {/* Clear */}
              <button
                onClick={() => beatRef.current?.clear()}
                style={styles.btn}
              >
                Clear
              </button>

              {/* Record */}
              <button
                onClick={() => { beatRef.current?.record(); forceUpdate((n) => n + 1); }}
                style={{
                  ...styles.btn,
                  background: beatRef.current?.isRecording ? "#FF4444" : "#FF8C42",
                  color: "#FFF",
                  cursor: beatRef.current?.isRecording ? "default" : "pointer",
                }}
                disabled={beatRef.current?.isRecording}
              >
                {beatRef.current?.isRecording
                  ? (beatRef.current?.recordingCountdown ?? 0) > 0
                    ? `${beatRef.current?.recordingCountdown}...`
                    : "REC"
                  : "Record"}
              </button>

              {/* Mix Both — collaborative mode only */}
              {isCollaborative && hasCreatorBeat && (
                <>
                  <div style={styles.toolbarDivider} />
                  <button
                    onClick={() => {
                      // Play both beats simultaneously
                      const creatorPlaying = creatorBeatRef.current?.isPlaying;
                      const myPlaying = beatRef.current?.isPlaying;
                      if (creatorPlaying || myPlaying) {
                        // Stop both
                        if (creatorPlaying) creatorBeatRef.current?.play();
                        if (myPlaying) beatRef.current?.play();
                      } else {
                        // Start both at the same time
                        creatorBeatRef.current?.play();
                        beatRef.current?.play();
                      }
                      forceUpdate((n) => n + 1);
                    }}
                    style={{
                      ...styles.btn,
                      background: (creatorBeatRef.current?.isPlaying && beatRef.current?.isPlaying)
                        ? "#FF6B9D" : "#E8A0FF",
                      fontWeight: "bold",
                    }}
                  >
                    {(creatorBeatRef.current?.isPlaying && beatRef.current?.isPlaying) ? "Stop Mix" : "Mix Both"}
                  </button>
                </>
              )}
            </>
          )}

          {/* Divider */}
          <div style={styles.toolbarDivider} />

          {/* Save / Send — always visible */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="aqua-cta"
            style={{ padding: "3px 16px", fontSize: "14px" }}
          >
            {saving
              ? "Saving..."
              : isCollaborative
              ? "Save & Share"
              : "Send Lovebomb"}
          </button>
        </div>
      </div>

      {/* ─── Share Popup (Mac Alert Dialog) ─── */}
      {showSharePopup && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            {/* Dialog title bar */}
            <div style={styles.titleBar}>
              <div
                style={styles.closeBox}
                onClick={() => setShowSharePopup(false)}
              />
              <span style={styles.titleText}>Lovebomb Sent</span>
              <span />
            </div>

            {/* Dialog body */}
            <div style={styles.dialogBody}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "#1a1a6e",
                  fontFamily: "Georgia, serif",
                }}
              >
                Lovebomb saved!
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "16px",
                  color: "#000000",
                  fontFamily: MAC.font,
                }}
              >
                Share this link with someone special:
              </p>
              <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "6px" }}>
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  style={{ ...styles.input, fontSize: "14px" }}
                />
                <button onClick={copyLink} className="aqua-cta" style={{ padding: "4px 16px", fontSize: "14px" }}>
                  Copy
                </button>
              </div>
              <div style={{ display: "flex", width: "100%", gap: "8px" }}>
                <button
                  onClick={handleShare}
                  className="aqua-cta"
                  style={{ flex: 1, padding: "6px 16px" }}
                >
                  Share
                </button>
                <button
                  onClick={() => setShowSharePopup(false)}
                  className="aqua-cta"
                  style={{ flex: 1, padding: "6px 16px" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
