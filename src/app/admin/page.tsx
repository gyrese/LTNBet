'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/store';
import Navigation from '@/components/Navigation';

export default function AdminPage() {
  const router = useRouter();
  const {
    currentUser,
    isUserAdmin,
    promoteToAdmin,
    match,
    updateMatchStats,
    triggerGoal,
    markets,
    createFlashMarket,
    resolveMarket,
    closeMarket,
    deleteMarket,
    leaderboard,
    rewards,
    createReward,
    attributeReward,
    rewardLedger,
    claimReward,
    doubleGainsActive,
    toggleDoubleGains,
    runSimulationStep,
  } = useGameStore();

  const [flashTitle, setFlashTitle] = useState('');
  const [flashOptions] = useState([
    { name: 'Oui', baseOdds: 2.5 },
    { name: 'Non', baseOdds: 1.4 },
  ]);

  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardDesc, setRewardDesc] = useState('');
  const [rewardCost, setRewardCost] = useState(1000);

  const [selectedUser, setSelectedUser] = useState('');
  const [selectedReward, setSelectedReward] = useState('');

  // States pour la recherche de match et session
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sessionSuccess, setSessionSuccess] = useState('');

  const handleSearchMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/admin/matches/search?q=${encodeURIComponent(searchQuery)}`).then(r => r.json());
      if (res.success) {
        setSearchResults(res.results);
      }
    } catch (err) {
      console.error(err);
    }
    setSearchLoading(false);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleCreateSession = async (match: any) => {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'create_session', match })
      }).then(r => r.json());
      if (res.success) {
        setSessionSuccess(`Session créée avec succès pour le match ${match.homeTeam} - ${match.awayTeam} !`);
        // Refresh store
        useGameStore.getState().initFromSupabase();
        setTimeout(() => setSessionSuccess(''), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !currentUser) {
      router.push('/join');
    }
  }, [currentUser, router, mounted]);

  if (!mounted || !currentUser) return null;

  // Gate
  if (!isUserAdmin) {
    return (
      <div className="min-h-dvh flex flex-col justify-center items-center px-4">
        <div className="glass-strong gradient-border max-w-md p-8 rounded-3xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-tertiary/12 border border-tertiary/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px] text-tertiary">lock</span>
          </div>
          <h1 className="font-headline-lg italic uppercase tracking-tighter text-white">Espace Administrateur</h1>
          <p className="font-body-md text-on-surface-variant">
            Accès réservé au personnel du bar Les Toiles Noires pour le contrôle du match et des récompenses.
          </p>
          <button
            onClick={promoteToAdmin}
            className="btn-gold w-full font-headline-lg-mobile text-[17px] py-3.5 rounded-xl cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">lock_open</span>
            Déverrouiller l&apos;accès Admin
          </button>
        </div>
      </div>
    );
  }

  const totalBetsVolume = markets.reduce((sum, m) => sum + m.outcomes.reduce((s, o) => s + o.totalBetAmount, 0), 0);
  const totalBetsCount = markets.reduce((sum, m) => sum + m.outcomes.reduce((s, o) => s + o.totalBetsCount, 0), 0);

  const handleCreateFlash = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flashTitle.trim()) return;
    createFlashMarket(flashTitle, flashOptions);
    setFlashTitle('');
  };

  const handleCreateReward = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rewardTitle.trim()) return;
    createReward(rewardTitle, rewardDesc, rewardCost);
    setRewardTitle('');
    setRewardDesc('');
  };

  const handleAttribute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !selectedReward) return;
    attributeReward(selectedUser, selectedReward);
    setSelectedUser('');
    setSelectedReward('');
  };

  const inputClass = 'w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all';
  const sectionHead = 'font-label-caps text-label-caps text-on-surface tracking-widest border-b border-white/10 pb-3 flex items-center gap-2.5';

  return (
    <div className="min-h-dvh flex flex-col text-on-surface pb-28 md:pb-12 pt-24">
      <Navigation />

      <main className="flex-grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4">
          <h1 className="font-headline-lg italic uppercase tracking-tighter text-white flex items-center gap-3">
            <span className="material-symbols-outlined text-[34px] text-tertiary">admin_panel_settings</span>
            Panel Admin
          </h1>
          <button
            onClick={() => toggleDoubleGains(!doubleGainsActive)}
            className={`font-label-caps text-label-caps px-6 py-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
              doubleGainsActive
                ? 'btn-gold border-transparent'
                : 'bg-white/[0.04] border-white/10 text-on-surface-variant hover:bg-white/[0.08]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">bolt</span>
            {doubleGainsActive ? 'Double Gains Actif' : 'Activer Double Gains'}
          </button>
        </div>

        {/* Counters */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Counter label="CLIENTS CONNECTÉS" value={leaderboard.length + 1} accent="text-white" />
          <Counter label="TOTAL MISÉ (TC)" value={totalBetsVolume} accent="text-primary" />
          <Counter label="NB PARIS PLACÉS" value={totalBetsCount} accent="text-white" />
          <Counter label="PARIS EN COURS" value={markets.filter((m) => !m.isClosed).length} accent="text-tertiary" />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left */}
          <div className="lg:col-span-8 space-y-6">

            {/* Search Match and Session Creation */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-tertiary">search</span>
                RECHERCHE &amp; DÉMARRAGE DE SESSION
              </h2>
              
              <form onSubmit={handleSearchMatch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Chercher une équipe (ex: France, Espagne...)"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 font-label-caps text-label-caps px-6 py-2.5 rounded-xl cursor-pointer disabled:opacity-40 transition-all"
                >
                  {searchLoading ? '...' : 'Chercher'}
                </button>
              </form>

              {sessionSuccess && (
                <div className="bg-emerald-500/12 text-emerald-300 border border-emerald-500/25 p-3 rounded-xl text-center text-sm font-data-mono">
                  {sessionSuccess}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">MATCHS TROUVÉS</span>
                  <div className="divide-y divide-white/5 bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden">
                    {searchResults.map((m) => (
                      <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-body-md font-bold text-white">{m.homeTeam} vs {m.awayTeam}</span>
                            <span className={`text-[10px] font-label-caps px-2 py-0.5 rounded-full border ${
                              m.status === 'live' ? 'bg-error/12 border-error/30 text-error' : 'bg-white/5 border-white/10 text-on-surface-variant'
                            }`}>
                              {m.status.toUpperCase()}
                            </span>
                          </div>
                          <span className="block text-[11px] font-data-mono text-on-surface-variant/70 mt-1">
                            Début : {new Date(m.startsAt).toLocaleString('fr-FR')} {m.status === 'live' && `· Score : ${m.homeScore}-${m.awayScore}`}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCreateSession(m)}
                          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-label-caps text-[11px] px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
                        >
                          Créer Session
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Match control */}
            <section className="glass-panel rounded-2xl p-6 space-y-5">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-primary">stadium</span>
                CONTRÔLE DU MATCH
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                {/* Score */}
                <div className="space-y-2">
                  <span className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">SCORE DU MATCH</span>
                  <div className="flex items-center gap-3">
                    {([['FRA', match.homeScore, 'home'], ['ENG', match.awayScore, 'away']] as const).map(([lbl, score, side]) => (
                      <React.Fragment key={side}>
                        {side === 'away' && <span className="font-score-display text-[22px] opacity-30">:</span>}
                        <div className="flex flex-col items-center">
                          <span className="font-data-mono text-[11px] text-on-surface-variant">{lbl}</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              onClick={() => updateMatchStats(side === 'home' ? { homeScore: Math.max(0, match.homeScore - 1) } : { awayScore: Math.max(0, match.awayScore - 1) })}
                              className="bg-white/[0.04] hover:bg-white/[0.08] w-8 h-8 rounded-lg border border-white/10 cursor-pointer"
                            >
                              −
                            </button>
                            <span className="font-data-mono text-[20px] font-bold px-1.5 tabular">{score}</span>
                            <button
                              onClick={() => triggerGoal(side)}
                              className={`w-8 h-8 rounded-lg border font-bold cursor-pointer ${
                                side === 'home' ? 'bg-primary/20 hover:bg-primary/30 border-primary/30 text-primary' : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/10'
                              }`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <label htmlFor="match-status" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">STATUT DU MATCH</label>
                  <select
                    id="match-status"
                    value={match.status}
                    onChange={(e) => updateMatchStats({ status: e.target.value as typeof match.status })}
                    className={inputClass}
                  >
                    <option value="upcoming">Avant Match</option>
                    <option value="live">En Cours</option>
                    <option value="half_time">Mi-temps</option>
                    <option value="finished">Terminé</option>
                  </select>
                </div>

                {/* Minutes */}
                <div className="space-y-2">
                  <span className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">TEMPS ÉCOULÉ (MIN)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={match.elapsedTime}
                      onChange={(e) => updateMatchStats({ elapsedTime: Number(e.target.value) })}
                      className={`${inputClass} w-20 text-center font-data-mono`}
                    />
                    <button
                      onClick={() => runSimulationStep()}
                      className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] font-label-caps px-3 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                    >
                      +1 MIN
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Resolution */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-primary">gavel</span>
                RÉSOLUTION DES PARIS
              </h2>

              <div className="space-y-3">
                {markets.map((market) => (
                  <div key={market.id} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <span className="font-body-md font-bold text-white leading-tight">{market.title}</span>
                        <p className="text-[9px] font-label-caps text-on-surface-variant mt-1 tracking-wider">
                          {market.isFlash ? '⚡ PARI FLASH' : 'MARCHÉ NORMAL'}
                          {market.isClosed && ' · CLOS'}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {!market.isClosed && (
                          <button onClick={() => closeMarket(market.id)} className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 font-label-caps text-[9px] px-2.5 py-1.5 rounded-lg cursor-pointer">
                            GELER
                          </button>
                        )}
                        <button onClick={() => deleteMarket(market.id)} className="bg-error/10 hover:bg-error/20 border border-error/25 text-error font-label-caps text-[9px] px-2.5 py-1.5 rounded-lg cursor-pointer">
                          SUPPRIMER
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {market.outcomes.map((outcome) => {
                        const isResolved = market.resolvedOutcomeId === outcome.id;
                        return (
                          <button
                            key={outcome.id}
                            onClick={() => resolveMarket(market.id, outcome.id)}
                            disabled={market.resolvedOutcomeId !== null}
                            className={`px-3 py-1.5 rounded-lg font-data-mono text-[11px] border transition-all cursor-pointer tabular ${
                              isResolved
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold'
                                : market.resolvedOutcomeId !== null
                                ? 'opacity-30 border-white/5'
                                : 'bg-white/[0.04] hover:bg-white/[0.1] border-white/10 text-on-surface'
                            }`}
                          >
                            {outcome.name} ({outcome.currentOdds.toFixed(2)})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right */}
          <div className="lg:col-span-4 space-y-6">

            {/* Flash bet */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-tertiary">bolt</span>
                CRÉER UN PARI FLASH
              </h2>

              <form onSubmit={handleCreateFlash} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="flash-title" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">INTITULÉ DU PARI</label>
                  <input
                    type="text"
                    id="flash-title"
                    value={flashTitle}
                    onChange={(e) => setFlashTitle(e.target.value)}
                    placeholder="Ex: Mbappé marque de la tête"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] p-3 rounded-xl border border-white/8 text-center">
                    <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider">COTE OUI</span>
                    <span className="font-data-mono text-white text-sm font-bold tabular">2.50</span>
                  </div>
                  <div className="bg-white/[0.03] p-3 rounded-xl border border-white/8 text-center">
                    <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider">COTE NON</span>
                    <span className="font-data-mono text-white text-sm font-bold tabular">1.40</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!flashTitle.trim()}
                  className="btn-primary w-full font-label-caps text-label-caps py-3 rounded-xl cursor-pointer disabled:opacity-40"
                >
                  Diffuser le Pari Flash
                </button>
              </form>
            </section>

            {/* Reward attribution */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-tertiary">redeem</span>
                OFFRIR UN LOT
              </h2>

              <form onSubmit={handleAttribute} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="select-user" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">JOUEUR GAGNANT</label>
                  <select id="select-user" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className={inputClass}>
                    <option value="">-- Choisir un joueur --</option>
                    {currentUser && <option value={currentUser.id}>{currentUser.username} (Vous)</option>}
                    {leaderboard.map((u) => (
                      <option key={u.id} value={u.id}>{u.username} (Rang #{u.rank})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="select-reward" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">RÉCOMPENSE</label>
                  <select id="select-reward" value={selectedReward} onChange={(e) => setSelectedReward(e.target.value)} className={inputClass}>
                    <option value="">-- Sélectionner le lot --</option>
                    {rewards.map((r) => (
                      <option key={r.id} value={r.id}>{r.image} {r.title}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!selectedUser || !selectedReward}
                  className="btn-gold w-full font-label-caps text-label-caps py-3 rounded-xl cursor-pointer disabled:opacity-40"
                >
                  Attribuer le lot
                </button>
              </form>
            </section>

            {/* Create reward */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
                NOUVELLE RÉCOMPENSE
              </h2>
              <form onSubmit={handleCreateReward} className="space-y-3">
                <input type="text" value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)} placeholder="Titre du lot" className={inputClass} />
                <input type="text" value={rewardDesc} onChange={(e) => setRewardDesc(e.target.value)} placeholder="Description" className={inputClass} />
                <input type="number" value={rewardCost} onChange={(e) => setRewardCost(Number(e.target.value))} placeholder="Coût (TC)" className={`${inputClass} font-data-mono`} />
                <button type="submit" disabled={!rewardTitle.trim()} className="w-full bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 font-label-caps text-label-caps py-3 rounded-xl cursor-pointer disabled:opacity-40 transition-all">
                  Ajouter
                </button>
              </form>
            </section>

            {/* Ledger */}
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <h2 className={sectionHead}>
                <span className="material-symbols-outlined text-[18px] text-primary">history</span>
                DISTRIBUTION
              </h2>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {rewardLedger.length > 0 ? (
                  rewardLedger.map((led) => (
                    <div key={led.id} className="bg-white/[0.03] p-2.5 rounded-xl border border-white/8 flex justify-between items-center text-[12px] font-data-mono">
                      <div>
                        <span className="block text-white font-bold">{led.username}</span>
                        <span className="block text-[10px] text-on-surface-variant">{led.rewardTitle}</span>
                      </div>
                      {led.status === 'pending' ? (
                        <button onClick={() => claimReward(led.id)} className="bg-tertiary/15 hover:bg-tertiary/25 border border-tertiary/30 text-tertiary text-[9px] px-2.5 py-1 rounded-lg font-label-caps font-bold cursor-pointer">
                          MARQUER LIVRÉ
                        </button>
                      ) : (
                        <span className="text-emerald-400 font-label-caps text-[9px] font-bold bg-emerald-500/15 px-2 py-1 rounded-lg">LIVRÉ</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-[11px] text-on-surface-variant/40 py-5">Aucun lot attribué pour le moment.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="glass-panel rounded-2xl p-4 text-center">
      <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1.5 tracking-wider">{label}</span>
      <span className={`font-score-display text-[28px] ${accent} tabular`}>{value.toLocaleString()}</span>
    </div>
  );
}
