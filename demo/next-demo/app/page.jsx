const plans = [
  { id: "starter", name: "Starter", description: "For small experiments." },
  { id: "annual", name: "Annual", description: "The official edit target." },
  { id: "enterprise", name: "Enterprise", description: "For growing teams." },
];

export default function Page() {
  return (
    <>
      <header id="site-header"><strong>Reframe Demo</strong><nav aria-label="Primary">Pricing</nav></header>
      <main>
        <section id="hero">
          <p className="eyebrow">Visual development, grounded in source</p>
          <h1>Edit the interface you are actually running.</h1>
          <button id="primary-cta" type="button">Start building</button>
        </section>
        <section id="pricing-grid" aria-label="Pricing plans">
          {plans.map((plan) => (
            <article
              key={plan.id}
              id={`card-${plan.id}`}
              data-plan={plan.id}
              className={plan.id === "annual" ? "pricing-card pricing-card--annual" : "pricing-card"}
            >
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
            </article>
          ))}
        </section>
      </main>
      <footer id="site-footer">Built for deterministic testing.</footer>
    </>
  );
}
