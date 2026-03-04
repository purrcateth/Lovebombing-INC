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
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=DM+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
