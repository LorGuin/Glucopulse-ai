import { signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { parseCGMFile, analyzePeriod } from "../utils/glucoseAnalyzer";
import type { GlucoseReading, PeriodStats } from "../utils/glucoseAnalyzer";
import { evaluateGlucose } from "../utils/glucoseEvaluator";
import { getRecentGlucoseReadings } from "../services/glucoseService";
import { MealCaptureModal } from "../components/MealCaptureModal";
import { AddGlucoseModal } from "../components/AddGlucoseModal";
import { AiChatWidget } from "../components/AiChatWidget";
import { EmergencyAlertModal } from "../components/EmergencyAlertModal";
import { EmergencyContactsModal } from "../components/EmergencyContactsModal";
import { getEmergencyContacts } from "../services/emergencyContactsService";
import type { EmergencyContacts } from "../types/emergency";
import { getRecentMeals, deleteMeal } from "../services/aiFoodService";
import type { MealWithId } from "../services/aiFoodService";

export function initPrincipal(params?: { goTo: (path: string) => void }): HTMLElement {
  const container = document.createElement("div");
  container.className = "dashboard-container";

  // Lecturas del CSV del sensor (si se subió uno) y lecturas manuales
  // (cargadas desde Firestore) se mantienen separadas y se combinan al
  // usarlas, para no perder ni duplicar datos entre recargas.
  let csvReadings: GlucoseReading[] = [];
  let manualReadings: GlucoseReading[] = [];
  let currentPeriod: 'day' | 'week' | 'month' = 'day';
  let recentMeals: MealWithId[] = [];
  let emergencyContacts: EmergencyContacts = {
    emergencyNumber: "911",
    doctorName: "",
    doctorPhone: "",
    contactName: "",
    contactPhone: "",
  };
  let lastAlertedReadingTime: number | null = null;

  const getCombinedReadings = (): GlucoseReading[] => {
    return [...csvReadings, ...manualReadings].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  };

  const openContactsModal = () => {
    const modal = new EmergencyContactsModal(document.body, () => {
      loadEmergencyContacts();
    });
    modal.render();
  };

  const loadEmergencyContacts = async () => {
    try {
      emergencyContacts = await getEmergencyContacts();
    } catch (err) {
      console.warn("No se pudieron cargar los contactos de emergencia:", err);
    }
  };

  // Revisa si la última lectura (manual o del CSV) es una emergencia y es
  // reciente (últimos 20 min) — si ya alertamos por esa lectura exacta, no
  // repite la alerta en cada re-render.
  const checkForEmergency = () => {
    const combined = getCombinedReadings();
    if (combined.length === 0) return;

    const latest = combined[combined.length - 1];
    // Usamos 'postprandial' como contexto por defecto para esta detección
    // automática: es el umbral más conservador (menos falsas alarmas) ya
    // que no siempre sabemos si la lectura es en ayunas o no.
    const evaluation = evaluateGlucose(latest.value, "postprandial");
    if (!evaluation.isEmergency) return;

    const latestTime = latest.date.getTime();
    const isRecent = Date.now() - latestTime < 20 * 60 * 1000;
    if (!isRecent) return;
    if (lastAlertedReadingTime === latestTime) return;

    lastAlertedReadingTime = latestTime;
    const modal = new EmergencyAlertModal(
      document.body,
      latest.value,
      evaluation,
      emergencyContacts,
      openContactsModal
    );
    modal.render();
  };

  const loadRecentMeals = async () => {
    try {
      recentMeals = await getRecentMeals(8);
    } catch (err) {
      console.warn("No se pudo cargar el historial de comidas:", err);
    }
    render();
  };

  const loadManualReadings = async () => {
    try {
      const entries = await getRecentGlucoseReadings(50);
      manualReadings = entries.map((entry) => ({
        date: entry.createdAt,
        value: entry.valueMgDl,
      }));
    } catch (err) {
      console.warn("No se pudieron cargar las mediciones manuales:", err);
    }
    render();
    checkForEmergency();
  };

  const handleFileUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        csvReadings = parseCGMFile(content);

        const stats = analyzePeriod(getCombinedReadings(), currentPeriod);

        const docId = await saveCGMAnalysis(stats, file.name);
        console.log("✅ Guardado con éxito. ID del documento:", docId);

        const chatWidget = new AiChatWidget(document.body, getCombinedReadings());
        chatWidget.render();

        render();
        checkForEmergency();
      } catch (err: any) {
        console.error("❌ Error al guardar en Firebase:", err);
        alert("Error de Firebase: " + (err.message || err.code));
      }
    };
    reader.readAsText(file);
  };

  const impactLabel: Record<string, string> = {
    low: "Impacto bajo",
    medium: "Impacto moderado",
    high: "Impacto alto",
  };

  const renderMealsHistory = (): string => {
    if (recentMeals.length === 0) {
      return `
        <section class="meals-history">
          <h3>Historial de Comidas</h3>
          <p class="meals-empty">Todavía no registraste ninguna comida. Tocá "Registrar Plato" para que la IA la analice.</p>
        </section>
      `;
    }

    const entries = recentMeals
      .map(
        (m) => `
        <article class="meal-entry" data-meal-id="${m.id}">
          <img src="${m.imageUrl}" alt="${m.dishName}" class="meal-entry__img" />
          <div class="meal-entry__info">
            <div class="meal-entry__header">
              <strong>${m.dishName}</strong>
              <span class="meal-entry__badge meal-entry__badge--${m.glycemicImpact}">${m.macros.calories} kcal</span>
            </div>
            <div class="meal-entry__macros">
              <span>🍞 ${m.macros.carbsGrams}g carbs</span>
              <span>🍬 ${m.macros.sugarGrams}g azúcar</span>
              <span>🥑 ${m.macros.fatsGrams}g grasas</span>
              <span>🍗 ${m.macros.proteinGrams}g proteína</span>
            </div>
            <span class="meal-entry__impact meal-entry__impact--${m.glycemicImpact}">${impactLabel[m.glycemicImpact] || m.glycemicImpact}</span>
            <p class="meal-entry__advice">${m.aiAdviceNextMeal}</p>
          </div>
          <button type="button" class="meal-entry__delete" data-delete-id="${m.id}" title="Borrar esta comida">🗑️</button>
        </article>
      `
      )
      .join("");

    return `
      <section class="meals-history">
        <h3>Historial de Comidas</h3>
        <p class="chart-card__subtitle">Así te afectó cada plato registrado</p>
        <div class="meals-history__list">${entries}</div>
      </section>
    `;
  };

  const render = () => {
    const combined = getCombinedReadings();
    const stats: PeriodStats = analyzePeriod(combined, currentPeriod);
    const latestReading = combined.length > 0 ? combined[combined.length - 1].value : 105;
    const evaluation = evaluateGlucose(latestReading, 'fasting');
    const noDataYet = combined.length === 0;

    container.innerHTML = `
      <div class="dashboard-wrapper">
        <header class="dashboard-header">
          <div>
            <h1 class="dashboard-header__title">GlucoPulse AI</h1>
            <span class="dashboard-header__user">${auth.currentUser?.email || "Usuario"}</span>
          </div>
          <div class="dashboard-header__actions">
            <button id="emergency-settings-btn" class="dashboard-header__settings" title="Contactos de emergencia">⚙️</button>
            <button id="logout-btn" class="dashboard-header__logout">
              <span>Cerrar Sesión</span>
              <span class="logout-icon">↪</span>
            </button>
          </div>
        </header>

        ${noDataYet ? `
        <section class="upload-box upload-box--warning">
          <span class="upload-box__icon">⚠️</span>
          <div>
            <strong>Todavía no hay ninguna medición de glucosa cargada</strong>
            <p>Sin datos reales, el análisis de comidas no puede calcular el impacto real en tu glucosa. Subí un CSV o cargá una medición manual.</p>
          </div>
        </section>
        ` : ""}

        <section class="upload-box" id="drop-zone">
          <input type="file" id="cgm-file-input" accept=".csv" style="display: none;" />
          <label for="cgm-file-input" class="upload-box__content">
            <span class="upload-box__icon">📊</span>
            <div>
              <strong>${csvReadings.length > 0 ? 'Archivo cargado (' + csvReadings.length + ' lecturas)' : 'Arrastra o sube tu archivo CSV del sensor'}</strong>
              <p>El sistema calculará automáticamente tendencias, picos y tiempo en rango.</p>
            </div>
          </label>
        </section>

        <section class="glucose-card">
          <div class="glucose-card__info">
            <span class="glucose-card__label">Último Registro</span>
            <div class="glucose-card__value-wrap">
              <span class="glucose-card__value" style="color: ${evaluation.color}">${latestReading}</span>
              <span class="glucose-card__unit">mg/dL</span>
            </div>
          </div>
          <div class="glucose-card__badge" style="background-color: ${evaluation.color}18; color: ${evaluation.color}; border: none;">
            ● ${evaluation.label}
          </div>
        </section>

        <div class="fab-stack">
          <button id="add-glucose-fab" class="fab-btn fab-btn--secondary">
            🩸 Registrar Glucosa
          </button>
          <button id="add-meal-fab" class="fab-btn">
            📷 Registrar Plato
          </button>
        </div>

        <section class="chart-card">
          <div class="chart-card__header">
            <div>
              <h3>Tendencia Glucémica</h3>
              <span class="chart-card__subtitle">Rango objetivo: 70 - 140 mg/dL · ${manualReadings.length} mediciones manuales</span>
            </div>
            <div class="period-tabs">
              <button class="tab-btn ${currentPeriod === 'day' ? 'active' : ''}" data-period="day">Día</button>
              <button class="tab-btn ${currentPeriod === 'week' ? 'active' : ''}" data-period="week">Semana</button>
              <button class="tab-btn ${currentPeriod === 'month' ? 'active' : ''}" data-period="month">Mes</button>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-pill">
              <span>Promedio</span>
              <strong>${stats.average} mg/dL</strong>
            </div>
            <div class="stat-pill">
              <span>En Rango (TIR)</span>
              <strong style="color: ${stats.timeInRangePercent >= 70 ? '#10b981' : '#f59e0b'};">${stats.timeInRangePercent}%</strong>
            </div>
            <div class="stat-pill">
              <span>Pico Máximo</span>
              <strong>${stats.max} mg/dL</strong>
            </div>
          </div>

          <div class="chart-svg-container">
            <svg viewBox="0 0 400 120" class="chart-svg">
              <rect x="0" y="53" width="400" height="47" fill="#10b981" fill-opacity="0.14" />
              <line x1="0" y1="53" x2="400" y2="53" stroke="#10b981" stroke-dasharray="3,3" stroke-width="0.8" opacity="0.6" />
              <text x="6" y="50" fill="#10b981" font-size="8" font-weight="700">140 mg/dL (Máx Saludable)</text>

              <line x1="0" y1="100" x2="400" y2="100" stroke="#10b981" stroke-dasharray="3,3" stroke-width="0.8" opacity="0.6" />
              <text x="6" y="97" fill="#10b981" font-size="8" font-weight="700">70 mg/dL (Mín Saludable)</text>

              <polyline fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" points="${stats.svgPoints}" />
            </svg>
          </div>
        </section>

        ${renderMealsHistory()}
      </div>
    `;

    attachEvents();
  };

  const attachEvents = () => {
    container.querySelector("#logout-btn")?.addEventListener("click", async () => {
      await signOut(auth);
      if (params?.goTo) params.goTo("/inicio");
    });

    container.querySelector("#emergency-settings-btn")?.addEventListener("click", () => {
      openContactsModal();
    });

    const fileInput = container.querySelector("#cgm-file-input") as HTMLInputElement;
    fileInput?.addEventListener("change", (e: any) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    });

    container.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e: any) => {
        currentPeriod = e.target.dataset.period;
        render();
      });
    });

    container.querySelector("#add-meal-fab")?.addEventListener("click", () => {
      const modal = new MealCaptureModal(document.body, getCombinedReadings(), () => {
        loadRecentMeals();
      });
      modal.render();
    });

    container.querySelector("#add-glucose-fab")?.addEventListener("click", () => {
      const modal = new AddGlucoseModal(document.body, () => {
        loadManualReadings();
      });
      modal.render();
    });

    container.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const mealId = (e.currentTarget as HTMLElement).dataset.deleteId;
        if (!mealId) return;
        if (!confirm("¿Borrar esta comida? No se puede deshacer.")) return;

        try {
          await deleteMeal(mealId);
          loadRecentMeals();
        } catch (err: any) {
          alert("Error al borrar: " + (err.message || err));
        }
      });
    });
  };

  // 1. Dibujar la vista inicial
  render();

  // 2. Cargar comidas, mediciones manuales y contactos de emergencia
  loadRecentMeals();
  loadEmergencyContacts().then(() => {
    loadManualReadings();
  });

  // 3. Montar el chatbot apenas se monta el dashboard
  setTimeout(() => {
    const chatWidget = new AiChatWidget(document.body, getCombinedReadings());
    chatWidget.render();
  }, 100);

  return container;
}

async function saveCGMAnalysis(stats: PeriodStats, name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay un usuario autenticado para guardar el análisis.");

  const docRef = await addDoc(collection(db, "cgm_analyses"), {
    userId: user.uid,
    userEmail: user.email ?? "",
    fileName: name,
    createdAt: serverTimestamp(),
    uploadedAt: new Date().toISOString(),
    stats,
  });

  return docRef.id;
}
