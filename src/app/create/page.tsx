"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/bombs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_name: name.trim() }),
      });
      const data = await res.json();
      router.push(`/create/${data.id}`);
    } catch {
      alert("Something went wrong. Please try again!");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="lb-card w-full max-w-xl px-7 py-10 text-center sm:px-12">
        <h1 className="lb-title text-6xl leading-none text-[#8e2740] sm:text-7xl">Lovebombing, INC.</h1>
        <p className="mt-3 text-sm text-[#8a5563]">show love through handmade digital art ✨</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
          <label className="block text-sm font-semibold text-[#8e2740]">What&apos;s your name?</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoFocus
            className="w-full rounded-2xl border border-[#ffc4d0] bg-white px-4 py-3 outline-none focus:border-[#ff90a6]"
            placeholder="Type your name"
          />
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="lb-btn lb-btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Creating..." : "Let’s go! 💣"}
          </button>
        </form>
      </div>
    </main>
  );
}
