import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

function adminSecret() {
  return process.env.ADMIN_API_SECRET || 'toiles2024';
}

function checkAdmin(req: NextRequest): boolean {
  return req.headers.get('x-admin-secret') === adminSecret();
}

export async function GET() {
  const rows = db.prepare('SELECT team, logo_url FROM team_logos ORDER BY team').all() as { team: string; logo_url: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.team] = r.logo_url;
  return NextResponse.json(map);
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json() as { team?: string; logoUrl?: string };
  const { team, logoUrl } = body;
  if (!team || !logoUrl) return NextResponse.json({ error: 'team et logoUrl requis' }, { status: 400 });
  db.prepare(
    "INSERT INTO team_logos (team, logo_url, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(team) DO UPDATE SET logo_url = excluded.logo_url, updated_at = excluded.updated_at",
  ).run(team.trim(), logoUrl.trim());
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { team } = await req.json() as { team?: string };
  if (!team) return NextResponse.json({ error: 'team requis' }, { status: 400 });
  db.prepare('DELETE FROM team_logos WHERE team = ?').run(team.trim());
  return NextResponse.json({ success: true });
}
