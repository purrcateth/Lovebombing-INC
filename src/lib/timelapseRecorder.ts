// Timelapse recorder
// ----------------------
// Captures the Fabric canvas at low FPS (5fps) silently throughout the editing
// session. Audio is NOT captured here — it's baked in at export time.
//
// ARCHITECTURE: We use an INTERNAL CAPTURE CANVAS, not the source canvas's
// captureStream(). The reason: when the user switches tabs (Beats tab),
// the source Fabric canvas may be hidden / display:none, and browsers stop
// emitting captureStream frames for invisible canvases. By owning a separate
// off-DOM canvas and copying the source into it on a setInterval (which fires
// regardless of visibility), recording continues uninterrupted across tab
// switches and any other visibility change.
//
// Usage:
//   const rec = new TimelapseRecorder(fabricLowerCanvasElement);
//   rec.start();           // begin capture
//   ...user works...
//   const blob = await rec.stop(); // returns video/webm Blob

const TIMELAPSE_FPS = 5;

export interface TimelapseRecorderOptions {
  fps?: number;
  mimeType?: string;
  /** Called at the recording FPS so the source can repaint itself if needed
   * (e.g. ask Fabric to renderAll). The recorder ALSO copies the source canvas
   * into its capture canvas every tick, so even a static source still produces
   * frames. */
  onTick?: () => void;
}

export class TimelapseRecorder {
  private sourceCanvas: HTMLCanvasElement;
  private captureCanvas: HTMLCanvasElement;
  private captureCtx: CanvasRenderingContext2D | null;
  private fps: number;
  private mimeType: string;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private active = false;
  private copyInterval: ReturnType<typeof setInterval> | null = null;
  private onTick: (() => void) | undefined;

  constructor(sourceCanvas: HTMLCanvasElement, opts: TimelapseRecorderOptions = {}) {
    this.sourceCanvas = sourceCanvas;
    this.fps = opts.fps ?? TIMELAPSE_FPS;
    this.mimeType = opts.mimeType ?? this.pickMimeType();
    this.onTick = opts.onTick;

    // Internal capture canvas. We OWN this and draw into it ourselves —
    // captureStream from this works regardless of source canvas visibility.
    this.captureCanvas = document.createElement("canvas");
    this.captureCanvas.width = Math.max(1, sourceCanvas.width || 1080);
    this.captureCanvas.height = Math.max(1, sourceCanvas.height || 1080);
    this.captureCtx = this.captureCanvas.getContext("2d", { alpha: false });
    if (this.captureCtx) {
      this.captureCtx.fillStyle = "#FFFFFF";
      this.captureCtx.fillRect(0, 0, this.captureCanvas.width, this.captureCanvas.height);
    }
  }

  private pickMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "video/webm";
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "video/webm";
  }

  /** Resize the capture canvas to match the source if it changed
   * (e.g. user resized the canvas mid-session via the Resize button). */
  private syncCaptureSize() {
    const sw = Math.max(1, this.sourceCanvas.width || 1);
    const sh = Math.max(1, this.sourceCanvas.height || 1);
    if (this.captureCanvas.width !== sw || this.captureCanvas.height !== sh) {
      this.captureCanvas.width = sw;
      this.captureCanvas.height = sh;
      // Re-fill background after resize (resize clears the canvas)
      if (this.captureCtx) {
        this.captureCtx.fillStyle = "#FFFFFF";
        this.captureCtx.fillRect(0, 0, sw, sh);
      }
    }
  }

  /** Copy the current source canvas pixels into the capture canvas. */
  private copyFrame() {
    if (!this.captureCtx) return;
    try {
      this.syncCaptureSize();
      // Ask source to repaint first so we get the latest state
      try { this.onTick?.(); } catch { /* swallow */ }
      // Then copy it. drawImage works on the source's BACKING STORE regardless
      // of whether the source <canvas> is visible / display:none / detached.
      this.captureCtx.drawImage(
        this.sourceCanvas,
        0, 0, this.sourceCanvas.width, this.sourceCanvas.height,
        0, 0, this.captureCanvas.width, this.captureCanvas.height,
      );
    } catch (err) {
      // Tainted canvas, etc — log once and move on
      if (this.chunks.length === 0) console.warn("[Timelapse] copyFrame failed:", err);
    }
  }

  start(): boolean {
    if (this.active) return true;
    if (typeof MediaRecorder === "undefined") {
      console.warn("[Timelapse] MediaRecorder not supported in this browser");
      return false;
    }
    try {
      // captureStream from OUR capture canvas — we control its frames
      const captureStreamFn = (this.captureCanvas as HTMLCanvasElement & {
        captureStream?: (fps?: number) => MediaStream;
      }).captureStream;
      if (!captureStreamFn) {
        console.warn("[Timelapse] canvas.captureStream not available");
        return false;
      }
      this.stream = captureStreamFn.call(this.captureCanvas, this.fps);
      this.chunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          if (this.chunks.length % 10 === 1) {
            console.log(`[Timelapse] chunk #${this.chunks.length} (${e.data.size}B) @ ${this.elapsedSeconds().toFixed(1)}s`);
          }
        }
      };
      this.mediaRecorder.onerror = (e) => {
        console.error("[Timelapse] MediaRecorder error:", e);
      };
      this.mediaRecorder.start(1000); // collect a chunk every 1s for safety
      this.startedAt = performance.now();
      this.active = true;
      console.log(`[Timelapse] STARTED @ ${new Date().toISOString()} (mime=${this.mimeType}, fps=${this.fps})`);

      // Paint the first frame immediately so a save within ~200ms isn't empty
      this.copyFrame();

      // setInterval (NOT requestAnimationFrame) so it fires even when the
      // source canvas / its tab is hidden. The browser only throttles
      // setInterval when the WHOLE PAGE is in a background tab — not
      // when individual elements are display:none.
      this.copyInterval = setInterval(() => {
        if (!this.active) return;
        this.copyFrame();
      }, Math.round(1000 / this.fps));

      return true;
    } catch (err) {
      console.warn("[Timelapse] failed to start", err);
      return false;
    }
  }

  /** Returns the recorded Blob (WebM). Resolves null if nothing was captured. */
  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.active) {
        resolve(null);
        return;
      }
      this.mediaRecorder.onstop = () => {
        this.stoppedAt = performance.now();
        this.active = false;
        if (this.copyInterval) { clearInterval(this.copyInterval); this.copyInterval = null; }
        this.stream?.getTracks().forEach((t) => t.stop());
        const totalBytes = this.chunks.reduce((sum, c) => sum + c.size, 0);
        console.log(`[Timelapse] STOPPED after ${this.elapsedSeconds().toFixed(1)}s — ${this.chunks.length} chunks, ${(totalBytes / 1024).toFixed(0)} KB total`);
        if (this.chunks.length === 0) {
          resolve(null);
        } else {
          resolve(new Blob(this.chunks, { type: this.mimeType }));
        }
      };
      // Final frame copy before stopping to ensure the very last state is captured
      this.copyFrame();
      console.log(`[Timelapse] stop() called after ${this.elapsedSeconds().toFixed(1)}s`);
      this.mediaRecorder.stop();
    });
  }

  /** Get a snapshot of recording so far without stopping. */
  async snapshot(): Promise<Blob | null> {
    if (!this.mediaRecorder || !this.active) return null;
    // Force a copy then request data
    this.copyFrame();
    await new Promise<void>((resolve) => {
      let resolved = false;
      const onData = (e: BlobEvent) => {
        if (e.data && e.data.size > 0 && !resolved) {
          resolved = true;
          this.mediaRecorder?.removeEventListener("dataavailable", onData);
          setTimeout(resolve, 0);
        }
      };
      this.mediaRecorder?.addEventListener("dataavailable", onData);
      try {
        this.mediaRecorder?.requestData();
      } catch {
        if (!resolved) { resolved = true; this.mediaRecorder?.removeEventListener("dataavailable", onData); resolve(); }
      }
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.mediaRecorder?.removeEventListener("dataavailable", onData);
          resolve();
        }
      }, 3000);
    });
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this.mimeType });
  }

  isActive(): boolean { return this.active; }

  /** Approximate elapsed real seconds since recording started. */
  elapsedSeconds(): number {
    if (!this.startedAt) return 0;
    const end = this.stoppedAt ?? performance.now();
    return (end - this.startedAt) / 1000;
  }

  getMimeType(): string { return this.mimeType; }
  getFps(): number { return this.fps; }
}
