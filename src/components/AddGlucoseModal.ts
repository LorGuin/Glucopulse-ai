import { saveGlucoseReading } from "../services/glucoseService";
import type { GlucoseContext } from "../types/glucose";

export class AddGlucoseModal {
  private container: HTMLElement;
  private onSavedCallback: () => void;

  constructor(container: HTMLElement, onSaved: () => void) {
    this.container = container;
    this.onSavedCallback = onSaved;
  }

  public render(): void {
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay";
    modalEl.id = "glucose-modal";

    modalEl.innerHTML = `
      <div class="modal-card">
        <div class="modal-card__header">
          <h3>Nueva Medición de Glucosa</h3>
          <button type="button" id="close-modal-btn" class="modal-close-btn">&times;</button>
        </div>

        <form id="glucose-form" class="modal-form">
          <div class="modal-form__group">
            <label for="glucose-val">Valor en Sangre (mg/dL)</label>
            <input type="number" id="glucose-val" min="20" max="600" placeholder="Ej. 115" required autofocus />
          </div>

          <div class="modal-form__group">
            <label for="glucose-context">Momento de la toma</label>
            <select id="glucose-context">
              <option value="fasting">En ayunas / Antes de comer</option>
              <option value="postprandial">1-2 horas tras comer</option>
              <option value="random">Reposo / Casual</option>
            </select>
          </div>

          <button type="submit" id="save-glucose-btn" class="modal-submit-btn">Guardar Medición</button>
        </form>
      </div>
    `;

    this.container.appendChild(modalEl);
    this.attachEvents(modalEl);
  }

  private attachEvents(modalEl: HTMLElement): void {
    modalEl.querySelector("#close-modal-btn")?.addEventListener("click", () => modalEl.remove());

    modalEl.querySelector("#glucose-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const valInput = modalEl.querySelector("#glucose-val") as HTMLInputElement;
      const contextSelect = modalEl.querySelector("#glucose-context") as HTMLSelectElement;
      const submitBtn = modalEl.querySelector("#save-glucose-btn") as HTMLButtonElement;

      const value = parseFloat(valInput.value);
      const context = contextSelect.value as GlucoseContext;

      if (!isNaN(value)) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Guardando en la nube...";

        try {
          await saveGlucoseReading(value, context);
          modalEl.remove();
          this.onSavedCallback();
        } catch (err: any) {
          alert("Error al guardar la medición: " + err.message);
          submitBtn.disabled = false;
          submitBtn.innerText = "Guardar Medición";
        }
      }
    });
  }
}
