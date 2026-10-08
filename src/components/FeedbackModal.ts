import { sendFeedback } from "../services/telemetryService";

// Ventana para que el tester cuente si la app le funciona (👍 / 👎 + comentario).
export class FeedbackModal {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay";

    modalEl.innerHTML = `
      <div class="modal-card">
        <div class="modal-card__header">
          <h3>¿Cómo te está funcionando la app?</h3>
          <button type="button" class="modal-close-btn" data-close>&times;</button>
        </div>

        <form class="modal-form" id="feedback-form">
          <div class="feedback-choice">
            <button type="button" class="feedback-choice__btn" data-ok="1">👍 Me funciona bien</button>
            <button type="button" class="feedback-choice__btn" data-ok="0">👎 Tengo un problema</button>
          </div>

          <div class="modal-form__group">
            <label for="feedback-text">Contanos qué pasó (opcional)</label>
            <textarea id="feedback-text" rows="4" maxlength="1000" placeholder="Ej.: no me carga el archivo del sensor, la foto tarda mucho…"></textarea>
          </div>

          <p class="feedback-status" aria-live="polite"></p>
          <button type="submit" class="modal-submit-btn" disabled>Enviar</button>
        </form>
      </div>
    `;

    this.container.appendChild(modalEl);

    let ok: boolean | null = null;
    const submitBtn = modalEl.querySelector<HTMLButtonElement>(".modal-submit-btn")!;
    const status = modalEl.querySelector<HTMLElement>(".feedback-status")!;

    modalEl.querySelector("[data-close]")?.addEventListener("click", () => modalEl.remove());
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) modalEl.remove();
    });

    modalEl.querySelectorAll<HTMLButtonElement>("[data-ok]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ok = btn.dataset.ok === "1";
        modalEl.querySelectorAll("[data-ok]").forEach((b) => b.classList.toggle("active", b === btn));
        submitBtn.disabled = false;
      });
    });

    modalEl.querySelector("#feedback-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (ok === null) return;
      const text = (modalEl.querySelector("#feedback-text") as HTMLTextAreaElement).value.trim();
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
      try {
        await sendFeedback(ok, text);
        status.textContent = "✅ ¡Gracias! Lo vamos a revisar.";
        submitBtn.textContent = "Enviado";
        window.setTimeout(() => modalEl.remove(), 1500);
      } catch (err: any) {
        status.textContent = "❌ No se pudo enviar: " + (err?.message || err);
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar";
      }
    });
  }
}
