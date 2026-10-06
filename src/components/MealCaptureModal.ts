import { analyzeMealImage } from "../services/aiFoodService";
import type { GlucoseReading } from "../utils/glucoseAnalyzer";

export class MealCaptureModal {
  private container: HTMLElement;
  private cgmData: GlucoseReading[];
  private onMealAnalyzed: () => void;

  constructor(container: HTMLElement, cgmData: GlucoseReading[], onAnalyzed: () => void) {
    this.container = container;
    this.cgmData = cgmData;
    this.onMealAnalyzed = onAnalyzed;
  }

  public render(): void {
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay";
    modalEl.id = "meal-capture-modal";

    modalEl.innerHTML = `
      <div class="modal-card modal-meal">
        <div class="modal-card__header">
          <h3>📷 Registrar Plato con IA</h3>
          <button type="button" id="close-meal-modal" class="modal-close-btn">&times;</button>
        </div>

        <div class="meal-upload-area" id="meal-dropzone">
          <input type="file" id="meal-camera-input" accept="image/*" style="display: none;" />
          <label for="meal-camera-input" class="meal-upload-label" id="preview-label">
            <span class="upload-icon">📸</span>
            <strong>Tomar foto o elegir de galería</strong>
            <p>La IA estimará calorías, azúcar, grasas y cruzará con tu glucosa</p>
          </label>
          <img id="meal-preview-img" class="meal-preview-img" style="display: none;" />
        </div>

        <div class="modal-form__group" style="margin-top: 1rem;">
          <label for="meal-time-input">Hora de la Comida</label>
          <input type="time" id="meal-time-input" required />
        </div>

        <button type="button" id="btn-process-meal" class="modal-submit-btn" disabled>
          Analizar e Integrar con Glucosa
        </button>
      </div>
    `;

    this.container.appendChild(modalEl);
    this.attachEvents(modalEl);
  }

  private attachEvents(modalEl: HTMLElement): void {
    const timeInput = modalEl.querySelector("#meal-time-input") as HTMLInputElement;
    const now = new Date();
    timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let base64Image = "";

    const fileInput = modalEl.querySelector("#meal-camera-input") as HTMLInputElement;
    const previewImg = modalEl.querySelector("#meal-preview-img") as HTMLImageElement;
    const previewLabel = modalEl.querySelector("#preview-label") as HTMLElement;
    const processBtn = modalEl.querySelector("#btn-process-meal") as HTMLButtonElement;

    modalEl.querySelector("#close-meal-modal")?.addEventListener("click", () => modalEl.remove());

    fileInput.addEventListener("change", (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();

        img.onerror = () => {
          // El navegador no pudo decodificar el archivo — típico con fotos
          // HEIC de iPhone, que <img> no soporta nativamente.
          alert(
            "No se pudo abrir esa foto en el navegador. Si la sacaste con un iPhone, " +
            "puede estar en formato HEIC (no soportado). Probá: Ajustes > Cámara > " +
            "Formatos > 'Más compatible', o elegí una foto ya guardada como JPEG/PNG."
          );
        };

        img.onload = () => {
          // Redibuja en un canvas y exporta como JPEG, sin importar el
          // formato original (AVIF, PNG, etc. — Gemini acepta solo
          // JPEG/PNG/WEBP). De paso comprime fotos grandes de celular
          // para no pasar el límite de tamaño de la API.
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            alert("Error interno al procesar la imagen (canvas no disponible).");
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          base64Image = canvas.toDataURL("image/jpeg", 0.85);
          previewImg.src = base64Image;
          previewImg.style.display = "block";
          previewLabel.style.display = "none";
          processBtn.disabled = false;
        };

        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert("No se pudo leer el archivo seleccionado. Probá con otra foto.");
      };
      reader.readAsDataURL(file);
    });

    processBtn.addEventListener("click", async () => {
      processBtn.disabled = true;
      processBtn.innerText = "Analizando con IA y cruzando datos...";

      try {
        const [hours, minutes] = timeInput.value.split(":").map(Number);
        const eatenDate = new Date();
        eatenDate.setHours(hours, minutes, 0, 0);

        await analyzeMealImage(base64Image, eatenDate, this.cgmData);
        modalEl.remove();
        this.onMealAnalyzed();
      } catch (err: any) {
        alert("Error al procesar la comida: " + (err.message || err));
        processBtn.disabled = false;
        processBtn.innerText = "Analizar e Integrar con Glucosa";
      }
    });
  }
}
