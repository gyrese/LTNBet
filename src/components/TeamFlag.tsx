'use client';

import { useState } from 'react';
import { flagUrlFor, flagFor } from '@/lib/flags';

/**
 * Affiche le drapeau d'une nation en image SVG haute qualité (flagcdn.com).
 * Repli automatique sur l'emoji puis ⚽ si la nation est inconnue ou l'image indisponible.
 */
export default function TeamFlag({
  team,
  className = '',
  fallbackClassName = '',
}: {
  team: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = flagUrlFor(team);

  if (url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={team}
        className={className}
        loading="eager"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className={fallbackClassName}>{flagFor(team)}</span>;
}
