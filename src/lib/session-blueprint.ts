/**
 * Construit le « blueprint » d'une session de paris (marchés + outcomes + cotes) à partir
 * d'un match et des cotes normalisées récupérées chez le fournisseur.
 *
 * Fonction PURE (aucune écriture DB) → réutilisée par :
 *   - op=preview_session  : prévisualiser/éditer les cotes AVANT de lancer
 *   - op=create_session   : persister la session (avec ou sans cotes revues par l'admin)
 *
 * Chaque outcome porte `oddsSource` : 'api' (cote réelle du bookmaker) ou 'default'
 * (cote forfaitaire faute de donnée) → l'admin voit clairement ce qui est réel.
 */

import type { ParsedOdds } from './odds-provider';

export type OddsSource = 'api' | 'default' | 'manual';

export interface BlueprintOutcome {
  id: string;
  name: string;
  baseOdds: number;
  oddsSource: OddsSource;
}

export interface BlueprintMarket {
  id: string;
  type: string;
  title: string;
  outcomes: BlueprintOutcome[];
}

export interface MatchInput {
  id: string;
  homeTeam: string;
  awayTeam: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildSessionBlueprint(match: MatchInput, odds: ParsedOdds | null): BlueprintMarket[] {
  const matchId = match.id;
  const H = match.homeTeam;
  const A = match.awayTeam;
  const o = odds;

  // Choisit la cote API si dispo, sinon le défaut. Renvoie [valeur, source].
  const pick = (apiVal: number | null | undefined, def: number): [number, OddsSource] =>
    apiVal && apiVal > 1 ? [r2(apiVal), 'api'] : [def, 'default'];

  // Score exact : cote API du label si dispo.
  const pickScore = (label: string, def: number): [number, OddsSource] =>
    pick(o?.correctScores?.[label], def);

  const mk = (
    id: string,
    type: string,
    title: string,
    outcomes: { id: string; name: string; v: [number, OddsSource] }[],
  ): BlueprintMarket => ({
    id, type, title,
    outcomes: outcomes.map((oc) => ({ id: oc.id, name: oc.name, baseOdds: oc.v[0], oddsSource: oc.v[1] })),
  });

  return [
    mk(`m-${matchId}-resultat`, 'final_result', 'RÉSULTAT DU MATCH', [
      { id: `o-${matchId}-res-home`, name: H, v: pick(o?.resultHome, 1.8) },
      { id: `o-${matchId}-res-draw`, name: 'Nul', v: pick(o?.resultDraw, 3.2) },
      { id: `o-${matchId}-res-away`, name: A, v: pick(o?.resultAway, 2.9) },
    ]),

    mk(`m-${matchId}-score`, 'exact_score', 'SCORE EXACT', [
      { id: `o-${matchId}-se-10`, name: '1-0', v: pickScore('1-0', 3.5) },
      { id: `o-${matchId}-se-20`, name: '2-0', v: pickScore('2-0', 6.0) },
      { id: `o-${matchId}-se-21`, name: '2-1', v: pickScore('2-1', 7.5) },
      { id: `o-${matchId}-se-30`, name: '3-0', v: pickScore('3-0', 10.0) },
      { id: `o-${matchId}-se-01`, name: '0-1', v: pickScore('0-1', 9.0) },
      { id: `o-${matchId}-se-11`, name: '1-1', v: pickScore('1-1', 5.5) },
    ]),

    mk(`m-${matchId}-buteurs`, 'first_scorer', 'PREMIER BUTEUR', [
      { id: `o-${matchId}-pb-vedette-1`, name: `Buteur ${H} (Vedette)`, v: [3.8, 'default'] },
      { id: `o-${matchId}-pb-vedette-2`, name: `Buteur ${A} (Vedette)`, v: [4.2, 'default'] },
      { id: `o-${matchId}-pb-autre`, name: 'Autre Buteur', v: [2.8, 'default'] },
    ]),

    mk(`m-${matchId}-corners`, 'corners_count', `NOMBRE DE CORNERS ${H.toUpperCase()}`, [
      { id: `o-${matchId}-co-l5`, name: 'Moins de 5', v: [2.2, 'default'] },
      { id: `o-${matchId}-co-57`, name: 'Entre 5 et 7', v: [1.8, 'default'] },
      { id: `o-${matchId}-co-m7`, name: 'Plus de 7', v: [3.1, 'default'] },
    ]),

    mk(`m-${matchId}-res-ht`, 'halftime_result', 'RÉSULTAT À LA MI-TEMPS', [
      { id: `o-${matchId}-ht-res-home`, name: H, v: pick(o?.htResultHome, r2((o?.resultHome ?? 1.8) * 1.3)) },
      { id: `o-${matchId}-ht-res-draw`, name: 'Nul', v: pick(o?.htResultDraw, r2((o?.resultDraw ?? 3.2) * 0.7)) },
      { id: `o-${matchId}-ht-res-away`, name: A, v: pick(o?.htResultAway, r2((o?.resultAway ?? 2.9) * 1.3)) },
    ]),

    mk(`m-${matchId}-score-ht`, 'halftime_score', 'SCORE À LA MI-TEMPS', [
      { id: `o-${matchId}-ht-se-00`, name: '0-0', v: [2.3, 'default'] },
      { id: `o-${matchId}-ht-se-10`, name: '1-0', v: [3.8, 'default'] },
      { id: `o-${matchId}-ht-se-01`, name: '0-1', v: [4.8, 'default'] },
      { id: `o-${matchId}-ht-se-11`, name: '1-1', v: [6.5, 'default'] },
      { id: `o-${matchId}-ht-se-autre`, name: 'Autre Score', v: [5.0, 'default'] },
    ]),

    mk(`m-${matchId}-btts`, 'btts', 'LES DEUX ÉQUIPES MARQUENT', [
      { id: `o-${matchId}-btts-yes`, name: 'Oui', v: pick(o?.bttsYes, 1.85) },
      { id: `o-${matchId}-btts-no`, name: 'Non', v: pick(o?.bttsNo, 1.9) },
    ]),

    mk(`m-${matchId}-ou25`, 'over_under_25', 'PLUS DE 2.5 BUTS DANS LE MATCH ?', [
      { id: `o-${matchId}-ou25-yes`, name: 'Oui', v: pick(o?.ou25Over, 2.1) },
      { id: `o-${matchId}-ou25-no`, name: 'Non', v: pick(o?.ou25Under, 1.7) },
    ]),
  ];
}
