"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CanvasEditor from "@/components/CanvasEditor";

export default function CanvasPage() {
  const params = useParams();
  const id = params.id as string;
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBomb = async () => {
      try {
        const res = await fetch(`/api/bombs/${id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setCreatorName(data.creator_name);
      } catch {
        setCreatorName("Anonymous");
      } finally {
        setLoading(false);
      }
    };
    fetchBomb();
  }, [id]);

  if (loading) {
    return (
      <div className="bg-canvas flex min-h-screen items-center justify-center px-5">
        <div className="lb-card px-8 py-6">
          <p className="text-lg font-medium text-[#7a4150]">Loading your canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <CanvasEditor bombId={id} creatorName={creatorName || "Anonymous"} />
  );
}
