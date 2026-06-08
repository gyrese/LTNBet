import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const rows = db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as { id: string; url: string; events: string; created_at: string }[];
    const webhooks = rows.map(r => ({
      id: r.id,
      url: r.url,
      events: r.events ? r.events.split(',') : [],
      created_at: r.created_at
    }));
    return NextResponse.json({
      success: true,
      webhooks
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Impossible de lire les webhooks.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, events } = body;

    if (!url || !url.startsWith('http')) {
      return NextResponse.json({ success: false, error: 'URL invalide.' }, { status: 400 });
    }

    const newWebhook = {
      id: 'wh-' + Math.random().toString(36).substring(2, 9),
      url,
      events: events || ['match.goal', 'match.finished'],
      created_at: new Date().toISOString()
    };

    db.prepare('INSERT INTO webhooks (id, url, events, created_at) VALUES (?, ?, ?, ?)')
      .run(newWebhook.id, newWebhook.url, newWebhook.events.join(','), newWebhook.created_at);

    return NextResponse.json({
      success: true,
      message: 'Webhook enregistré avec succès pour Google Stitch.',
      webhook: newWebhook
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Format JSON invalide ou erreur de base de données.' }, { status: 400 });
  }
}

// Support CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
