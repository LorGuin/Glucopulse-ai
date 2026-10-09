// Instalación de la app en el celu (PWA).
//  - Android / Chrome / Edge: el navegador avisa con "beforeinstallprompt";
//    guardamos ese evento y lo disparamos desde nuestro botón "Instalar app".
//  - iPhone: Safari no tiene ese evento; mostramos cómo hacerlo a mano
//    (Compartir → "Agregar a inicio").

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function isInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** ¿Tiene sentido mostrar el botón "Instalar app"? */
export function canOfferInstall(): boolean {
  if (isInstalled()) return false;
  return deferredPrompt !== null || isIos();
}

/** Para volver a dibujar la pantalla cuando cambia la disponibilidad. */
export function onInstallAvailabilityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initPwa(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // usamos nuestro propio botón
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });

  // Solo en producción: en `npm run dev` el service worker molesta al recargar.
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[pwa] no se pudo registrar:", err));
    });
  }
}

export async function promptInstall(): Promise<void> {
  if (deferredPrompt) {
    const ev = deferredPrompt;
    deferredPrompt = null;
    await ev.prompt();
    await ev.userChoice.catch(() => null);
    notify();
    return;
  }
  if (isIos()) showIosInstructions();
}

function showIosInstructions(): void {
  if (document.querySelector(".pwa-ios")) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay pwa-ios";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Cómo instalar GlucoPulse en iPhone");
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-card__header">
        <h3>Instalá GlucoPulse en tu iPhone</h3>
        <button type="button" class="modal-close-btn" data-close aria-label="Cerrar">&times;</button>
      </div>
      <ol class="pwa-ios__steps">
        <li>Abrí esta página en <b>Safari</b>.</li>
        <li>Tocá el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
        <li>Elegí <b>"Agregar a inicio"</b> y después <b>Agregar</b>.</li>
      </ol>
      <p class="pwa-ios__note">Te va a quedar el ícono de GlucoPulse en la pantalla de inicio, como cualquier app.</p>
    </div>
  `;
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
}

/** Botón listo para insertar en un template (vacío si no corresponde). */
export function installButtonHtml(className = "pwa-install-btn"): string {
  if (!canOfferInstall()) return "";
  return `<button type="button" class="${className}" data-pwa-install aria-label="Instalar app" title="Instalar app"><span class="user-menu__ico" aria-hidden="true">📲</span><span class="pwa-install-btn__label"> Instalar app</span></button>`;
}

export function bindInstallButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-pwa-install]").forEach((btn) => {
    btn.addEventListener("click", () => promptInstall());
  });
}
