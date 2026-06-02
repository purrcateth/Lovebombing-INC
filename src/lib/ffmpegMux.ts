// ffmpeg.wasm-backed timelapse muxing
// -------------------------------------
// Replaces the broken "play hidden video + re-record" pipeline. Instead:
//   1. Take the raw source WebM (already perfectly recorded by canvas.captureStream).
//   2. Take the rendered beat AudioBuffer (already perfectly synthesized offline).
//   3. Use ffmpeg.wasm to apply 2× speed to the video AND mux in the audio,
//      producing a real H.264/AAC MP4 that opens in QuickTime, VLC, etc.
//
// ffmpeg.wasm is lazy-loaded on first use (~30MB CDN download, then browser-cached).

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** Lazy-load and cache the ffmpeg.wasm instance. Subsequent calls return the same instance. */
async function getFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      // ffmpeg is chatty; only surface meaningful lines
      if (message.includes("Error") || message.includes("error") || message.includes("frame=")) {
        console.log("[ffmpeg]", message);
      }
    });

    onProgress?.("Loading ffmpeg core (~30MB, one-time)...");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

/**
 * Encode an AudioBuffer to a 16-bit PCM WAV blob (so ffmpeg can read it).
 * WAV is the simplest format that ffmpeg understands without extra codec.
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numFrames * numChannels * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeStr(view, 8, "WAVE");

  // fmt chunk
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Interleaved 16-bit PCM samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export interface MuxOptions {
  /** Source canvas recording (video/webm) */
  videoBlob: Blob;
  /** Beat audio (already rendered for the FINAL output duration). Optional — null/undefined for silent. */
  audioBuffer?: AudioBuffer | null;
  /** Playback speed multiplier (2 = Procreate-style 2× timelapse). */
  speedMultiplier?: number;
  /** Progress callback 0..1 */
  onProgress?: (progress: number, message?: string) => void;
}

export interface MuxResult {
  blob: Blob;
  mimeType: string;
  ext: "mp4";
}

/**
 * Mux source webm + beat audio into a real MP4 with ffmpeg.wasm.
 * Output is H.264 video + AAC audio in an MP4 container — playable everywhere.
 */
export async function muxTimelapseWithBeat(opts: MuxOptions): Promise<MuxResult> {
  const speed = opts.speedMultiplier ?? 2;
  const { onProgress } = opts;

  onProgress?.(0.05, "Loading encoder...");
  const ffmpeg = await getFFmpeg((msg) => onProgress?.(0.05, msg));

  onProgress?.(0.2, "Preparing video...");
  await ffmpeg.writeFile("input.webm", await fetchFile(opts.videoBlob));

  let hasAudio = false;
  if (opts.audioBuffer && opts.audioBuffer.length > 0) {
    onProgress?.(0.3, "Preparing audio...");
    const wavBlob = audioBufferToWav(opts.audioBuffer);
    await ffmpeg.writeFile("input.wav", await fetchFile(wavBlob));
    hasAudio = true;
  }

  // Build ffmpeg command:
  //   - setpts=PTS/N  → speed up video by N×
  //   - libx264 + yuv420p → universal MP4 video that QuickTime opens
  //   - faststart → moov atom at the front so the file streams (and players don't error)
  //   - shortest → stop when shortest input ends (so we don't loop the audio past the video)
  //   - preset ultrafast → fastest encoding (we're in a browser, time matters more than file size)
  const cmd: string[] = ["-i", "input.webm"];
  if (hasAudio) cmd.push("-i", "input.wav");
  cmd.push(
    "-filter:v", `setpts=PTS/${speed}`,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
  );
  if (hasAudio) {
    cmd.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  } else {
    cmd.push("-an");
  }
  cmd.push("-y", "output.mp4");

  // Wire up encoder progress (ffmpeg fires `progress` events with 0..1)
  const onFFProgress = ({ progress }: { progress: number }) => {
    // progress can briefly exceed 1, clamp it
    const p = Math.max(0, Math.min(1, progress));
    onProgress?.(0.3 + 0.65 * p, `Encoding ${Math.round(p * 100)}%`);
  };
  ffmpeg.on("progress", onFFProgress);
  try {
    console.log("[Mux] running ffmpeg:", cmd.join(" "));
    await ffmpeg.exec(cmd);
  } finally {
    ffmpeg.off("progress", onFFProgress);
  }

  onProgress?.(0.97, "Reading output...");
  const data = await ffmpeg.readFile("output.mp4");
  // data is Uint8Array (binary mode); wrap as Blob
  // Copy into a fresh ArrayBuffer to satisfy strict ArrayBuffer-only Blob types
  let buf: ArrayBuffer;
  if (typeof data === "string") {
    const enc = new TextEncoder().encode(data);
    buf = enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer;
  } else {
    const u8 = data as Uint8Array;
    buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  }
  const blob = new Blob([buf], { type: "video/mp4" });

  // Cleanup virtual fs
  try { await ffmpeg.deleteFile("input.webm"); } catch { /* swallow */ }
  if (hasAudio) { try { await ffmpeg.deleteFile("input.wav"); } catch { /* swallow */ } }
  try { await ffmpeg.deleteFile("output.mp4"); } catch { /* swallow */ }

  onProgress?.(1, "Done");
  console.log("[Mux] complete, output size:", blob.size, "bytes");
  return { blob, mimeType: "video/mp4", ext: "mp4" };
}
