export function App(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Reframe demo</p>
        <h1 className="text-4xl font-semibold">React + TypeScript + Tailwind</h1>
      </header>
      <section id="pricing-grid" className="grid gap-4 md:grid-cols-3">
        <article id="card-annual" className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 w-80">
          <h2 className="text-xl font-medium">Annual</h2>
          <p className="mt-2 text-slate-300">Resize this card in Reframe to edit the Tailwind width token in source.</p>
        </article>
      </section>
    </main>
  );
}
