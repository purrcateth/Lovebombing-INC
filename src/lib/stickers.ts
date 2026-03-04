import { StickerCategory } from "./types";

// These use emoji-based SVG stickers generated inline.
// In production, replace with real PNG files in /public/stickers/
export const stickerCategories: StickerCategory[] = [
  {
    name: "Hearts & Love",
    stickers: [
      { name: "Red Heart", src: "/stickers/heart-red.svg" },
      { name: "Pink Heart", src: "/stickers/heart-pink.svg" },
      { name: "Sparkle Heart", src: "/stickers/heart-sparkle.svg" },
      { name: "Heart Eyes", src: "/stickers/heart-eyes.svg" },
    ],
  },
  {
    name: "Stars & Sparkles",
    stickers: [
      { name: "Gold Star", src: "/stickers/star-gold.svg" },
      { name: "Shooting Star", src: "/stickers/shooting-star.svg" },
      { name: "Sparkle", src: "/stickers/sparkle.svg" },
      { name: "Rainbow", src: "/stickers/rainbow.svg" },
    ],
  },
  {
    name: "Flowers",
    stickers: [
      { name: "Daisy", src: "/stickers/daisy.svg" },
      { name: "Rose", src: "/stickers/rose.svg" },
      { name: "Sunflower", src: "/stickers/sunflower.svg" },
      { name: "Tulip", src: "/stickers/tulip.svg" },
    ],
  },
  {
    name: "Cute Animals",
    stickers: [
      { name: "Cat", src: "/stickers/cat.svg" },
      { name: "Dog", src: "/stickers/dog.svg" },
      { name: "Bunny", src: "/stickers/bunny.svg" },
      { name: "Bear", src: "/stickers/bear.svg" },
    ],
  },
  {
    name: "Food & Drink",
    stickers: [
      { name: "Coffee", src: "/stickers/coffee.svg" },
      { name: "Pizza", src: "/stickers/pizza.svg" },
      { name: "Ice Cream", src: "/stickers/ice-cream.svg" },
      { name: "Cookie", src: "/stickers/cookie.svg" },
    ],
  },
  {
    name: "Text Bubbles",
    stickers: [
      { name: "I Love You", src: "/stickers/bubble-love.svg" },
      { name: "You're The Best", src: "/stickers/bubble-best.svg" },
      { name: "Miss You", src: "/stickers/bubble-miss.svg" },
      { name: "XOXO", src: "/stickers/bubble-xoxo.svg" },
    ],
  },
  {
    name: "Emojis",
    stickers: [
      { name: "Smiley", src: "/stickers/emoji-smiley.svg" },
      { name: "Laughing", src: "/stickers/emoji-laughing.svg" },
      { name: "Blushing", src: "/stickers/emoji-blushing.svg" },
      { name: "Winking", src: "/stickers/emoji-winking.svg" },
    ],
  },
  {
    name: "Misc",
    stickers: [
      { name: "Crown", src: "/stickers/crown.svg" },
      { name: "Bow", src: "/stickers/bow.svg" },
      { name: "Butterfly", src: "/stickers/butterfly.svg" },
      { name: "Cloud", src: "/stickers/cloud.svg" },
    ],
  },
];
