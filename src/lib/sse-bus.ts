// In-memory SSE broadcast bus — server-side singleton
type Listener = (data: string) => void;

const listeners = new Set<Listener>();

// Champs sensibles des joueurs à NE JAMAIS exposer aux clients (jeton d'appareil = vol de compte,
// hash du code de secours). Retirés via un replacer JSON → s'applique partout dans le payload.
const SENSITIVE_KEYS = new Set(['device_token', 'recovery_code']);
export function publicJSON(payload: unknown): string {
  return JSON.stringify(payload, (k, v) => (SENSITIVE_KEYS.has(k) ? undefined : v));
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function broadcast(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${publicJSON(payload)}\n\n`;
  for (const fn of listeners) fn(data);
}
