import { NextResponse } from 'next/server';

// Simulation de persistance locale en mémoire
const registeredWebhooks: { id: string; url: string; events: string[]; created_at: string }[] = [];

export async function GET() {
  return NextResponse.json({
    success: true,
    webhooks: registeredWebhooks
  });
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

    registeredWebhooks.push(newWebhook);

    return NextResponse.json({
      success: true,
      message: 'Webhook enregistré avec succès pour Google Stitch.',
      webhook: newWebhook
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Format JSON invalide.' }, { status: 400 });
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
