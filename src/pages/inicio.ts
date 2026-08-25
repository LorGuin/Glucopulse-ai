import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../services/firebase";

export function initInicio(params?: { goTo: (path: string) => void }): HTMLElement {
  const container = document.createElement("div");
  container.className = "auth-page-container";

  let isRegistering = false;

  const renderContent = () => {
    container.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <header class="auth-card__header">
            <div class="auth-card__logo">🩸</div>
            <h1 class="auth-card__title">GlucoPulse AI</h1>
            <p class="auth-card__subtitle">
              ${isRegistering ? 'Crea tu cuenta para monitorear tu glucosa y platos' : 'Inicia sesión para continuar'}
            </p>
          </header>

          <div class="auth-card__error" id="auth-error" style="display: none;"></div>

          <form class="auth-form" id="auth-form">
            <div class="auth-form__group" id="group-name" style="${isRegistering ? 'display:flex;' : 'display:none;'}">
              <label for="name-input">Nombre Completo</label>
              <input type="text" id="name-input" placeholder="Ej. Juan Pérez" autocomplete="name" />
            </div>

            <div class="auth-form__group">
              <label for="email-input">Correo Electrónico</label>
              <input type="email" id="email-input" placeholder="tu@correo.com" required autocomplete="email" />
            </div>

            <div class="auth-form__group">
              <label for="password-input">Contraseña</label>
              <input type="password" id="password-input" placeholder="••••••••" required autocomplete="current-password" />
            </div>

            <button type="submit" class="auth-form__submit-btn" id="submit-btn">
              ${isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </button>
          </form>

          <footer class="auth-card__footer">
            <span>${isRegistering ? '¿Ya tienes una cuenta?' : '¿Aún no tienes cuenta?'}</span>
            <button type="button" class="auth-card__toggle-btn" id="toggle-auth-btn">
              ${isRegistering ? 'Inicia Sesión' : 'Regístrate aquí'}
            </button>
          </footer>
        </div>
      </div>
    `;

    attachEvents();
  };

  const attachEvents = () => {
    const form = container.querySelector("#auth-form") as HTMLFormElement;
    const toggleBtn = container.querySelector("#toggle-auth-btn") as HTMLButtonElement;
    const errorBox = container.querySelector("#auth-error") as HTMLDivElement;
    const submitBtn = container.querySelector("#submit-btn") as HTMLButtonElement;

    toggleBtn?.addEventListener("click", () => {
      isRegistering = !isRegistering;
      renderContent();
    });

    form?.addEventListener("submit", async (e: Event) => {
      e.preventDefault();

      const emailInput = container.querySelector("#email-input") as HTMLInputElement;
      const passwordInput = container.querySelector("#password-input") as HTMLInputElement;
      const nameInput = container.querySelector("#name-input") as HTMLInputElement;

      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const displayName = nameInput?.value.trim() || "Usuario";

      errorBox.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.innerText = "Procesando...";

      try {
        if (isRegistering) {
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          const user = credential.user;

          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: displayName,
            status: "active",
            createdAt: serverTimestamp(),
          });
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }

        // El router en src/index.ts reacciona a onAuthStateChanged y redirige
        // automáticamente, pero forzamos la navegación por si acaso.
        if (params?.goTo) {
          params.goTo("/principal");
        }
      } catch (err: any) {
        console.error("Detalle completo del error:", err);
        errorBox.style.display = "block";

        switch (err.code) {
          case "auth/email-already-in-use":
            errorBox.innerText = "Este correo ya está registrado. Cambia a 'Inicia Sesión'.";
            break;
          case "auth/invalid-credential":
          case "auth/wrong-password":
          case "auth/user-not-found":
            errorBox.innerText = "Correo o contraseña incorrectos.";
            break;
          case "auth/weak-password":
            errorBox.innerText = "La contraseña debe tener al menos 6 caracteres.";
            break;
          case "auth/invalid-email":
            errorBox.innerText = "El formato de correo no es válido.";
            break;
          case "permission-denied":
            errorBox.innerText = "Permiso denegado en Firestore. Revisa las reglas de la base de datos.";
            break;
          default:
            errorBox.innerText = `Error: ${err.message || 'Verifica la consola'}`;
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = isRegistering ? "Crear Cuenta" : "Iniciar Sesión";
      }
    });
  };

  renderContent();
  return container;
}
