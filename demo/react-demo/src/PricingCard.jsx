export function PricingCard({ id, name, description }) {
  const annualMarker = id === "annual" ? "annual-plan" : undefined;
  return <article id={`card-${id}`} className={`pricing-card pricing-card--${id}`} data-plan={id} data-reframe-edit-target={annualMarker}><h2>{name}</h2><p>{description}</p></article>;
}
