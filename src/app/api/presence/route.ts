import { NextRequest, NextResponse } from 'next/server';
import { markOnline, countOnline } from '@/lib/presence';

export const dynamic = 'force-dynamic';

// Heartbeat de présence : le client l'appelle périodiquement tant qu'il est actif.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ ok: false, error: 'missing userId' }, { status: 400 });
    markOnline(userId);
    return NextResponse.json({ ok: true, online: countOnline() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
