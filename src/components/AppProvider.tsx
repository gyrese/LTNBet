'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/lib/store';

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const initFromSupabase = useGameStore((s) => s.initFromSupabase);

  useEffect(() => {
    initFromSupabase();
  }, [initFromSupabase]);

  return <>{children}</>;
}
