export interface Bomb {
  id: string;
  creator_name: string;
  canvas_json: object;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BombLayer {
  id: string;
  bomb_id: string;
  contributor_name: string;
  canvas_json: object;
  created_at: string;
}

export interface StickerCategory {
  name: string;
  stickers: StickerItem[];
}

export interface StickerItem {
  name: string;
  src: string;
}
