import { Navbar } from "./Navbar.jsx";
import { Hero } from "./Hero.jsx";
import { PricingCard } from "./PricingCard.jsx";

const plans = [
  { id: "starter", name: "Starter", description: "For small experiments." },
  { id: "annual", name: "Annual", description: "The official edit target." },
  { id: "enterprise", name: "Enterprise", description: "For growing teams." },
];

export function App() {
  return <><Navbar /><main><Hero /><section id="pricing-grid" aria-label="Pricing plans">{plans.map((plan) => <PricingCard key={plan.id} {...plan} />)}</section></main><footer id="site-footer">Built for deterministic testing.</footer></>;
}
