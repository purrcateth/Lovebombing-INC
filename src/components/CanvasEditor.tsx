"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { stickerCategories } from "@/lib/stickers";
import type { StickerCategory, BeatPattern, CanvasSize } from "@/lib/types";
import { CANVAS_SIZES } from "@/lib/types";
import BeatSequencer, { BeatSequencerHandle } from "@/components/BeatSequencer";
import { createDefaultPattern } from "@/lib/audioEngine";
import { parseGif } from "@/lib/gifParser";
import CanvasSizeDialog from "@/components/CanvasSizeDialog";
import { TimelapseRecorder } from "@/lib/timelapseRecorder";
import { exportTimelapseWithAudio, exportCanvasWithBeat, downloadBlob } from "@/lib/timelapseExport";

interface ContributorBeatInfo {
  name: string;
  beatData: BeatPattern;
}

interface CanvasEditorProps {
  bombId: string;
  creatorName: string;
  initialCanvasJson?: object | null;
  isCollaborative?: boolean;
  backgroundCanvasJson?: object | null;
  backgroundLayers?: object[];
  creatorBeatData?: BeatPattern | null;
  originalCreatorName?: string;
  allPreviousBeats?: ContributorBeatInfo[];
  canvasSize?: import("@/lib/types").CanvasSize;
}

type ToolType = "pointer" | "pencil" | "eraser";

const MAX_OBJECTS = 100;
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB upload cap (auto-downscaled below)
const AUTO_DOWNSCALE_THRESHOLD = 4 * 1024 * 1024; // images larger than this are downscaled before adding to canvas
const AUTO_DOWNSCALE_MAX_EDGE = 2400; // long-edge target for downscaled images
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB for videos

// Custom property to mark locked background objects
const LOCKED_KEY = "_isLockedBackground";
const ANIMATED_KEY = "_isAnimatedSticker";

const isGifSource = (src?: string) => Boolean(src && /(^data:image\/gif|\.gif($|\?))/i.test(src));

/**
 * Downscale an image File so its long edge is at most `maxEdge` pixels.
 * Returns a JPEG File (or PNG if the original had transparency hints in the type).
 * Used to keep canvas_json payloads small when users upload high-res photos.
 */
async function downscaleImageFile(file: File, maxEdge: number): Promise<File | null> {
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = blobUrl;
    });
    const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longEdge <= maxEdge) return null; // no need to downscale
    const scale = maxEdge / longEdge;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outType, 0.88));
    if (!blob) return null;
    return new File([blob], file.name.replace(/\.[^.]+$/, outType === "image/png" ? ".png" : ".jpg"), { type: outType });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

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
      "#87ceeb url('/backgrounds/lovebombing_cloudsbg.jpg') center center / cover no-repeat",
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
    fontWeight: "normal" as const,
    color: "#000000",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    fontFamily: "'ChiKareGo2', 'VT323', 'Geneva', monospace",
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
    fontWeight: "normal" as const,
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
    fontWeight: "normal" as const,
    fontFamily: "'ChiKareGo2', 'VT323', 'Geneva', monospace",
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
    background: "#FFD8F6", // pink so the white canvas stands out as a distinct frame
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
  originalCreatorName,
  allPreviousBeats,
  canvasSize: initialCanvasSize = "square",
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedCountRef = useRef(0);
  const timelapseRef = useRef<TimelapseRecorder | null>(null);
  // The most recent timelapse Blob — captured when user clicks Save & Share or Save
  const lastTimelapseBlobRef = useRef<Blob | null>(null);

  const [activeCanvasSize, setActiveCanvasSize] = useState<CanvasSize>(initialCanvasSize);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const canvasDims = CANVAS_SIZES[activeCanvasSize];
  const canvasWidth = canvasDims.width;
  const canvasHeight = canvasDims.height;

  const [activeTool, setActiveTool] = useState<ToolType>("pointer");
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(4);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [showSaveFormatPopup, setShowSaveFormatPopup] = useState(false);
  const [exportingTimelapse, setExportingTimelapse] = useState(false);
  const [timelapseProgress, setTimelapseProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stickers, setStickers] = useState<StickerCategory[]>(stickerCategories);
  const [objectCount, setObjectCount] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [processingUpload, setProcessingUpload] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [showBgRemovalPopup, setShowBgRemovalPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<"canvas" | "beats">("canvas");
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [userLayers, setUserLayers] = useState<fabric.FabricObject[]>([]);
  const [layerThumbs, setLayerThumbs] = useState<Map<fabric.FabricObject, string>>(new Map());
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [beatData, setBeatData] = useState<BeatPattern>(createDefaultPattern());
  const beatRef = useRef<BeatSequencerHandle>(null);
  const prevBeatRefs = useRef<(BeatSequencerHandle | null)[]>([]);
  const [, forceUpdate] = useState(0); // force re-render when beat state changes

  // Build list of all previous contributor beats
  const previousBeats: ContributorBeatInfo[] = (() => {
    if (allPreviousBeats && allPreviousBeats.length > 0) return allPreviousBeats;
    // Fallback: use creatorBeatData if allPreviousBeats not provided
    if (creatorBeatData && creatorBeatData.tracks.some((t) => t.pattern.some(Boolean))) {
      return [{ name: originalCreatorName || "Creator", beatData: creatorBeatData }];
    }
    return [];
  })();
  const hasPreviousBeats = previousBeats.length > 0;
  const [openPrevAccordions, setOpenPrevAccordions] = useState<Set<number>>(new Set());
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

  const refreshLayers = useCallback(() => {
    if (fabricRef.current) {
      const objs = fabricRef.current.getObjects().filter(
        (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
      );
      const reversed = [...objs].reverse();
      setUserLayers(reversed);
      // Generate thumbnails
      const thumbs = new Map<fabric.FabricObject, string>();
      for (const obj of reversed) {
        try {
          const url = obj.toDataURL({ format: "png", multiplier: 0.15 });
          thumbs.set(obj, url);
        } catch {
          // skip if toDataURL fails (e.g. tainted canvas)
        }
      }
      setLayerThumbs(thumbs);
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
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#ffffff",
      isDrawingMode: false,
    });

    fabricRef.current = canvas;

    // Start timelapse recording silently. The lower-canvas is what fabric.js renders into.
    if (canvasRef.current) {
      try {
        const lower = canvasRef.current; // visible canvas element
        timelapseRef.current = new TimelapseRecorder(lower, {
          fps: 5,
          // Force the canvas to repaint at the recording fps so MediaRecorder
          // gets frames during user idle (otherwise pauses cause it to drop frames entirely).
          onTick: () => { try { canvas.requestRenderAll(); } catch { /* swallow */ } },
        });
        const ok = timelapseRef.current.start();
        if (!ok) {
          timelapseRef.current = null;
          console.warn("[Timelapse] recording could not start");
        }
      } catch (err) {
        console.warn("[Timelapse] could not start", err);
        timelapseRef.current = null;
      }
    }

    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = brushColor;
    canvas.freeDrawingBrush.width = brushSize;

    // Debounced history snapshot — coalesces rapid events (drag, draw) into one undo entry
    let historyTimer: ReturnType<typeof setTimeout> | null = null;
    const pushHistorySnapshot = () => {
      if (historyTimer) clearTimeout(historyTimer);
      historyTimer = setTimeout(() => {
        try {
          const snap = JSON.stringify(canvas.toJSON());
          setHistory((prev) => {
            // Skip if identical to last snapshot
            if (prev.length > 0 && prev[prev.length - 1] === snap) return prev;
            // Cap history at 50 to keep memory reasonable
            const next = [...prev, snap];
            return next.length > 50 ? next.slice(next.length - 50) : next;
          });
        } catch { /* swallow */ }
      }, 250);
    };

    canvas.on("object:added", () => {
      updateObjectCount();
      refreshLayers();
      pushHistorySnapshot();
      syncAnimationLoop();
    });
    canvas.on("object:removed", () => {
      updateObjectCount();
      refreshLayers();
      pushHistorySnapshot();
      syncAnimationLoop();
    });
    canvas.on("object:modified", () => {
      // Move, scale, rotate, blend mode change, etc.
      pushHistorySnapshot();
    });
    canvas.on("path:created", () => {
      // Pencil drawing finished a stroke
      pushHistorySnapshot();
    });
    canvas.on("text:editing:exited", () => {
      // User finished editing text
      pushHistorySnapshot();
    });
    canvas.on("selection:created", (e) => {
      setSelectedObject((e as { selected?: fabric.FabricObject[] }).selected?.[0] || null);
    });
    canvas.on("selection:updated", (e) => {
      setSelectedObject((e as { selected?: fabric.FabricObject[] }).selected?.[0] || null);
    });
    canvas.on("selection:cleared", () => {
      setSelectedObject(null);
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
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight || cw;
      const newScale = Math.min(cw / canvasWidth, ch / canvasHeight, 1);
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
      // Stop timelapse recording (fire-and-forget)
      timelapseRef.current?.stop().catch(() => {});
      timelapseRef.current = null;
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle canvas size changes mid-session (CapCut-style: keep content, change frame)
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.renderAll();
    // Recompute display scale to fit new dimensions
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight || cw;
      setScale(Math.min(cw / canvasWidth, ch / canvasHeight, 1));
    }
  }, [canvasWidth, canvasHeight]);


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
      // Scale stickers relative to the canvas size, not a fixed pixel count.
      // 150px was hardcoded — fine on a square 1080×1080 (~14%) but tiny on
      // vertical (1080×1920) or landscape (1920×1080) where the larger axis
      // makes the sticker look lost. 22% of the shorter axis gives a comparable
      // visual weight on every canvas shape.
      const targetSize = Math.min(canvasWidth, canvasHeight) * 0.22;
      const left = canvasX !== undefined ? canvasX - (targetSize / 2) : canvasWidth / 2 - (targetSize / 2);
      const top = canvasY !== undefined ? canvasY - (targetSize / 2) : canvasHeight / 2 - (targetSize / 2);

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
    const canvasX = (screenX / (rect.width / canvasWidth) - (vpt ? vpt[4] : 0)) / zoom;
    const canvasY = (screenY / (rect.height / canvasHeight) - (vpt ? vpt[5] : 0)) / zoom;

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
    const original = e.target.files?.[0];
    if (!original) return;

    const isVideo = original.type.startsWith("video/");
    const isGif = original.type === "image/gif";
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (original.size > maxSize) {
      alert(isVideo ? "Video is too large! Max size is 1GB." : "Image is too large! Max size is 25MB.");
      return;
    }

    // For non-GIF images larger than threshold, downscale client-side so the canvas_json
    // payload stays manageable when saved to Supabase. GIFs are passed through (animated frames).
    let file = original;
    if (!isVideo && !isGif && original.size > AUTO_DOWNSCALE_THRESHOLD) {
      try {
        const downscaled = await downscaleImageFile(original, AUTO_DOWNSCALE_MAX_EDGE);
        if (downscaled) file = downscaled;
      } catch (err) {
        console.warn("[Upload] downscale failed, using original", err);
      }
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
        const canvasMax = Math.min(canvasWidth, canvasHeight) * 0.4;
        const s = Math.min(canvasMax / w, canvasMax / h, 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: canvasWidth / 2 - (w * s) / 2,
          top: canvasHeight / 2 - (h * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } else if (isGif) {
        // GIFs: use ImageDecoder API to manually decode each frame
        const { fabricImg, width: w, height: h } = await createGifFabricImage(file);
        const canvasMax = Math.min(canvasWidth, canvasHeight) * 0.4;
        const s = Math.min(canvasMax / w, canvasMax / h, 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: canvasWidth / 2 - (w * s) / 2,
          top: canvasHeight / 2 - (h * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } else {
        // Static images: ask user whether to remove background
        setPendingUploadFile(file);
        setShowBgRemovalPopup(true);
      }
    } catch {
      alert("Could not load file. Please try another one.");
    }
    e.target.value = "";
  };

  // Convert a Blob/File to a base64 data URL so it can be embedded in canvas_json
  // and persist across sessions. CRITICAL: Fabric serializes images by their src.
  // If src is a "blob:" URL, that URL ONLY works in the browser tab that created it —
  // when the recipient opens the shared bomb link, every blob: src is broken, so all
  // uploaded photos appear blank. Data URLs embed the image bytes inline, so the
  // bomb is fully self-contained and portable.
  const blobToDataURL = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });

  const addImageToCanvas = async (file: File, removeBg: boolean) => {
    setShowBgRemovalPopup(false);
    setPendingUploadFile(null);
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (removeBg) {
      setProcessingUpload(true);
      try {
        const { removeBackground } = await import("@imgly/background-removal");
        const blob = await removeBackground(file, {
          output: { format: "image/png", quality: 1 },
        });
        // Embed as data URL so the image survives in saved canvas_json
        const transparentUrl = await blobToDataURL(blob as Blob);
        const fabricImg = await fabric.FabricImage.fromURL(transparentUrl);
        const canvasMax = Math.min(canvasWidth, canvasHeight) * 0.4;
        const s = Math.min(canvasMax / (fabricImg.width || canvasMax), canvasMax / (fabricImg.height || canvasMax), 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: canvasWidth / 2 - ((fabricImg.width || 0) * s) / 2,
          top: canvasHeight / 2 - ((fabricImg.height || 0) * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } catch (err) {
        console.error("Background removal failed, adding original:", err);
        // Fallback to original image — still as data URL so save is portable
        try {
          const fallbackUrl = await blobToDataURL(file);
          const fabricImg = await fabric.FabricImage.fromURL(fallbackUrl);
          const canvasMax = Math.min(canvasWidth, canvasHeight) * 0.4;
          const s = Math.min(canvasMax / (fabricImg.width || canvasMax), canvasMax / (fabricImg.height || canvasMax), 1);
          fabricImg.set({
            scaleX: s, scaleY: s,
            left: canvasWidth / 2 - ((fabricImg.width || 0) * s) / 2,
            top: canvasHeight / 2 - ((fabricImg.height || 0) * s) / 2,
          });
          canvas.add(fabricImg);
          canvas.setActiveObject(fabricImg);
          canvas.renderAll();
          setActiveTool("pointer");
        } catch {
          alert("Could not load image. Please try another one.");
        }
      } finally {
        setProcessingUpload(false);
      }
    } else {
      // Keep original image as-is — but as data URL so it's persistable
      try {
        const url = await blobToDataURL(file);
        const fabricImg = await fabric.FabricImage.fromURL(url);
        const canvasMax = Math.min(canvasWidth, canvasHeight) * 0.4;
        const s = Math.min(canvasMax / (fabricImg.width || canvasMax), canvasMax / (fabricImg.height || canvasMax), 1);
        fabricImg.set({
          scaleX: s, scaleY: s,
          left: canvasWidth / 2 - ((fabricImg.width || 0) * s) / 2,
          top: canvasHeight / 2 - ((fabricImg.height || 0) * s) / 2,
        });
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        setActiveTool("pointer");
      } catch {
        alert("Could not load image. Please try another one.");
      }
    }
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
    // Pop the current state — the previous state is what we want to restore
    newHistory.pop();

    if (newHistory.length === 0) {
      // No more history — clear only user objects, preserve any locked background layers
      const allObjects = canvas.getObjects();
      const userObjects = allObjects.filter(
        (obj) => !(obj as fabric.FabricObject & Record<string, boolean>)[LOCKED_KEY]
      );
      userObjects.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    } else {
      const prevState = newHistory[newHistory.length - 1];
      // loadFromJSON wipes the canvas and reloads — preserve viewport transform
      const vpt = canvas.viewportTransform ? [...canvas.viewportTransform] : null;
      canvas.loadFromJSON(JSON.parse(prevState)).then(() => {
        if (vpt) canvas.setViewportTransform(vpt as fabric.TMat2D);
        canvas.discardActiveObject();
        canvas.renderAll();
        // Re-apply locked styling to background objects after reload
        for (const obj of canvas.getObjects()) {
          const tagged = obj as fabric.FabricObject & Record<string, boolean>;
          if (tagged[LOCKED_KEY]) {
            obj.set({
              selectable: false,
              evented: false,
              lockMovementX: true,
              lockMovementY: true,
              lockRotation: true,
              lockScalingX: true,
              lockScalingY: true,
              opacity: 0.7,
            });
          }
        }
      }).catch(() => { /* swallow load errors */ });
    }
    setHistory(newHistory);
    updateObjectCount();
    refreshLayers();
    setSelectedObject(null);
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

    const hasBeatContent = beatData.tracks.some((t) => t.pattern.some(Boolean));

    if (isCollaborative && userObjects.length === 0 && !hasBeatContent) {
      alert("Add something to the canvas or make a beat first!");
      return;
    }
    if (!isCollaborative && canvas.getObjects().length === 0 && !hasBeatContent) {
      alert("Add something to the canvas or make a beat first!");
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

      const userBeatData = beatData.tracks.some((t) => t.pattern.some(Boolean)) ? beatData : null;

      const body = isCollaborative
        ? {
            contributor_name: creatorName,
            canvas_json: canvasJson,
            beat_data: userBeatData,
            canvas_size: activeCanvasSize,
          }
        : {
            canvas_json: canvasJson,
            thumbnail_data: thumbnailDataUrl,
            canvas_size: activeCanvasSize,
            beat_data: userBeatData,
          };

      const res = await fetch(endpoint, {
        method: isCollaborative ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Try to surface a friendly error if the server gave one (e.g. contributor cap reached)
        try {
          const errBody = await res.json();
          if (errBody?.code === "CONTRIBUTOR_LIMIT_REACHED") {
            alert(errBody.error || "This lovebomb is full.");
            setSaving(false);
            return;
          }
          if (errBody?.error) {
            alert(errBody.error);
            setSaving(false);
            return;
          }
        } catch { /* fall through to generic error */ }
        throw new Error("Save failed");
      }

      // STOP the recorder to flush ALL accumulated chunks into one final blob.
      // stop() is more reliable than snapshot() — it forces MediaRecorder to emit every
      // remaining buffered frame before returning. Snapshot can return null if no chunk has fired yet.
      try {
        const blob = await timelapseRef.current?.stop();
        if (blob && blob.size > 0) {
          lastTimelapseBlobRef.current = blob;
          console.log("[Timelapse] saved full session recording, size:", blob.size, "bytes");
        } else {
          console.warn("[Timelapse] stop() returned no blob — fallback will run on Download");
        }
      } catch (err) {
        console.warn("[Timelapse] stop failed", err);
      }

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
              padding: "9px 0 1px",
              fontFamily: "'TAYBang', 'VT323', monospace",
              fontSize: "22px",
              border: "none",
              borderRight: "1px solid #808080",
              background: activeTab === "canvas" ? "#FFFFFF" : MAC.bg,
              fontWeight: "normal",
              cursor: "pointer",
              borderRadius: 0,
              color: "#000",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Canvas
          </button>
          <button
            onClick={() => setActiveTab("beats")}
            style={{
              flex: 1,
              padding: "9px 0 1px",
              fontFamily: "'TAYBang', 'VT323', monospace",
              fontSize: "22px",
              border: "none",
              background: activeTab === "beats" ? "#FFFFFF" : MAC.bg,
              fontWeight: "normal",
              cursor: "pointer",
              borderRadius: 0,
              color: "#000",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Beat Maker
          </button>
        </div>

        {/* Canvas area — sunken inset panel.
            CRITICAL: we keep BOTH tabs mounted (just toggle visibility) so:
              1. The Fabric canvas isn't destroyed when user switches to the Beats tab.
              2. The timelapse recorder keeps capturing the canvas backing store
                 throughout the ENTIRE session — including time spent on the Beats tab. */}
        <div style={{ display: activeTab === "canvas" ? "contents" : "none" }}>
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
              width: canvasWidth * scale,
              height: canvasHeight * scale,
              position: "relative",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                border: "1px solid #000000",
                boxShadow: "2px 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              <canvas ref={canvasRef} />
            {processingUpload && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255, 216, 246, 0.85)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 10,
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "12px", animation: "spin 1.5s linear infinite" }}>
                  {"✂️"}
                </div>
                <span style={{ fontFamily: MAC.font, fontSize: "18px", color: "#000066" }}>
                  Removing background...
                </span>
                <span style={{ fontFamily: MAC.font, fontSize: "13px", color: "#808080", marginTop: "6px" }}>
                  First time may take a moment to load the model
                </span>
              </div>
            )}
            </div>
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
        </div>
        <div style={{ flex: 1, display: activeTab === "beats" ? "flex" : "none", flexDirection: "column", minHeight: "500px", height: "100%" }}>
          {/* All previous contributors' beats — accordion list */}
          {isCollaborative && hasPreviousBeats && previousBeats.map((contrib, idx) => {
            const isOpen = openPrevAccordions.has(idx);
            const isPlayingThis = prevBeatRefs.current[idx]?.isPlaying ?? false;
            const contribHasDrums = contrib.beatData.tracks.some((t) => !t.instrument.startsWith("melody_") && !t.instrument.startsWith("recording_") && t.pattern.some(Boolean));
            const contribHasMelody = contrib.beatData.tracks.some((t) => t.instrument.startsWith("melody_") && t.pattern.some(Boolean));
            const contribHasRecording = contrib.beatData.tracks.some((t) => t.instrument.startsWith("recording_") && t.pattern.some(Boolean));
            const label = [contribHasDrums && "Beat", contribHasMelody && "Melody", contribHasRecording && "Recording"].filter(Boolean).join(" & ");

            return (
              <div key={idx} style={{ borderBottom: "2px solid #808080", flexShrink: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "#f0d8ec",
                    borderBottom: isOpen ? "1px solid #ccc" : "none",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                  onClick={() => {
                    setOpenPrevAccordions((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      return next;
                    });
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); prevBeatRefs.current[idx]?.play(); forceUpdate((n) => n + 1); }}
                    style={{
                      width: 28,
                      height: 28,
                      border: "2px outset #DFDFDF",
                      background: isPlayingThis ? "#FF6B9D" : "#FFD8F6",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontFamily: "'VT323', monospace",
                      borderRadius: 0,
                      flexShrink: 0,
                    }}
                  >
                    {isPlayingThis ? "\u25A0" : "\u25B6"}
                  </button>
                  <span style={{ fontFamily: "'ChiKareGo2', 'VT323', monospace", fontSize: "14px", color: "#000066", fontWeight: "normal" }}>
                    {contrib.name}&apos;s {label}
                  </span>
                  <span style={{ fontFamily: "'VT323', monospace", fontSize: "12px", color: "#808080" }}>
                    (read-only)
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "12px", color: "#808080", fontFamily: "'VT323', monospace" }}>
                    {isOpen ? "\u25BC" : "\u25B6"}
                  </span>
                </div>
                {isOpen && (
                  <div style={{ maxHeight: "220px", overflow: "auto" }}>
                    <BeatSequencer
                      ref={(el) => { prevBeatRefs.current[idx] = el; }}
                      pattern={contrib.beatData}
                      onChange={() => {}}
                      readOnly
                      hideTransport
                      showAll
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* User's own beat label */}
          {isCollaborative && hasPreviousBeats && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                background: "#d8ecf0",
                borderBottom: "1px solid #ccc",
                flexShrink: 0,
              }}
            >
              <span style={{ fontFamily: "'ChiKareGo2', 'VT323', monospace", fontSize: "14px", color: "#000066", fontWeight: "normal" }}>
                {creatorName || "Your"}&apos;s Beat
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

              {/* Add Text */}
              <button
                onClick={() => {
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  const userObjs = canvas.getObjects().length - lockedCountRef.current;
                  if (userObjs >= MAX_OBJECTS) { alert("Canvas is full!"); return; }
                  const text = new fabric.IText("Type here", {
                    fontFamily: "TAYBang",
                    fontSize: 20,
                    fill: brushColor,
                    left: canvasWidth / 2 - 60,
                    top: canvasHeight / 2 - 15,
                  });
                  canvas.add(text);
                  canvas.setActiveObject(text);
                  text.enterEditing();
                  text.selectAll();
                  canvas.renderAll();
                  setActiveTool("pointer");
                }}
                style={styles.btn}
              >
                Add Text
              </button>

              {/* Text color — when text is selected */}
              {selectedObject && (selectedObject.type === "i-text" || selectedObject.type === "text") && (
                <>
                  <input
                    type="color"
                    value={(selectedObject as fabric.IText).fill as string || "#000000"}
                    onChange={(e) => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      (selectedObject as fabric.IText).set({ fill: e.target.value });
                      canvas.renderAll();
                      forceUpdate((n) => n + 1);
                    }}
                    title="Text color"
                    style={{ width: "28px", height: "28px", border: "1px solid #000", cursor: "pointer", padding: 0 }}
                  />
                </>
              )}

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

              {/* Save canvas as image/video */}
              <button onClick={() => setShowSaveFormatPopup(true)} style={styles.btn}>
                Save
              </button>

              {/* Resize canvas — only available to the original creator. Collaborators
                  inherit the frame so the existing composition isn't broken. */}
              {!isCollaborative && (
                <button
                  onClick={() => setShowResizeDialog(true)}
                  style={styles.btn}
                  title={`Current: ${canvasDims.label} (${canvasDims.aspectLabel})`}
                >
                  Resize
                </button>
              )}

              {/* Layer & Blend controls — visible when object selected */}
              {selectedObject && (
                <>
                  <div style={styles.toolbarDivider} />

                  {/* Layer ordering */}
                  <button
                    onClick={() => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      canvas.bringObjectToFront(selectedObject);
                      canvas.renderAll();
                      refreshLayers();
                    }}
                    style={styles.btn}
                  >
                    Front
                  </button>
                  <button
                    onClick={() => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      canvas.bringObjectForward(selectedObject);
                      canvas.renderAll();
                      refreshLayers();
                    }}
                    style={styles.btn}
                  >
                    Up
                  </button>
                  <button
                    onClick={() => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      canvas.sendObjectBackwards(selectedObject);
                      // Don't go below locked background objects
                      const idx = canvas.getObjects().indexOf(selectedObject);
                      if (idx < lockedCountRef.current) {
                        // Re-insert just above locked background objects
                      canvas.remove(selectedObject);
                      canvas.insertAt(lockedCountRef.current, selectedObject);
                      }
                      canvas.renderAll();
                      refreshLayers();
                    }}
                    style={styles.btn}
                  >
                    Down
                  </button>
                  <button
                    onClick={() => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      canvas.sendObjectToBack(selectedObject);
                      // Don't go below locked background objects
                      // Re-insert just above locked background objects
                      canvas.remove(selectedObject);
                      canvas.insertAt(lockedCountRef.current, selectedObject);
                      canvas.renderAll();
                      refreshLayers();
                    }}
                    style={styles.btn}
                  >
                    Back
                  </button>

                  <div style={styles.toolbarDivider} />

                  {/* Blend mode */}
                  <select
                    value={(selectedObject as fabric.FabricObject & { globalCompositeOperation?: string }).globalCompositeOperation || "source-over"}
                    onChange={(e) => {
                      const canvas = fabricRef.current;
                      if (!canvas || !selectedObject) return;
                      selectedObject.set({ globalCompositeOperation: e.target.value as string });
                      (selectedObject as fabric.FabricObject & { dirty?: boolean }).dirty = true;
                      canvas.renderAll();
                      forceUpdate((n) => n + 1);
                    }}
                    style={{
                      fontFamily: MAC.font,
                      fontSize: "14px",
                      background: MAC.bg,
                      border: `1px solid ${MAC.borderDark}`,
                      borderRadius: 0,
                      padding: "2px 4px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                    <option value="color-dodge">Color Dodge</option>
                    <option value="color-burn">Color Burn</option>
                    <option value="hard-light">Hard Light</option>
                    <option value="soft-light">Soft Light</option>
                    <option value="difference">Difference</option>
                    <option value="exclusion">Exclusion</option>
                    <option value="hue">Hue</option>
                    <option value="saturation">Saturation</option>
                    <option value="color">Color</option>
                    <option value="luminosity">Luminosity</option>
                  </select>
                </>
              )}
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
                  fontWeight: "normal",
                }}
              >
                Drums
              </button>
              <button
                onClick={() => { beatRef.current?.setActiveSection("melody"); forceUpdate((n) => n + 1); }}
                style={{
                  ...styles.btn,
                  background: beatRef.current?.activeSection === "melody" ? "#FFF" : "#E8A0FF",
                  fontWeight: "normal",
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

              {/* Mix All — collaborative mode only */}
              {isCollaborative && hasPreviousBeats && (
                <>
                  <div style={styles.toolbarDivider} />
                  <button
                    onClick={() => {
                      const myPlaying = beatRef.current?.isPlaying;
                      const anyPrevPlaying = prevBeatRefs.current.some((r) => r?.isPlaying);
                      if (myPlaying || anyPrevPlaying) {
                        // Stop all
                        if (myPlaying) beatRef.current?.play();
                        prevBeatRefs.current.forEach((r) => { if (r?.isPlaying) r.play(); });
                      } else {
                        // Start all at the same time
                        prevBeatRefs.current.forEach((r) => r?.play());
                        beatRef.current?.play();
                      }
                      forceUpdate((n) => n + 1);
                    }}
                    style={{
                      ...styles.btn,
                      background: (prevBeatRefs.current.some((r) => r?.isPlaying) && beatRef.current?.isPlaying)
                        ? "#FF6B9D" : "#E8A0FF",
                      fontWeight: "normal",
                    }}
                  >
                    {(prevBeatRefs.current.some((r) => r?.isPlaying) && beatRef.current?.isPlaying) ? "Stop Mix" : "Mix All"}
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

      {/* ─── Layer Panel (right side, desktop only, canvas mode) ─── */}
      {isDesktop && activeTab === "canvas" && (
        <div
          style={{
            ...styles.sidebar,
            ...styles.sidebarDesktop,
            width: "180px",
          }}
        >
          <div style={styles.paletteTitleBar}>
            <div style={{ width: "10px", height: "10px", border: "1px solid #000", background: "#FFD8F6" }} />
            <span>Layers</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px" }}>
            {userLayers.length === 0 ? (
              <p style={{ fontFamily: MAC.font, fontSize: "12px", color: "#808080", textAlign: "center", padding: "12px 0" }}>
                No layers yet
              </p>
            ) : (
              userLayers.map((obj, i) => {
                const isSelected = selectedObject === obj;
                const thumb = layerThumbs.get(obj);
                const blendMode = (obj as fabric.FabricObject & { globalCompositeOperation?: string }).globalCompositeOperation;
                const blendLabel = blendMode && blendMode !== "source-over" ? blendMode : "";
                const isDragOver = dragOverIdx === i && dragLayerIdx !== i;

                return (
                  <div
                    key={i}
                    draggable
                    onDragStart={() => setDragLayerIdx(i)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={() => {
                      if (dragLayerIdx === null || dragLayerIdx === i) return;
                      const canvas = fabricRef.current;
                      if (!canvas) return;
                      // userLayers is reversed (top first), so map back to canvas indices
                      const allObjs = canvas.getObjects();
                      const fromObj = userLayers[dragLayerIdx];
                      const toObj = userLayers[i];
                      const toCanvasIdx = allObjs.indexOf(toObj);
                      canvas.remove(fromObj);
                      canvas.insertAt(toCanvasIdx, fromObj);
                      canvas.renderAll();
                      refreshLayers();
                      setDragLayerIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDragLayerIdx(null); setDragOverIdx(null); }}
                    onClick={() => {
                      const canvas = fabricRef.current;
                      if (!canvas) return;
                      canvas.setActiveObject(obj);
                      canvas.renderAll();
                      setSelectedObject(obj);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "3px 4px",
                      marginBottom: "1px",
                      background: isSelected ? "#000066" : isDragOver ? "#E0D0F0" : "transparent",
                      color: isSelected ? "#FFF" : "#000",
                      cursor: "grab",
                      borderRadius: 0,
                      border: isDragOver ? "1px dashed #000066" : isSelected ? "1px solid #000" : "1px solid transparent",
                      fontFamily: MAC.font,
                      fontSize: "11px",
                      userSelect: "none",
                      opacity: dragLayerIdx === i ? 0.4 : 1,
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        background: "#FFFFFF",
                        border: "1px solid #808080",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                          draggable={false}
                        />
                      ) : (
                        <span style={{ fontSize: "9px", color: "#808080" }}>?</span>
                      )}
                    </div>
                    {/* Label */}
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", fontFamily: "'VT323', monospace" }}>
                      {blendLabel || (() => {
                        if (obj.type === "i-text" || obj.type === "text") return `"${((obj as fabric.IText).text || "").slice(0, 12)}"`;
                        if (obj.type === "path") return "Scribble";
                        if (obj.type === "image") {
                          const bombNames = ["Fat Man", "Little Boy", "Daisy Cutter", "MOAB", "Hellfire", "Paveway", "Tomahawk", "Napalm", "Bunker Buster", "Stinger", "F-16 Falcon", "B-52", "SR-71", "F-117 Stealth", "Spitfire", "Mustang P-51", "Blackbird", "Valkyrie", "Enola Gay", "Bockscar", "Thunderbolt", "Warthog A-10", "Raptor F-22", "Nighthawk", "Phantom F-4", "MiG-21", "Concorde", "Lancaster", "Mosquito", "Zero"];
                          const idx = fabricRef.current ? fabricRef.current.getObjects().indexOf(obj) : i;
                          return bombNames[idx % bombNames.length];
                        }
                        return "Mystery";
                      })()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─── Share Popup (Mac Alert Dialog) ─── */}
      {/* Background removal choice popup */}
      {showBgRemovalPopup && pendingUploadFile && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <div style={styles.titleBar}>
              <div
                style={styles.closeBox}
                onClick={() => { setShowBgRemovalPopup(false); setPendingUploadFile(null); }}
              />
              <span style={styles.titleText}>Upload Image</span>
              <span />
            </div>
            <div style={styles.dialogBody}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  fontWeight: 300,
                  color: "#000066",
                  fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
                  textShadow: "-2.5px 4px 9px rgba(0,0,0,0.25), 0px 3.3px 3.3px rgba(0,0,0,0.25)",
                }}
              >
                Remove background?
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#000000",
                  fontFamily: MAC.font,
                  textAlign: "center",
                }}
              >
                Turn your image into a sticker with transparent background, or keep the original image as-is.
              </p>
              <div style={{ display: "flex", width: "100%", gap: "8px" }}>
                <button
                  onClick={() => addImageToCanvas(pendingUploadFile, true)}
                  className="aqua-cta"
                  style={{ flex: 1, padding: "8px 16px" }}
                >
                  Make Sticker
                </button>
                <button
                  onClick={() => addImageToCanvas(pendingUploadFile, false)}
                  className="aqua-cta"
                  style={{ flex: 1, padding: "8px 16px" }}
                >
                  Keep Original
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resize canvas dialog (mid-session size change, CapCut-style) */}
      {showResizeDialog && (
        <div style={styles.overlay}>
          <CanvasSizeDialog
            inline
            initialSize={activeCanvasSize}
            title="Resize canvas"
            subtitle="Change the frame. Your existing artwork stays in place — reposition anything that falls outside."
            confirmLabel="Apply"
            onConfirm={(size) => {
              setActiveCanvasSize(size);
              setShowResizeDialog(false);
            }}
            onCancel={() => setShowResizeDialog(false)}
          />
        </div>
      )}

      {/* Save Format Popup */}
      {showSaveFormatPopup && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <div style={styles.titleBar}>
              <div
                style={styles.closeBox}
                onClick={() => setShowSaveFormatPopup(false)}
              />
              <span style={styles.titleText}>Save Canvas</span>
              <span />
            </div>
            <div style={styles.dialogBody}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "32px",
                  fontWeight: 300,
                  color: "#000066",
                  fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
                  textShadow: "-2.5px 4px 9px rgba(0,0,0,0.25), 0px 3.3px 3.3px rgba(0,0,0,0.25)",
                }}
              >
                Save your creation
              </h2>
              <p
                style={{
                  margin: "8px 0 16px",
                  fontSize: "14px",
                  color: "#000000",
                  fontFamily: "'ChiKareGo2', 'VT323', 'Geneva', monospace",
                }}
              >
                Choose a format:
              </p>
              <div style={{ display: "flex", width: "100%", gap: "12px" }}>
                <button
                  className="aqua-cta"
                  style={{ flex: 1, padding: "10px 16px", fontSize: "16px" }}
                  onClick={() => {
                    setShowSaveFormatPopup(false);
                    const canvas = fabricRef.current;
                    if (!canvas) return;
                    const dataUrl = canvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
                    const link = document.createElement("a");
                    link.download = `lovebomb-${Date.now()}.png`;
                    link.href = dataUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  Save as PNG
                </button>
                <button
                  className="aqua-cta"
                  style={{ flex: 1, padding: "10px 16px", fontSize: "16px" }}
                  onClick={async () => {
                    setShowSaveFormatPopup(false);
                    const canvas = fabricRef.current;
                    if (!canvas) return;
                    const htmlCanvas = canvas.getElement() as HTMLCanvasElement;
                    // Pump the canvas a few times so the static image is present in the
                    // backing store before captureStream starts producing frames.
                    for (let i = 0; i < 3; i++) {
                      canvas.renderAll();
                      await new Promise((r) => setTimeout(r, 30));
                    }
                    try {
                      const result = await exportCanvasWithBeat({
                        canvas: htmlCanvas,
                        beatPattern: beatData,
                        filename: `lovebomb-${Date.now()}`,
                        durationSeconds: 6,
                      });
                      downloadBlob(result.blob, result.filename);
                    } catch (err) {
                      console.error("[Save as MP4] failed:", err);
                      alert("Failed to save video. Please try again!");
                    }
                  }}
                >
                  Save as MP4
                </button>
              </div>
              <button
                className="aqua-cta"
                style={{ width: "100%", padding: "6px 16px", marginTop: "8px", fontSize: "14px" }}
                onClick={() => setShowSaveFormatPopup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSharePopup && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            {/* Dialog title bar */}
            <div style={styles.titleBar}>
              <div style={styles.closeBox} />
              <span style={styles.titleText}>Lovebomb Sent</span>
              {/* Red square close button — same size as left closeBox */}
              <button
                onClick={() => setShowSharePopup(false)}
                aria-label="Close"
                style={{
                  width: "12px",
                  height: "12px",
                  border: `1px solid ${MAC.borderDark}`,
                  background: "#ff3b30",
                  cursor: "pointer",
                  padding: 0,
                  borderRadius: 0,
                  flexShrink: 0,
                }}
              />
            </div>

            {/* Dialog body */}
            <div style={styles.dialogBody}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "36px",
                  fontWeight: 300,
                  color: "#000066",
                  fontFamily: "'Apple Garamond Light', 'EB Garamond', Garamond, Georgia, serif",
                  textShadow: "-2.5px 4px 9px rgba(0,0,0,0.25), 0px 3.3px 3.3px rgba(0,0,0,0.25)",
                }}
              >
                Lovebomb saved!
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "16px",
                  color: "#000000",
                  fontFamily: "'ChiKareGo2', 'VT323', 'Geneva', monospace",
                  letterSpacing: "0.5px",
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
                  onClick={async () => {
                    if (exportingTimelapse) return;
                    setExportingTimelapse(true);
                    setTimelapseProgress(0);
                    try {
                      console.log("[Timelapse] export starting");
                      // Try cached snapshot first
                      let videoBlob = lastTimelapseBlobRef.current;
                      console.log("[Timelapse] cached blob size:", videoBlob?.size ?? 0);
                      // Then try to grab a fresh snapshot from the running recorder
                      if (!videoBlob || videoBlob.size === 0) {
                        videoBlob = await timelapseRef.current?.snapshot() ?? null;
                        console.log("[Timelapse] live snapshot size:", videoBlob?.size ?? 0);
                      }
                      // Last-resort fallback: capture a 3-second live recording from the current canvas.
                      // This always produces a usable video even if the silent recorder failed for any reason.
                      if (!videoBlob || videoBlob.size === 0) {
                        console.warn("[Timelapse] silent recording empty, falling back to live capture");
                        videoBlob = await new Promise<Blob | null>((resolve) => {
                          try {
                            const fabricCanvas = fabricRef.current;
                            const lowerCanvas = canvasRef.current;
                            if (!fabricCanvas || !lowerCanvas) { resolve(null); return; }
                            const stream = (lowerCanvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(15);
                            if (!stream) { resolve(null); return; }
                            const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
                            const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
                            const rec = new MediaRecorder(stream, { mimeType: mime });
                            const chunks: Blob[] = [];
                            rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
                            rec.onstop = () => {
                              stream.getTracks().forEach((t) => t.stop());
                              resolve(chunks.length ? new Blob(chunks, { type: mime }) : null);
                            };
                            rec.start(500);
                            // Force ~15 paints over 3 seconds so MediaRecorder captures frames
                            const totalFrames = 45;
                            let i = 0;
                            const tick = () => {
                              try { fabricCanvas.requestRenderAll(); } catch { /* swallow */ }
                              i++;
                              if (i < totalFrames) {
                                setTimeout(tick, 1000 / 15);
                              } else {
                                setTimeout(() => { try { rec.stop(); } catch { /* swallow */ } }, 200);
                              }
                            };
                            tick();
                          } catch (err) {
                            console.warn("[Timelapse fallback] failed", err);
                            resolve(null);
                          }
                        });
                      }
                      console.log("[Timelapse] final blob before export:", videoBlob?.size ?? 0);
                      if (!videoBlob || videoBlob.size === 0) {
                        alert("Couldn't capture a timelapse. Your browser may not support canvas recording.");
                        setExportingTimelapse(false);
                        return;
                      }
                      const userBeatData = beatData.tracks.some((t) => t.pattern.some(Boolean)) ? beatData : null;
                      const result = await exportTimelapseWithAudio({
                        videoBlob,
                        beatPattern: userBeatData,
                        width: canvasWidth,
                        height: canvasHeight,
                        filename: `lovebomb-timelapse-${(creatorName || "anon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) || "anon"}-${new Date().toISOString().slice(0, 10)}`,
                        onProgress: setTimelapseProgress,
                      });
                      downloadBlob(result.blob, result.filename);
                    } catch (err) {
                      console.error("[Timelapse export] failed", err);
                      alert("Couldn't export timelapse. Please try again.");
                    } finally {
                      setExportingTimelapse(false);
                      setTimelapseProgress(0);
                    }
                  }}
                  className="aqua-cta"
                  style={{ flex: 1, padding: "6px 16px", opacity: exportingTimelapse ? 0.6 : 1 }}
                  disabled={exportingTimelapse}
                  title="Download a sped-up MP4 of how your lovebomb came together"
                >
                  {exportingTimelapse
                    ? `Encoding... ${Math.round(timelapseProgress * 100)}%`
                    : "Download timelapse"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
