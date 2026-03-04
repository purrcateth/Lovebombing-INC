import { Metadata } from "next";
import Link from "next/link";
import BombViewer from "@/components/BombViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getBomb(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${baseUrl}/api/bombs/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bomb = await getBomb(id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!bomb) return { title: "Lovebomb not found" };

  return {
    title: "You received a Lovebomb! 💣💕",
    description: `Open to see what ${bomb.creator_name} made for you`,
    openGraph: {
      title: "You received a Lovebomb! 💣💕",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [{ url: `${baseUrl}/api/og/${id}`, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "You received a Lovebomb! 💣💕",
      description: `Open to see what ${bomb.creator_name} made for you`,
      images: [`${baseUrl}/api/og/${id}`],
    },
  };
}

export default async function BombPage({ params }: PageProps) {
  const { id } = await params;
  const bomb = await getBomb(id);

  if (!bomb) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <section className="lb-card w-full max-w-lg px-8 py-10 text-center">
          <p className="text-6xl">💔</p>
          <h1 className="lb-title mt-2 text-6xl text-[#8e2740]">This lovebomb doesn&apos;t exist</h1>
          <p className="mt-3 text-[#7a4c58]">Try sending a fresh one to someone special.</p>
          <div className="mt-6">
            <Link href="/create" className="lb-btn lb-btn-primary inline-flex">
              Create your own 💌
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="px-5 py-10">
      <section className="lb-card mx-auto w-full max-w-3xl px-5 py-6 sm:px-8">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-[#b25266]">You received a lovebomb</p>
        <h1 className="lb-title mt-2 text-center text-5xl text-[#8e2740] sm:text-6xl">
          A lovebomb from {bomb.creator_name} 💣💕
        </h1>

        <div className="mt-6">
          <BombViewer canvasJson={bomb.canvas_json} layers={bomb.layers || []} />
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/bomb/${id}/add`} className="lb-btn lb-btn-primary">
            Add Your Lovebombs ✨
          </Link>
          <Link href="/create" className="lb-btn lb-btn-secondary">
            Create Your Own 💌
          </Link>
        </div>
      </section>
    </main>
  );
}
