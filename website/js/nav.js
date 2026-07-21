export function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

export function initCopyButtons() {
  const buttons = document.querySelectorAll(".copy-cmd");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("npx reframe");
        const label = btn.querySelector(".copy-label");
        const prev = label?.textContent;
        if (label) label.textContent = "Copied!";
        setTimeout(() => { if (label && prev) label.textContent = prev; }, 2000);
      } catch {
        /* clipboard unavailable */
      }
    });
  });
}
