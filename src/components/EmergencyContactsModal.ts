import { getEmergencyContacts, saveEmergencyContacts } from "../services/emergencyContactsService";
import type { EmergencyContacts } from "../types/emergency";

export class EmergencyContactsModal {
  private container: HTMLElement;
  private onSaved: () => void;

  constructor(container: HTMLElement, onSaved: () => void) {
    this.container = container;
    this.onSaved = onSaved;
  }

  public async render(): Promise<void> {
    const current = await getEmergencyContacts();

    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay";
    modalEl.id = "emergency-contacts-modal";

    modalEl.innerHTML = `
      <div class="modal-card">
        <div class="modal-card__header">
          <h3>Contactos de Emergencia</h3>
          <button type="button" id="close-contacts-modal" class="modal-close-btn">&times;</button>
        </div>
        <p class="chart-card__subtitle" style="margin-bottom: 1rem;">
          Se usan en la alerta si tu glucosa llega a un nivel peligroso. Todos los campos son opcionales excepto el número de emergencias.
        </p>

        <form id="contacts-form" class="modal-form">
          <div class="modal-form__group">
            <label for="emergency-number-input">Número de emergencias de tu zona</label>
            <input type="tel" id="emergency-number-input" value="${current.emergencyNumber}" placeholder="Ej. 911" required />
          </div>
          <div class="modal-form__group">
            <label for="doctor-name-input">Nombre de tu médico</label>
            <input type="text" id="doctor-name-input" value="${current.doctorName}" placeholder="Opcional" />
          </div>
          <div class="modal-form__group">
            <label for="doctor-phone-input">Teléfono de tu médico</label>
            <input type="tel" id="doctor-phone-input" value="${current.doctorPhone}" placeholder="Opcional" />
          </div>
          <div class="modal-form__group">
            <label for="contact-name-input">Nombre de tu contacto de confianza</label>
            <input type="text" id="contact-name-input" value="${current.contactName}" placeholder="Ej. mamá, pareja" />
          </div>
          <div class="modal-form__group">
            <label for="contact-phone-input">Teléfono de ese contacto</label>
            <input type="tel" id="contact-phone-input" value="${current.contactPhone}" placeholder="Opcional" />
          </div>
          <button type="submit" id="save-contacts-btn" class="modal-submit-btn">Guardar</button>
        </form>
      </div>
    `;

    this.container.appendChild(modalEl);
    this.attachEvents(modalEl);
  }

  private attachEvents(modalEl: HTMLElement): void {
    modalEl.querySelector("#close-contacts-modal")?.addEventListener("click", () => modalEl.remove());

    modalEl.querySelector("#contacts-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const get = (id: string) => (modalEl.querySelector(id) as HTMLInputElement).value.trim();
      const submitBtn = modalEl.querySelector("#save-contacts-btn") as HTMLButtonElement;

      const contacts: EmergencyContacts = {
        emergencyNumber: get("#emergency-number-input") || "911",
        doctorName: get("#doctor-name-input"),
        doctorPhone: get("#doctor-phone-input"),
        contactName: get("#contact-name-input"),
        contactPhone: get("#contact-phone-input"),
      };

      submitBtn.disabled = true;
      submitBtn.innerText = "Guardando...";
      try {
        await saveEmergencyContacts(contacts);
        modalEl.remove();
        this.onSaved();
      } catch (err: any) {
        alert("Error al guardar: " + err.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "Guardar";
      }
    });
  }
}
