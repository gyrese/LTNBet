import { subscribe } from '@/lib/sse-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(': connected\n\n'));

      const unsub = subscribe((data) => {
        try { controller.enqueue(enc.encode(data)); } catch { unsub(); }
      });

      // Heartbeat every 25s to keep connection alive
      const hb = setInterval(() => {
        try { controller.enqueue(enc.encode(': ping\n\n')); } catch { clearInterval(hb); unsub(); }
      }, 25_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
