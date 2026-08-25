import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import type { GlucoseReading } from "../utils/glucoseAnalyzer";
import type { MealRecord } from "../types/meal";

export class AiChatWidget {
  private targetParent: HTMLElement;
  private cgmData: GlucoseReading[];

  constructor(targetParent: HTMLElement, cgmData: GlucoseReading[] = []) {
    this.targetParent = targetParent;
    this.cgmData = cgmData;
  }

  public render(): void {
    const existing = document.getElementById("ai-chat-root");
    if (existing) existing.remove();

    const widget = document.createElement("div");
    widget.id = "ai-chat-root";
    widget.className = "ai-chat-widget";

    widget.innerHTML = `
      <button id="toggle-chat-btn" class="chat-fab-btn" type="button">💬 Asistente IA</button>

      <div id="chat-window" class="chat-window hidden">
        <div class="chat-window__header">
          <div>
            <strong>Asistente Metabólico IA</strong>
            <span id="chat-quota-label" class="quota-badge">Online</span>
          </div>
          <button id="close-chat-btn" class="btn-close-chat" type="button">&times;</button>
        </div>

        <div class="chat-suggestions">
          <button class="chip-btn" data-q="¿Cómo afectó mi última comida a la glucosa?">📊 ¿Cómo afectó mi comida?</button>
          <button class="chip-btn" data-q="¿Qué puedo cenar hoy para evitar picos?">🥗 ¿Qué ceno hoy?</button>
          <button class="chip-btn" data-q="¿Por qué subió mi glucosa recientemente?">📈 ¿Por qué subió?</button>
        </div>

        <div id="chat-messages" class="chat-messages">
          <div class="msg ai">¡Hola! Soy tu asistente médico de GlucoPulse. He cruzado tus lecturas de glucosa con tus fotos de comidas. ¿Qué deseas consultar?</div>
        </div>

        <form id="chat-form" class="chat-input-row">
          <input type="text" id="chat-input" placeholder="Escribe tu consulta sobre tu glucosa..." required autocomplete="off" />
          <button type="submit" id="chat-submit-btn">Enviar</button>
        </form>
      </div>
    `;

    this.targetParent.appendChild(widget);
    this.initEvents(widget);
  }

  private buildMetabolicContext(recentMeals: MealRecord[]): string {
    const latestGlucose = this.cgmData.length > 0 ? this.cgmData[this.cgmData.length - 1].value : 105;

    let mealsSummary = "Sin registros recientes de comida.";
    if (recentMeals.length > 0) {
      mealsSummary = recentMeals
        .map(
          (m) =>
            `- Plato: ${m.dishName} | ${m.macros?.calories || 0} kcal, ${m.macros?.carbsGrams || 0}g carbs, ${m.macros?.sugarGrams || 0}g azúcar | Hora: ${new Date(m.eatenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        )
        .join("\n");
    }

    return `Eres un médico endocrinólogo y nutricionista clínico de GlucoPulse AI.
Datos del paciente en tiempo real:
- Glucosa actual en sangre: ${latestGlucose} mg/dL.
- Comidas registradas hoy con foto y macros:
${mealsSummary}

Instrucciones: Responde de forma empática, personalizada, clara y concisa (máximo 2 párrafos).`;
  }

  private initEvents(widget: HTMLElement): void {
    const toggleBtn = widget.querySelector("#toggle-chat-btn") as HTMLElement;
    const chatWindow = widget.querySelector("#chat-window") as HTMLElement;
    const closeBtn = widget.querySelector("#close-chat-btn") as HTMLElement;
    const form = widget.querySelector("#chat-form") as HTMLFormElement;
    const input = widget.querySelector("#chat-input") as HTMLInputElement;
    const messages = widget.querySelector("#chat-messages") as HTMLElement;

    toggleBtn.addEventListener("click", () => {
      chatWindow.classList.toggle("hidden");
    });

    closeBtn.addEventListener("click", () => chatWindow.classList.add("hidden"));

    widget.querySelectorAll(".chip-btn").forEach((chip) => {
      chip.addEventListener("click", (e: any) => {
        input.value = e.target.dataset.q;
        form.requestSubmit();
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      this.appendMessage(messages, text, "user");
      input.value = "";
      input.disabled = true;

      const user = auth.currentUser;
      let recentMeals: MealRecord[] = [];
      if (user) {
        try {
          const mealsRef = collection(db, "users", user.uid, "meals");
          const q = query(mealsRef, orderBy("createdAt", "desc"), limit(3));
          const snap = await getDocs(q);
          recentMeals = snap.docs.map((d) => d.data() as MealRecord);
        } catch (err) {
          console.warn("Error leyendo Firestore:", err);
        }
      }

      const systemPrompt = this.buildMetabolicContext(recentMeals);

      try {
        const aiAnswer = await this.askAI(text, systemPrompt);
        this.appendMessage(messages, aiAnswer, "ai");
      } catch (err: any) {
        this.appendMessage(messages, `❌ Error de IA: ${err.message || "No se pudo obtener respuesta."}`, "ai");
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  }

  private appendMessage(container: HTMLElement, text: string, sender: "user" | "ai"): void {
    const msg = document.createElement("div");
    msg.className = `msg ${sender}`;
    msg.innerText = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  private async askAI(userQuery: string, systemPrompt: string): Promise<string> {
    // Llama a nuestra propia función serverless (api/groq-chat.ts).
    const response = await fetch("/api/groq-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userQuery, systemPrompt }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `Error en el servidor (${response.status})`);
    }

    return data.text || "No se obtuvo respuesta del modelo.";
  }
}
