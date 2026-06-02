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
          rel="preload"
          href="/fonts/ChiKareGo2.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/TAYBang.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/TAYSundaeRegular.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Cormorant+Garamond:wght@300;400&family=VT323&family=B612+Mono&display=swap"
          rel="stylesheet"
        />
        {/* Preload the landing-page background at full original resolution.
           Other page backgrounds load lazily when navigated to. */}
        <link rel="preload" href="/backgrounds/welcomepage.png" as="image" fetchPriority="high" />
      </head>
      <body>{children}</body>
    </html>
  );
}
