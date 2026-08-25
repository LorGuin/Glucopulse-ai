import type { GlucoseEvaluation } from "../types/glucose";
import type { EmergencyContacts } from "../types/emergency";

export class EmergencyAlertModal {
  private container: HTMLElement;
  private value: number;
  private evaluation: GlucoseEvaluation;
  private contacts: EmergencyContacts;
  private onConfigureContacts: () => void;

  constructor(
    container: HTMLElement,
    value: number,
    evaluation: GlucoseEvaluation,
    contacts: EmergencyContacts,
    onConfigureContacts: () => void
  ) {
    this.container = container;
    this.value = value;
    this.evaluation = evaluation;
    this.contacts = contacts;
    this.onConfigureContacts = onConfigureContacts;
  }

  public render(): void {
    const isLow = this.evaluation.status === "danger_low";
    const title = isLow ? "Nivel de glucosa muy bajo" : "Nivel de glucosa muy alto";

    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay emergency-overlay";
    modalEl.id = "emergency-alert-modal";

    const doctorRow = this.contacts.doctorPhone
      ? `<a class="emergency-action" href="tel:${this.contacts.doctorPhone}">👨‍⚕️ Llamar a ${this.contacts.doctorName || "mi médico"}</a>`
      : `<button type="button" class="emergency-action emergency-action--muted" id="configure-contacts-btn-1">👨‍⚕️ Configurar teléfono del médico</button>`;

    const contactRow = this.contacts.contactPhone
      ? `<a class="emergency-action" href="tel:${this.contacts.contactPhone}">👪 Llamar a ${this.contacts.contactName || "mi contacto"}</a>`
      : `<button type="button" class="emergency-action emergency-action--muted" id="configure-contacts-btn-2">👪 Configurar contacto de confianza</button>`;

    modalEl.innerHTML = `
      <div class="modal-card emergency-card">
        <div class="emergency-card__icon">${isLow ? "🍬" : "⚠️"}</div>
        <h3 class="emergency-card__title">${title}</h3>
        <p class="emergency-card__reading">${this.value} mg/dL</p>
        <p class="emergency-card__note">
          Esto puede requerir atención. Elegí una opción de contacto, o cerrá esta alerta si ya estás manejando la situación.
        </p>

        <div class="emergency-card__actions">
          <a class="emergency-action emergency-action--sos" href="tel:${this.contacts.emergencyNumber || "911"}">
            🚨 Llamar a Emergencias (${this.contacts.emergencyNumber || "911"})
          </a>
          ${doctorRow}
          ${contactRow}
        </div>

        <button type="button" id="dismiss-emergency-btn" class="emergency-dismiss-btn">Ya estoy bien, cerrar</button>
      </div>
    `;

    this.container.appendChild(modalEl);

    modalEl.querySelector("#dismiss-emergency-btn")?.addEventListener("click", () => modalEl.remove());
    modalEl.querySelector("#configure-contacts-btn-1")?.addEventListener("click", () => {
      modalEl.remove();
      this.onConfigureContacts();
    });
    modalEl.querySelector("#configure-contacts-btn-2")?.addEventListener("click", () => {
      modalEl.remove();
      this.onConfigureContacts();
    });
  }
}
