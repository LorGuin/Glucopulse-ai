// Video "Cómo funciona GlucoPulse" (archivos en public/videos/).
//  - teaserHtml(): versión corta (≈23 s), sin sonido y en loop, para la
//    pantalla de inicio. Pesa ~300 KB.
//  - openHowItWorksVideo(): video completo (1 min, con música) en una
//    ventana. Se descarga recién cuando la persona lo abre.
//  - WelcomeVideoCard: aviso que aparece UNA sola vez dentro de la app.

const FULL_SRC = "/videos/como-funciona.mp4";
const FULL_POSTER = "/videos/como-funciona.jpg";
const TEASER_SRC = "/videos/como-funciona-corto.mp4";
const TEASER_POSTER = "/videos/como-funciona-corto.jpg";
const WELCOME_KEY = "gp_video_bienvenida_visto";

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function teaserHtml(): string {
  // Con "reducir movimiento" activado no arranca solo: queda la portada.
  const autoplay = prefersReducedMotion() ? "" : "autoplay";
  return `
    <aside class="howto-teaser" aria-label="Cómo funciona GlucoPulse">
      <div class="howto-teaser__phone">
        <video class="howto-teaser__video" src="${TEASER_SRC}" poster="${TEASER_POSTER}"
          ${autoplay} muted loop playsinline preload="metadata" aria-hidden="true"></video>
      </div>
      <div class="howto-teaser__text">
        <strong>Tu glucosa y tus comidas, explicadas con IA</strong>
        <p>Subí el archivo de tu sensor, sacale foto a tu plato y mirá qué te sube el azúcar.</p>
        <button type="button" class="howto-btn" data-open-howto>
          <span aria-hidden="true">▶</span> Ver cómo funciona <span class="howto-btn__dur">1 min</span>
        </button>
      </div>
    </aside>
  `;
}

/** Engancha los botones [data-open-howto] que haya dentro de `root`. */
export function bindHowItWorksButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-open-howto]").forEach((btn) => {
    btn.addEventListener("click", () => openHowItWorksVideo());
  });
}

export function openHowItWorksVideo(): void {
  if (document.querySelector(".howto-modal")) return;
  markWelcomeSeen();
  document.getElementById("howto-welcome")?.remove();

  // Si el teaser está andando, lo pausamos mientras se ve el completo.
  const teasers = [...document.querySelectorAll<HTMLVideoElement>(".howto-teaser__video")];
  teasers.forEach((v) => v.pause());

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay howto-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Video: cómo funciona GlucoPulse");
  overlay.innerHTML = `
    <div class="howto-modal__card">
      <button type="button" class="howto-modal__close" aria-label="Cerrar video">&times;</button>
      <video class="howto-modal__video" src="${FULL_SRC}" poster="${FULL_POSTER}"
        controls autoplay playsinline preload="auto"></video>
    </div>
  `;

  const close = () => {
    const video = overlay.querySelector("video");
    video?.pause();
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    teasers.forEach((v) => v.isConnected && !prefersReducedMotion() && v.play().catch(() => {}));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  overlay.querySelector(".howto-modal__close")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("video")?.addEventListener("ended", close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  (overlay.querySelector(".howto-modal__close") as HTMLButtonElement)?.focus();
}

function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* modo privado */
  }
}

function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return true;
  }
}

/** Tarjeta "¿Primera vez?" dentro de la app. Devuelve "" si ya se vio o cerró. */
export function welcomeCardHtml(): string {
  if (welcomeSeen()) return "";
  return `
    <section class="howto-welcome" id="howto-welcome">
      <div class="howto-welcome__thumb" aria-hidden="true">▶</div>
      <div class="howto-welcome__text">
        <strong>¿Primera vez en GlucoPulse?</strong>
        <p>Mirá en 1 minuto cómo sacarle provecho a la app.</p>
      </div>
      <div class="howto-welcome__actions">
        <button type="button" class="howto-btn" data-open-howto>Ver video</button>
        <button type="button" class="howto-welcome__dismiss" data-dismiss-welcome aria-label="No mostrar más">Ahora no</button>
      </div>
    </section>
  `;
}

export function bindWelcomeCard(root: ParentNode, onChange: () => void): void {
  root.querySelector("[data-dismiss-welcome]")?.addEventListener("click", () => {
    markWelcomeSeen();
    onChange();
  });
}
