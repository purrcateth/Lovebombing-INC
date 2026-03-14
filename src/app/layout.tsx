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
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Cormorant+Garamond:wght@300;400&family=VT323&family=B612+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
