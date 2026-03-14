import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lovebombing - Send Digital Love Notes",
  description:
    "Create handmade digital love notes and share them with anyone through a link.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preload fonts for instant rendering */}
        <link
          rel="preload"
          href="/fonts/AppleGaramond-Light.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Cormorant+Garamond:wght@300;400&family=VT323&family=B612+Mono&display=swap"
          rel="stylesheet"
        />
        {/* Preload key background images */}
        <link rel="preload" href="/backgrounds/welcomepage.png" as="image" />
        <link rel="preload" href="/backgrounds/lovebombing_cloudsbg.png" as="image" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
