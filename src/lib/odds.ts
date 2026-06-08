/**
 * Calcule les cotes dynamiques pour un ensemble d'outcomes sur un marché donné.
 * 
 * @param outcomes Liste des options de paris avec leurs cotes de base et montants misés.
 * @param margin Marge du bookmaker (défaut : 8% soit 0.08).
 * @param dampingFactor Volume de mise virtuel (en ToilesCoins) de stabilisation pour éviter
 *                      des variations brutales sur les premières mises.
 * @returns Un tableau des cotes recalculées.
 */
export interface OutcomeInput {
  id: string;
  baseOdds: number;
  totalBetAmount: number;
}

export interface OutcomeOutput {
  id: string;
  odds: number;
}

export function calculateDynamicOdds(
  outcomes: OutcomeInput[],
  margin: number = 0.08,
  dampingFactor: number = 2000
): OutcomeOutput[] {
  // Somme totale des mises réelles sur ce marché
  const S = outcomes.reduce((acc, o) => acc + o.totalBetAmount, 0);

  // 1. Calcul de la pondération du public (w) : transition de 0 à 0.8
  const w = S === 0 ? 0 : Math.min(0.80, S / (S + dampingFactor));

  // 2. Probabilités implicites non normalisées
  const rawProbabilities = outcomes.map(o => {
    const baseProb = 1 / o.baseOdds;
    const publicShare = S === 0 ? 0 : o.totalBetAmount / S;
    const rawProb = (1 - w) * baseProb + w * publicShare;
    return {
      id: o.id,
      rawProb
    };
  });

  // Somme des probabilités non normalisées
  const sumRawProb = rawProbabilities.reduce((acc, p) => acc + p.rawProb, 0);

  // 3. Normalisation avec intégration de la marge du bar
  const normalizedProbabilities = rawProbabilities.map(p => {
    // Si la somme est 0 (sécurité), répartir équitablement
    const normProb = sumRawProb > 0 
      ? (p.rawProb / sumRawProb) * (1 + margin)
      : (1 / outcomes.length) * (1 + margin);
    return {
      id: p.id,
      prob: normProb
    };
  });

  // 4. Calcul de la cote finale et limitation à une cote minimale de 1.10
  return normalizedProbabilities.map(p => {
    const finalOdds = p.prob > 0 ? 1 / p.prob : 10.0;
    return {
      id: p.id,
      odds: Math.max(1.10, Math.round(finalOdds * 100) / 100)
    };
  });
}
