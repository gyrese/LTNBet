import db from './db';

/**
 * Déclenche de façon asynchrone tous les webhooks enregistrés pour un événement donné.
 * 
 * @param event Nom de l'événement (ex: 'match.goal', 'match.finished')
 * @param payload Contenu de l'événement
 */
export function triggerWebhooks(event: string, payload: unknown): void {
  try {
    // Récupère tous les webhooks de la base SQLite
    const rows = db.prepare('SELECT * FROM webhooks').all() as { id: string; url: string; events: string }[];
    
    for (const row of rows) {
      // Vérifie si le webhook s'est abonné à cet événement spécifique
      const eventsList = row.events ? row.events.split(',').map(e => e.trim()) : [];
      const isSubscribed = eventsList.length === 0 || eventsList.includes(event);
      
      if (isSubscribed) {
        // Envoi asynchrone non-bloquant du webhook
        fetch(row.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event,
            timestamp: new Date().toISOString(),
            data: payload
          })
        }).catch(err => {
          console.error(`[Webhook] Error sending to ${row.url}:`, err.message || err);
        });
      }
    }
  } catch (err) {
    console.error('[Webhook] Failed to query webhooks table:', err);
  }
}
