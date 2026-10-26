/**
 * Starts a fresh document for workspace entry, session/community changes and
 * OAuth endpoints. These flows must rerun the server's cookie-based context;
 * the panel's local tabs continue to use history without reloading.
 * Keep navigation on this origin; an OAuth endpoint may redirect on the server.
 */
export function navigateDocument(destination: string): void {
  const url = new URL(destination, window.location.origin);
  if (url.origin !== window.location.origin || url.username || url.password) {
    throw new Error('Destino de navegação inválido.');
  }
  window.location.assign(url.href);
}
