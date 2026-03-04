"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as fabric from "fabric";
import { stickerCategories } from "@/lib/stickers";

interface CanvasEditorProps {
  bombId: string;
  creatorName: string;
  initialCanvasJson?: object | null;
  isCollaborative?: boolean;
  backgroundCanvasJson?: object | null;
  backgroundLayers?: object[];
}

type ToolType = "pointer" | "pencil";

const MAX_OBJECTS = 100;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB
const CANVAS_SIZE = 1080;

// Custom property to mark locked background objects
const LOCKED_KEY = "_isLockedBackground";

// ─── Mac OS 9 Platinum Inline Styles ───────────────────────────────────
const MAC = {
  bg: "#DDDDDD",
  bgDark: "#BBBBBB",
  bgLight: "#EEEEEE",
  border: "#888888",
  borderDark: "#555555",
  borderLight: "#FFFFFF",
  titleGradient: "linear-gradient(180deg, #CCCCCC 0%, #AAAAAA 100%)",
  inset:
    "inset 1px 1px 2px rgba(0,0,0,0.25), inset -1px -1px 1px rgba(255,255,255,0.5)",
  outset:
    "1px 1px 0px rgba(0,0,0,0.15), inset 1px 1px 0px rgba(255,255,255,0.6), inset -1px -1px 0px rgba(0,0,0,0.1)",
  btnOutset:
    "inset 1px 1px 0px rgba(255,255,255,0.7), inset -1px -1px 0px rgba(0,0,0,0.2), 1px 1px 1px rgba(0,0,0,0.15)",
  btnActive:
    "inset 1px 1px 2px rgba(0,0,0,0.3), inset -1px -1px 1px rgba(255,255,255,0.3)",
  font: "'HIKARI', 'VT323', 'Chicago', 'Charcoal', sans-serif",
  fontSize: "16px",
  cursor: "url(/cursors/hand.svg) 6 0, pointer",
};

// Reusable style objects
const styles = {
  root: {
    display: "flex",
    height: "100vh",
    flexDirection: "column" as const,
    background: MAC.bg,
    fontFamily: MAC.font,
    fontSize: MAC.fontSize,
    cursor: `url(/cursors/hand.svg) 6 0, default`,
  },
  rootDesktop: {
    flexDirection: "row" as const,
  },
  // ─── Title Bar ──────────────────
  titleBar: {
    display: "flex",
    alignItems: "center",
    height: "22px",
    padding: "0 6px",
    background: MAC.titleGradient,
    borderBottom: `1px solid ${MAC.borderDark}`,
    gap: "8px",
    userSelect: "none" as const,
    flexShrink: 0,
  },
  titleBtnGroup: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
  },
  closeBtn: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#FF5F56",
    border: `1px solid #E0443E`,
    cursor: MAC.cursor,
  },
  minimizeBtn: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#FFBD2E",
    border: `1px solid #DEA123`,
    cursor: MAC.cursor,
  },
  zoomBtn: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#27C93F",
    border: `1px solid #1DAD2B`,
    cursor: MAC.cursor,
  },
  titleText: {
    flex: 1,
    textAlign: "center" as const,
    fontSize: "12px",
    fontWeight: "bold" as const,
    color: "#000000",
    letterSpacing: "0.5px",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
    fontFamily: MAC.font,
  },
  titleCounter: {
    fontSize: "11px",
    color: "#333333",
    fontFamily: MAC.font,
    whiteSpace: "nowrap" as const,
  },
  // ─── Mac Button ──────────────────
  btn: {
    padding: "3px 12px",
    fontSize: "12px",
    fontFamily: MAC.font,
    background: MAC.bg,
    border: `1px solid ${MAC.border}`,
    borderRadius: "4px",
    boxShadow: MAC.btnOutset,
    cursor: MAC.cursor,
    color: "#000000",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  btnActive: {
    padding: "3px 12px",
    fontSize: "12px",
    fontFamily: MAC.font,
    background: "#999999",
    border: `1px solid ${MAC.borderDark}`,
    borderRadius: "4px",
    boxShadow: MAC.btnActive,
    cursor: MAC.cursor,
    color: "#FFFFFF",
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  btnPrimary: {
    padding: "3px 16px",
    fontSize: "12px",
    fontFamily: MAC.font,
    background: "#000000",
    border: `1px solid #000000`,
    borderRadius: "4px",
    boxShadow: "2px 2px 4px rgba(0,0,0,0.3)",
    cursor: MAC.cursor,
    color: "#FFFFFF",
    fontWeight: "bold" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: "1.4",
  },
  // ─── Sticker Sidebar ──────────────────
  sidebar: {
    background: MAC.bg,
    borderRight: `1px solid ${MAC.borderDark}`,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
  },
  sidebarDesktop: {
    width: "220px",
    height: "100vh",
  },
  sidebarMobile: {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "50vh",
    zIndex: 40,
    borderTop: `1px solid ${MAC.borderDark}`,
    borderRight: "none",
    transition: "transform 0.25s ease-in-out",
  },
  paletteTitleBar: {
    display: "flex",
    alignItems: "center",
    height: "18px",
    padding: "0 6px",
    background: MAC.titleGradient,
    borderBottom: `1px solid ${MAC.borderDark}`,
    fontSize: "11px",
    fontWeight: "bold" as const,
    fontFamily: MAC.font,
    color: "#000000",
    userSelect: "none" as const,
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
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
    borderRadius: "2px",
  },
  // ─── Canvas Area ──────────────────
  canvasArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    minHeight: 0,
    position: "relative" as const,
  },
  canvasSunken: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    margin: "4px",
    background: "#FFFFFF",
    borderRadius: "2px",
    boxShadow: MAC.inset,
    border: `1px solid ${MAC.borderDark}`,
  },
  // ─── Toolbar ──────────────────
  toolbar: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    padding: "5px 10px",
    background: MAC.bg,
    borderTop: `1px solid ${MAC.borderDark}`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
  },
  toolbarDivider: {
    width: "1px",
    height: "20px",
    background: MAC.border,
    margin: "0 4px",
    boxShadow: `1px 0 0 ${MAC.bgLight}`,
  },
  colorSwatch: {
    width: "18px",
    height: "18px",
    border: "none",
    cursor: MAC.cursor,
    padding: 0,
  },
  colorSwatchActive: {
    width: "18px",
    height: "18px",
    border: "2px solid #000000",
    cursor: MAC.cursor,
    padding: 0,
  },
  colorPalette: {
    display: "flex",
    alignItems: "center",
    gap: "0px",
    border: `1px solid ${MAC.borderDark}`,
    padding: "2px",
    background: "#FFFFFF",
    borderRadius: "2px",
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
    borderRadius: "6px",
    boxShadow: "4px 4px 12px rgba(0,0,0,0.35)",
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
    fontSize: "12px",
    fontFamily: MAC.font,
    background: "#FFFFFF",
    border: `1px solid ${MAC.borderDark}`,
    borderRadius: "2px",
    boxShadow: MAC.inset,
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
    border: `1px solid ${MAC.borderDark}`,
    borderRadius: "4px",
    boxShadow: "2px 2px 4px rgba(0,0,0,0.2)",
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
  const [objectCount, setObjectCount] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [dragOverCanvas, setDragOverCanvas] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    });
    canvas.on("object:removed", updateObjectCount);

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
      canvas.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fabricRef.current?.freeDrawingBrush) return;
    fabricRef.current.freeDrawingBrush.color = brushColor;
    fabricRef.current.freeDrawingBrush.width = brushSize;
  }, [brushColor, brushSize]);

  useEffect(() => {
    if (!fabricRef.current) return;
    fabricRef.current.isDrawingMode = activeTool === "pencil";
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
      const img = await fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" });
      const targetSize = 150;
      const scaleX = targetSize / (img.width || 150);
      const scaleY = targetSize / (img.height || 150);
      const s = Math.min(scaleX, scaleY);

      const left = canvasX !== undefined ? canvasX - (targetSize / 2) : CANVAS_SIZE / 2 - (targetSize / 2);
      const top = canvasY !== undefined ? canvasY - (targetSize / 2) : CANVAS_SIZE / 2 - (targetSize / 2);

      img.set({ scaleX: s, scaleY: s, left, top });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_SIZE) {
      alert("Image is too large! Max size is 5MB.");
      return;
    }

    const canvas = fabricRef.current;
    if (!canvas) return;

    const userObjects = canvas.getObjects().length - lockedCountRef.current;
    if (userObjects >= MAX_OBJECTS) {
      alert("Canvas is full! Remove some items first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      try {
        const img = await fabric.FabricImage.fromURL(dataUrl);
        const maxSize = CANVAS_SIZE * 0.4;
        const scaleX = maxSize / (img.width || maxSize);
        const scaleY = maxSize / (img.height || maxSize);
        const s = Math.min(scaleX, scaleY, 1);
        img.set({
          scaleX: s,
          scaleY: s,
          left: CANVAS_SIZE / 2 - ((img.width || 0) * s) / 2,
          top: CANVAS_SIZE / 2 - ((img.height || 0) * s) / 2,
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        setActiveTool("pointer");
      } catch {
        alert("Could not load image. Please try another one.");
      }
    };
    reader.readAsDataURL(file);
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
            bottom: "72px",
            left: "12px",
            zIndex: 50,
            fontSize: "11px",
            padding: "4px 10px",
          }}
        >
          {sidebarOpen ? "✕ Close" : "☆ Stickers"}
        </button>
      )}

      {/* ─── Sticker Sidebar (Mac OS 9 Palette Window) ─── */}
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
        {/* Palette title bar */}
        <div style={styles.paletteTitleBar}>
          <span>Stickers</span>
        </div>
        <div style={{ padding: "8px" }}>
          {/* Upload button */}
          <label
            style={{
              ...styles.btn,
              display: "flex",
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "8px",
              textAlign: "center" as const,
              fontSize: "11px",
            }}
          >
            📁 Upload Image
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
          </label>

          {/* Sticker categories */}
          {stickerCategories.map((category) => (
            <div key={category.name} style={{ marginBottom: "10px" }}>
              <h3
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "11px",
                  fontWeight: "bold",
                  color: "#000000",
                  fontFamily: MAC.font,
                  letterSpacing: "0.5px",
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

      {/* ─── Main Canvas Area (Mac OS 9 Window) ─── */}
      <div style={styles.canvasArea}>
        {/* Window title bar */}
        <div style={styles.titleBar}>
          <div style={styles.titleBtnGroup}>
            <div style={styles.closeBtn} />
            <div style={styles.minimizeBtn} />
            <div style={styles.zoomBtn} />
          </div>
          <span style={styles.titleText}>
            {isCollaborative
              ? `${creatorName} — Adding to Lovebomb`
              : `${creatorName} — Lovebomb`}
          </span>
          <span style={styles.titleCounter}>
            {objectCount}/{MAX_OBJECTS}
          </span>
        </div>

        {/* Canvas area — sunken inset panel */}
        <div
          ref={containerRef}
          style={{
            ...styles.canvasSunken,
            ...(dragOverCanvas ? { background: "#CCCCCC" } : {}),
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
              boxShadow: "2px 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Zoom indicator badge */}
        {zoomLevel !== 1 && (
          <div style={styles.zoomBadge}>
            <span style={{ fontSize: "11px", color: "#000", fontFamily: MAC.font }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => {
                fabricRef.current?.setZoom(1);
                fabricRef.current?.setViewportTransform([1, 0, 0, 1, 0, 0]);
                setZoomLevel(1);
              }}
              style={{ ...styles.btn, padding: "1px 8px", fontSize: "10px" }}
            >
              Reset
            </button>
          </div>
        )}

        {/* Resize handle */}
        <div style={styles.resizeHandle} />

        {/* ─── Bottom Toolbar ─── */}
        <div style={styles.toolbar}>
          {/* Pointer tool */}
          <button
            onClick={() => setActiveTool("pointer")}
            style={activeTool === "pointer" ? styles.btnActive : styles.btn}
          >
            ➤ Select
          </button>

          {/* Pencil tool */}
          <button
            onClick={() => setActiveTool("pencil")}
            style={activeTool === "pencil" ? styles.btnActive : styles.btn}
          >
            ✎ Draw
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
          {activeTool === "pencil" && (
            <input
              type="range"
              min={1}
              max={20}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: "60px", cursor: MAC.cursor }}
            />
          )}

          {/* Divider */}
          <div style={styles.toolbarDivider} />

          {/* Delete */}
          <button onClick={deleteSelected} style={styles.btn}>
            ✕ Delete
          </button>

          {/* Undo */}
          <button onClick={handleUndo} style={styles.btn}>
            ↩ Undo
          </button>

          {/* Divider */}
          <div style={styles.toolbarDivider} />

          {/* Save / Send */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.btnPrimary,
              ...(saving ? { opacity: 0.6 } : {}),
            }}
          >
            {saving
              ? "Saving..."
              : isCollaborative
              ? "💾 Save & Share"
              : "💣 Send Lovebomb"}
          </button>
        </div>
      </div>

      {/* ─── Share Popup (Mac OS 9 Alert Dialog) ─── */}
      {showSharePopup && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            {/* Dialog title bar */}
            <div style={styles.titleBar}>
              <div style={styles.titleBtnGroup}>
                <div
                  style={styles.closeBtn}
                  onClick={() => setShowSharePopup(false)}
                />
              </div>
              <span style={styles.titleText}>Lovebomb Sent</span>
              <span />
            </div>

            {/* Dialog body */}
            <div style={styles.dialogBody}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: "bold",
                  color: "#000000",
                  fontFamily: "'EB Garamond', serif",
                }}
              >
                💣 Lovebomb saved!
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#333333",
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
                  style={{ ...styles.input, fontSize: "11px" }}
                />
                <button onClick={copyLink} style={styles.btn}>
                  Copy
                </button>
              </div>
              <div style={{ display: "flex", width: "100%", gap: "8px" }}>
                <button
                  onClick={handleShare}
                  style={{ ...styles.btnPrimary, flex: 1 }}
                >
                  Share
                </button>
                <button
                  onClick={() => setShowSharePopup(false)}
                  style={{ ...styles.btn, flex: 1 }}
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
