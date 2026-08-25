import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./services/firebase";
import { initInicio } from "./pages/inicio";
import { initPrincipal } from "./pages/principal";
import "./styles/main.scss";

const root = document.querySelector<HTMLDivElement>(".root");
if (!root) {
  throw new Error("No se encontró el contenedor .root en index.html");
}

function goTo(path: string): void {
  window.location.hash = path;
}

function currentPath(): string {
  return window.location.hash.replace("#", "") || "/inicio";
}

function renderRoute(path: string): void {
  root!.innerHTML = "";
  if (path === "/principal") {
    root!.appendChild(initPrincipal({ goTo }));
  } else {
    root!.appendChild(initInicio({ goTo }));
  }
}

// Reacciona a cambios de hash (por ejemplo, al llamar goTo())
window.addEventListener("hashchange", () => {
  renderRoute(currentPath());
});

// Reacciona al estado de sesión de Firebase: si hay usuario, va al dashboard;
// si no, vuelve al login. Esto también dispara el primer render de la app.
onAuthStateChanged(auth, (user) => {
  const path = currentPath();

  if (user && path !== "/principal") {
    goTo("/principal");
    return;
  }

  if (!user && path === "/principal") {
    goTo("/inicio");
    return;
  }

  renderRoute(path);
});
