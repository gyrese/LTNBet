import { NextRequest, NextResponse } from 'next/server';

export interface SportsDBTeam {
  idTeam: string;
  strTeam: string;
  // TheSportsDB a renommé strTeamBadge → strBadge (v1). On garde strLogo en repli, et l'ancien
  // champ par sécurité au cas où l'API le réexposerait.
  strBadge?: string | null;
  strLogo?: string | null;
  strTeamBadge?: string | null;
  strLeague: string | null;
  strCountry: string | null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q) return NextResponse.json({ teams: [] });

  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(q)}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    const data = await res.json() as { teams: SportsDBTeam[] | null };
    const teams = (data.teams ?? [])
      .map(t => ({
        id: t.idTeam,
        name: t.strTeam,
        badge: t.strBadge || t.strLogo || t.strTeamBadge || null,
        league: t.strLeague,
        country: t.strCountry,
      }))
      .filter(t => t.badge)
      .slice(0, 8);
    return NextResponse.json({ teams });
  } catch {
    return NextResponse.json({ teams: [] });
  }
}
