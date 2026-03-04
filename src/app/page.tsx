import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-10">
      <section className="lb-card mx-auto flex min-h-[86vh] w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-[#b25266]">Lovebombing, Inc.</p>
        <h1 className="lb-title text-6xl leading-[0.95] text-[#8e2740] sm:text-7xl">
          Lovebombing, INC.
        </h1>
        <p className="max-w-2xl text-base text-[#6d4250] sm:text-lg">
          show love through handmade digital art ✨
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/create"
            className="lb-btn lb-btn-primary"
          >
            Create a Lovebomb 💣
          </Link>
          <Link
            href="/bomb/demo"
            className="lb-btn lb-btn-secondary"
          >
            View Example
          </Link>
        </div>
      </section>
    </main>
  );
}
