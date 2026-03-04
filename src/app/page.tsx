import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">Lovebombing, Inc.</p>
        <h1 className="text-4xl font-semibold leading-tight text-neutral-900 sm:text-5xl">
          Send handmade digital love notes
        </h1>
        <p className="max-w-2xl text-base text-neutral-600 sm:text-lg">
          Create collage-style messages with stickers and text, then share each lovebomb with a
          private link.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/create"
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Create a Lovebomb
          </Link>
          <Link
            href="/bomb/demo"
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
          >
            View Example
          </Link>
        </div>
      </section>
    </main>
  );
}
