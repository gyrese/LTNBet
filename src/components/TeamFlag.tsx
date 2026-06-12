'use client';

import { useState } from 'react';
import { flagUrlFor, flagFor } from '@/lib/flags';

/**
 * Affiche le drapeau/logo d'une équipe.
 * Priorité : logoUrl prop > flagcdn.com (nations) > emoji > ⚽
 */
export default function TeamFlag({
  team,
  logoUrl,
  className = '',
  fallbackClassName = '',
}: {
  team: string;
  logoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Logo custom (club ou override) : prioritaire
  const customUrl = logoUrl ?? null;
  // Drapeau nation depuis flagcdn
  const nationUrl = flagUrlFor(team);
  const url = customUrl || nationUrl;

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
