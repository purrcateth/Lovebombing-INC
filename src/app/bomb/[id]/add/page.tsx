"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

export default function AddToBombPage() {
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [bomb, setBomb] = useState<{
    canvas_json: object;
    layers: { canvas_json: object }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchBomb = async () => {
      try {
        const res = await fetch(`/api/bombs/${id}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setBomb(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchBomb();
  }, [id]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="lb-card px-8 py-6">
          <p className="text-lg font-medium text-[#7a4150]">Loading...</p>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="lb-card w-full max-w-lg px-8 py-10 text-center">
          <p className="text-6xl">💔</p>
          <h1 className="lb-title mt-2 text-6xl text-[#8e2740]">This lovebomb doesn&apos;t exist</h1>
          <div className="mt-6">
            <Link href="/create" className="lb-btn lb-btn-primary inline-flex">
              Create Your Own 💌
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!nameSubmitted) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 py-10">
        <div className="lb-card w-full max-w-xl px-7 py-10 text-center sm:px-12">
          <p className="text-sm uppercase tracking-[0.2em] text-[#b25266]">Collaborative mode</p>
          <h1 className="lb-title mt-2 text-6xl leading-none text-[#8e2740] sm:text-7xl">Add Your Lovebombs ✨</h1>
          <p className="mt-3 text-sm text-[#8a5563]">What&apos;s your name?</p>

          <form
            className="mt-7 space-y-4 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) setNameSubmitted(true);
            }}
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoFocus
              className="w-full rounded-2xl border border-[#ffc4d0] bg-white px-4 py-3 outline-none focus:border-[#ff90a6]"
              placeholder="Type your name"
            />
            <button type="submit" disabled={!name.trim()} className="lb-btn lb-btn-primary w-full disabled:opacity-50">
              Let&apos;s go
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <CanvasEditor
      bombId={id}
      creatorName={name.trim()}
      isCollaborative
      backgroundCanvasJson={bomb?.canvas_json || null}
      backgroundLayers={bomb?.layers?.map((l) => l.canvas_json) || []}
    />
  );
}
