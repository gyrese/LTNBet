// In-memory SSE broadcast bus — server-side singleton
type Listener = (data: string) => void;

const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function broadcast(event: string, payload: unknown) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const fn of listeners) fn(data);
}
