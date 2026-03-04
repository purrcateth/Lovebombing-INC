import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { StickerCategory, StickerItem } from "@/lib/types";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function prettifyName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, "");
  const normalized = withoutExt
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : "Sticker";
}

function detectCategory(fileName: string): string {
  const name = fileName.toLowerCase();
  if (/(heart|love|xoxo|kiss)/.test(name)) return "Hearts & Love";
  if (/(star|sparkle|glitter|shine|moon|sun)/.test(name)) return "Stars & Sparkles";
  if (/(rose|flower|daisy|tulip|sunflower|petal)/.test(name)) return "Flowers";
  if (/(cat|dog|bear|bunny|frog|animal|kitty|puppy)/.test(name)) return "Cute Animals";
  if (/(pizza|cookie|coffee|ice|cream|drink|food|cake)/.test(name)) return "Food & Drink";
  if (/(bubble|text|best|miss|bff|quote|word)/.test(name)) return "Text Bubbles";
  if (/(emoji|smile|laugh|wink|cry|face)/.test(name)) return "Emojis";
  return "Misc Fun";
}

export async function GET() {
  try {
    const stickersDir = path.join(process.cwd(), "public", "stickers");
    const entries = await readdir(stickersDir, { withFileTypes: true });

    const stickerFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    const grouped = new Map<string, StickerItem[]>();

    for (const fileName of stickerFiles) {
      const category = detectCategory(fileName);
      const current = grouped.get(category) ?? [];
      current.push({
        name: prettifyName(fileName),
        src: `/stickers/${encodeURIComponent(fileName)}`,
      });
      grouped.set(category, current);
    }

    const categories: StickerCategory[] = Array.from(grouped.entries()).map(([name, stickers]) => ({
      name,
      stickers,
    }));

    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
}
