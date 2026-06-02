// Timelapse export pipeline
// --------------------------
// Takes the silently-recorded canvas video (WebM, 5fps) and:
//   1. Renders the beat pattern offline to a stereo PCM AudioBuffer.
//   2. Plays the WebM into a hidden <video> element while playing the audio
//      buffer through Web Audio simultaneously.
//   3. Captures BOTH into a new MediaStream (video + audio) and re-records
//      via MediaRecorder using video/mp4 if supported, falling back to webm.
//
// This avoids loading ffmpeg.wasm (30MB) for the common case (Chrome/Edge/Safari
// 17+ all support video/mp4 MediaRecorder natively in 2024+).
//
// Audio behavior:
//   - If the beat has any active notes, it loops for the video's duration.
//   - If no beat exists, the export is silent.

import type { BeatPattern } from "@/lib/types";
import { renderBeatPatternToBuffer } from "@/lib/audioEngine";

export interface ExportOptions {
  /** Source recorded video Blob (WebM from TimelapseRecorder). */
  videoBlob: Blob;
  /** Beat pattern to bake into the audio track (optional — silent if null). */
  beatPattern?: BeatPattern | null;
  /** Output dimensions (after the canvas size pick). */
  width: number;
  height: number;
  /** Filename hint for the download. */
  filename?: string;
  /** Progress callback 0..1 */
  onProgress?: (progress: number) => void;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  filename: string;
}

function pickOutputMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "video/webm", ext: "webm" };
  // Prefer MP4 (universal playback), fall back to WebM
  const candidates: { mime: string; ext: string }[] = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "video/webm", ext: "webm" };
}

/**
 * Re-encode the silent canvas WebM with beat audio baked in using ffmpeg.wasm.
 *
 * Why ffmpeg.wasm and not the browser's MediaRecorder?
 * The previous approach loaded the source WebM into a hidden <video> element,
 * played it back at 2× into a capture canvas, and re-recorded into MediaRecorder.
 * That pipeline is unreliable across browsers: fragmented MP4 output, frame
 * dropouts on hidden videos, codec mismatches, ~4KB empty outputs, etc.
 *
 * ffmpeg.wasm produces a real H.264/AAC MP4 from the source bytes directly.
 * No playback simulation, no DOM, no frame capture race conditions. This is
 * how Procreate, etc. work — file-level transformation, not real-time replay.
 */
export async function exportTimelapseWithAudio(opts: ExportOptions): Promise<ExportResult> {
  const { videoBlob, beatPattern, onProgress } = opts;
  const filename = opts.filename ?? `lovebomb-timelapse-${Date.now()}`;
  const SPEED_MULTIPLIER = 2; // Procreate-style 2×

  // Compute source duration so we can render audio for the OUTPUT length.
  // Output length = sourceDuration / speed.
  const srcDuration = await probeVideoDuration(videoBlob);
  const outputDuration = srcDuration / SPEED_MULTIPLIER;
  console.log(`[Export] source: ${srcDuration.toFixed(1)}s, ${SPEED_MULTIPLIER}× → output: ${outputDuration.toFixed(1)}s`);
  onProgress?.(0.05);

  // Render the beat to an AudioBuffer matching the OUTPUT duration.
  let audioBuffer: AudioBuffer | null = null;
  if (beatPattern && beatPattern.tracks.some((t) => t.pattern.some(Boolean))) {
    try {
      const tmpCtx = new AudioContext();
      audioBuffer = await renderBeatPatternToBuffer(beatPattern, outputDuration, tmpCtx.sampleRate);
      tmpCtx.close().catch(() => {});
    } catch (err) {
      console.warn("[Export] beat render failed, exporting silent:", err);
    }
  }
  onProgress?.(0.15);

  // Mux with ffmpeg.wasm
  const { muxTimelapseWithBeat } = await import("@/lib/ffmpegMux");
  const result = await muxTimelapseWithBeat({
    videoBlob,
    audioBuffer,
    speedMultiplier: SPEED_MULTIPLIER,
    onProgress: (p) => onProgress?.(0.15 + 0.85 * p),
  });

  return { blob: result.blob, mimeType: result.mimeType, filename: `${filename}.${result.ext}` };
}

/**
 * Probe a video blob's duration without playing it. Loads metadata only,
 * uses the seek-to-end trick to coerce browsers that report Infinity for
 * canvas-captured WebMs.
 */
async function probeVideoDuration(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  video.src = url;
  document.body.appendChild(video);
  Object.assign(video.style, {
    position: "fixed", left: "-99999px", top: "0",
    width: "2px", height: "2px", opacity: "0.01", pointerEvents: "none",
  } as CSSStyleDeclaration);

  try {
    await new Promise<void>((resolve, reject) => {
      const ok = () => { video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", err); resolve(); };
      const err = () => { video.removeEventListener("loadedmetadata", ok); video.removeEventListener("error", err); reject(new Error("video metadata failed")); };
      video.addEventListener("loadedmetadata", ok);
      video.addEventListener("error", err);
      setTimeout(resolve, 5000); // safety
    });

    let dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (dur <= 0) {
      await new Promise<void>((resolve) => {
        const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
        video.addEventListener("seeked", onSeek);
        try { video.currentTime = 1e10; } catch { resolve(); }
        setTimeout(() => { video.removeEventListener("seeked", onSeek); resolve(); }, 2000);
      });
      dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 30;
    }
    return Math.max(1, dur);
  } finally {
    URL.revokeObjectURL(url);
    try { document.body.removeChild(video); } catch { /* swallow */ }
  }
}

/**
 * @deprecated Old playback-based export pipeline. Kept for reference only.
 * Use exportTimelapseWithAudio (ffmpeg.wasm path) instead.
 */
async function _legacyExportTimelapseWithAudio(opts: ExportOptions): Promise<ExportResult> {
  const { videoBlob, beatPattern, width, height, onProgress } = opts;
  const filename = opts.filename ?? `lovebomb-timelapse-${Date.now()}`;

  // Step 1: load video into a DOM-attached <video> element.
  // CRITICAL: must be in the DOM with non-zero box for browsers to actually
  // decode + paint frames (so we can draw it into our capture canvas).
  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText =
    "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;";
  document.body.appendChild(video);

  // Wait for actual frame data, not just metadata
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onErr);
      reject(new Error("Failed to load recorded video"));
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onErr);
  });

  // Duration: WebM from canvas.captureStream often reports Infinity until we
  // seek past the end. Use the seek trick, then snap currentTime back to 0.
  let duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (duration <= 0) {
    await new Promise<void>((resolve) => {
      const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
      video.addEventListener("seeked", onSeek);
      try { video.currentTime = 1e10; } catch { resolve(); }
      // Safety: don't hang forever on browsers that swallow the seek
      setTimeout(() => { video.removeEventListener("seeked", onSeek); resolve(); }, 2000);
    });
    duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 30;
    // Snap back to 0 and wait for that seek to complete too
    await new Promise<void>((resolve) => {
      const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
      video.addEventListener("seeked", onSeek);
      try { video.currentTime = 0; } catch { resolve(); }
      setTimeout(() => { video.removeEventListener("seeked", onSeek); resolve(); }, 1000);
    });
  }
  // Floor at 1s to avoid div-by-zero. NO upper cap — we want the whole session.
  duration = Math.max(duration, 1);

  // Always reset to start before playback (regardless of which path computed duration).
  // Without this, some browsers leave currentTime at the seek-trick end-of-file value.
  if (video.currentTime > 0.1) {
    await new Promise<void>((resolve) => {
      const onSeek = () => { video.removeEventListener("seeked", onSeek); resolve(); };
      video.addEventListener("seeked", onSeek);
      try { video.currentTime = 0; } catch { resolve(); }
      setTimeout(() => { video.removeEventListener("seeked", onSeek); resolve(); }, 1000);
    });
  }

  // ─── Timelapse speedup ───
  // Procreate-style fixed 2× playback. Whole session, played back at double speed.
  // (A 3-min session → 1.5-min video. A 10-min session → 5-min video.)
  const playbackRate = 2;
  const outputDuration = duration / playbackRate;
  console.log(
    "[Export] source duration:", duration.toFixed(1) + "s",
    "→ playbackRate:", playbackRate.toFixed(2) + "×",
    "→ output:", outputDuration.toFixed(1) + "s",
    "videoSize:", video.videoWidth + "x" + video.videoHeight,
  );

  onProgress?.(0.1);

  // Step 2: render beat audio offline to an AudioBuffer.
  // Render for the OUTPUT duration (not source) so it matches the sped-up video.
  const audioCtx = new AudioContext();
  let beatBuffer: AudioBuffer | null = null;
  if (beatPattern && beatPattern.tracks.some((t) => t.pattern.some(Boolean))) {
    try {
      beatBuffer = await renderBeatPatternToBuffer(beatPattern, outputDuration, audioCtx.sampleRate);
    } catch (err) {
      console.warn("[Export] Failed to render beat audio, exporting silent:", err);
    }
  }

  onProgress?.(0.3);

  // Step 3: build a "capture canvas" — we draw the video into this every frame
  // and capture from IT. This is reliable across browsers (unlike <video>.captureStream).
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = width;
  captureCanvas.height = height;
  const ctx2d = captureCanvas.getContext("2d", { alpha: false });
  if (!ctx2d) throw new Error("Could not get 2D context for export canvas");
  // Paint a white background so the first frame is never transparent/black
  ctx2d.fillStyle = "#FFFFFF";
  ctx2d.fillRect(0, 0, width, height);

  // captureStream from our canvas at 30fps → smooth, controllable video stream
  const canvasCaptureFn = (captureCanvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  }).captureStream;
  if (!canvasCaptureFn) throw new Error("canvas.captureStream not supported in this browser");
  const videoStream = canvasCaptureFn.call(captureCanvas, 30);
  const videoTracks = videoStream.getVideoTracks();

  // Audio destination
  const audioDest = audioCtx.createMediaStreamDestination();
  let bufferSource: AudioBufferSourceNode | null = null;
  if (beatBuffer) {
    bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = beatBuffer;
    bufferSource.connect(audioDest);
  }
  const audioTracks = audioDest.stream.getAudioTracks();

  // Combine
  const combined = new MediaStream([...videoTracks, ...audioTracks]);

  // Step 4: pick output mime, set up MediaRecorder
  const { mime, ext } = pickOutputMimeType();
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  // Step 5: play video, draw frames into capture canvas via RAF, record
  await new Promise<void>((resolve, reject) => {
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let hardTimeout: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let stopped = false;
    let framesDrawn = 0;

    const stopRecorder = (reason: string) => {
      if (stopped) return;
      stopped = true;
      console.log(`[Timelapse export] stopping recorder: ${reason} (${framesDrawn} frames drawn)`);
      try { recorder.stop(); } catch { /* swallow */ }
    };

    const cleanup = () => {
      if (progressTimer) clearInterval(progressTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
      try { video.pause(); } catch { /* swallow */ }
      try { bufferSource?.stop(); } catch { /* swallow */ }
      try { videoTracks.forEach((t) => t.stop()); } catch { /* swallow */ }
      try { document.body.removeChild(video); } catch { /* swallow */ }
      URL.revokeObjectURL(videoUrl);
      audioCtx.close().catch(() => {});
    };
    recorder.onstop = () => { cleanup(); resolve(); };
    recorder.onerror = (e) => { cleanup(); reject(e); };
    video.onended = () => {
      // Give the canvas one more draw + 200ms to flush the final chunk
      setTimeout(() => stopRecorder("video.onended"), 200);
    };

    // Continuous draw loop — copies current video frame into capture canvas
    const drawFrame = () => {
      if (stopped) return;
      try {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          ctx2d.drawImage(video, 0, 0, width, height);
          framesDrawn++;
        }
      } catch (err) {
        console.warn("[Export] drawImage failed:", err);
      }
      rafId = requestAnimationFrame(drawFrame);
    };

    try {
      // Start drawing BEFORE recorder.start so the first captured frame is real
      drawFrame();
      recorder.start(500);
      bufferSource?.start(0);
      // Apply timelapse speedup. Set BEFORE play() and again right after,
      // because some browsers reset playbackRate when play() resolves.
      try { video.playbackRate = playbackRate; } catch { /* swallow */ }
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => { try { video.playbackRate = playbackRate; } catch { /* swallow */ } })
          .catch((err) => {
            console.error("[Export] video.play() rejected:", err);
            reject(err);
          });
      }
      const startedAt = performance.now();

      // HARD TIMEOUT: stop after outputDuration + 3s real time so we never hang.
      // Note: outputDuration = sourceDuration / playbackRate, so this matches real wall time.
      hardTimeout = setTimeout(() => {
        stopRecorder(`hard timeout @ ${(outputDuration + 3).toFixed(1)}s`);
      }, (outputDuration + 3) * 1000);

      progressTimer = setInterval(() => {
        const elapsedSec = (performance.now() - startedAt) / 1000;
        const elapsedRatio = Math.min(elapsedSec / outputDuration, 1);
        onProgress?.(0.3 + 0.65 * elapsedRatio);
        // Backup check: if video reports ended OR currentTime is at end, stop.
        if (video.ended || (video.currentTime >= duration - 0.2)) {
          stopRecorder("backup ended check");
        }
      }, 250);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });

  onProgress?.(1);

  const blob = new Blob(chunks, { type: mime });
  return { blob, mimeType: mime, filename: `${filename}.${ext}` };
}

/**
 * Record the CURRENT canvas state (static image) with beat audio mixed in.
 * Used by the "Save as MP4" button — produces a short video with the collage
 * as a still frame and one full loop of the beat playing on top.
 *
 * Returns a real MP4 (H.264 + AAC) when the browser supports it, otherwise a
 * WebM. Either way, the file extension MATCHES the actual container so
 * QuickTime / VLC / etc. open it correctly.
 */
export async function exportCanvasWithBeat(opts: {
  canvas: HTMLCanvasElement;
  beatPattern?: BeatPattern | null;
  filename?: string;
  /** How long to record. Defaults to ~4s, or 1 loop of the beat (whichever is longer, capped at 12s). */
  durationSeconds?: number;
}): Promise<ExportResult> {
  const { canvas, beatPattern } = opts;
  const filename = opts.filename ?? `lovebomb-${Date.now()}`;
  const durationSec = Math.max(1, Math.min(12, opts.durationSeconds ?? 4));

  // Audio first
  const audioCtx = new AudioContext();
  let beatBuffer: AudioBuffer | null = null;
  if (beatPattern && beatPattern.tracks.some((t) => t.pattern.some(Boolean))) {
    try {
      beatBuffer = await renderBeatPatternToBuffer(beatPattern, durationSec, audioCtx.sampleRate);
    } catch (err) {
      console.warn("[ExportCanvas] beat render failed, exporting silent:", err);
    }
  }

  // Video stream from the canvas (30fps for smooth playback)
  const captureFn = (canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  }).captureStream;
  if (!captureFn) throw new Error("canvas.captureStream not supported");
  const videoStream = captureFn.call(canvas, 30);
  const videoTracks = videoStream.getVideoTracks();

  const audioDest = audioCtx.createMediaStreamDestination();
  let bufferSource: AudioBufferSourceNode | null = null;
  if (beatBuffer) {
    bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = beatBuffer;
    bufferSource.connect(audioDest);
  }
  const audioTracks = audioDest.stream.getAudioTracks();
  const combined = new MediaStream([...videoTracks, ...audioTracks]);

  // Pick a real codec. CRITICAL: the file extension MUST match the actual
  // container — labeling a WebM blob as ".mp4" makes QuickTime reject it.
  const { mime, ext } = pickOutputMimeType();
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  await new Promise<void>((resolve, reject) => {
    let stopped = false;
    let rafId: number | null = null;
    const cleanup = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      try { bufferSource?.stop(); } catch { /* swallow */ }
      try { videoTracks.forEach((t) => t.stop()); } catch { /* swallow */ }
      audioCtx.close().catch(() => {});
    };
    recorder.onstop = () => { cleanup(); resolve(); };
    recorder.onerror = (e) => { cleanup(); reject(e); };

    // Force the canvas to repaint each frame so MediaRecorder gets a continuous
    // stream of frames (a static canvas wouldn't emit any after the first paint).
    const repaint = () => {
      if (stopped) return;
      try {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Trigger a no-op draw to mark the canvas dirty
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "rgba(0,0,0,0)";
          ctx.fillRect(0, 0, 1, 1);
          ctx.restore();
        }
      } catch { /* swallow */ }
      rafId = requestAnimationFrame(repaint);
    };

    try {
      recorder.start(500);
      bufferSource?.start(0);
      repaint();
      setTimeout(() => {
        stopped = true;
        try { recorder.stop(); } catch { /* swallow */ }
      }, durationSec * 1000);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });

  const blob = new Blob(chunks, { type: mime });
  return { blob, mimeType: mime, filename: `${filename}.${ext}` };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Re-export width/height from CANVAS_SIZES for callers
export { CANVAS_SIZES } from "@/lib/types";
