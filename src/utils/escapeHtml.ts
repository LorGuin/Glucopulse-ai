// Escapa texto antes de meterlo en innerHTML. Imprescindible para todo lo que
// venga de la IA o del usuario (nombres de platos, consejos, contactos...).
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
