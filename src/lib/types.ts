export type CanvasSize = "square" | "landscape" | "vertical";

export interface CanvasSizeSpec {
  id: CanvasSize;
  label: string;
  subtitle: string;
  width: number;
  height: number;
  aspectLabel: string;
}

export const CANVAS_SIZES: Record<CanvasSize, CanvasSizeSpec> = {
  square: {
    id: "square",
    label: "Square",
    subtitle: "Polaroid",
    width: 1080,
    height: 1080,
    aspectLabel: "1:1",
  },
  landscape: {
    id: "landscape",
    label: "Landscape",
    subtitle: "Screen",
    width: 1920,
    height: 1080,
    aspectLabel: "16:9",
  },
  vertical: {
    id: "vertical",
    label: "Vertical",
    subtitle: "Phone",
    width: 1080,
    height: 1920,
    aspectLabel: "9:16",
  },
};

export interface Bomb {
  id: string;
  creator_name: string;
  canvas_json: object;
  canvas_size?: CanvasSize | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BombLayer {
  id: string;
  bomb_id: string;
  contributor_name: string;
  canvas_json: object;
  beat_data?: BeatPattern | null;
  created_at: string;
}

export interface BeatPattern {
  bpm: number;
  steps: number;
  tracks: BeatTrack[];
  _recordings?: Record<string, string>; // instrumentKey → base64 WAV data
}

export interface BeatTrack {
  name: string;
  instrument: string;
  pattern: boolean[];
  volume: number;
}

export interface StickerCategory {
  name: string;
  stickers: StickerItem[];
}

export interface StickerItem {
  name: string;
  src: string;
}
