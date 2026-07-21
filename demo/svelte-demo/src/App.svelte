<script>
  const plans = [
    { id: "starter", name: "Starter", description: "For small experiments." },
    { id: "annual", name: "Annual", description: "The official edit target." },
    { id: "enterprise", name: "Enterprise", description: "For growing teams." },
  ];
</script>

<header id="site-header"><strong>Reframe Demo</strong><nav aria-label="Primary">Pricing</nav></header>
<main>
  <section id="hero">
    <p class="eyebrow">Visual development, grounded in source</p>
    <h1>Edit the interface you are actually running.</h1>
    <button id="primary-cta" type="button">Start building</button>
  </section>
  <section id="pricing-grid" aria-label="Pricing plans">
    {#each plans as plan (plan.id)}
      <article
        id="card-{plan.id}"
        data-plan={plan.id}
        class="pricing-card"
        class:pricing-card--annual={plan.id === "annual"}
      >
        <h2>{plan.name}</h2>
        <p>{plan.description}</p>
      </article>
    {/each}
  </section>
</main>
<footer id="site-footer">Built for deterministic testing.</footer>
