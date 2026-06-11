'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store';
import StartSessionModal from '@/components/admin/StartSessionModal';
import PresencePanel from '@/components/admin/PresencePanel';

export default function AdminPage() {
  const {
    match,
    hasActiveMatch,
    updateMatchStats,
    triggerGoal,
    endMatch,
    closeSession,
    deleteSession,
    resetAll,
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

  // États de session (alertes + modal de création)
  const [sessionSuccess, setSessionSuccess] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'match' | 'joueurs'>('match');

  const handleSessionCreated = (msg: string) => {
    setSessionError('');
    setSessionSuccess(msg);
    useGameStore.getState().initFromSupabase();
    setTimeout(() => setSessionSuccess(''), 4000);
  };

  // L'admin est INDÉPENDANT des comptes joueurs : accès via l'URL /admin + mot de passe (session navigateur).
  const [mounted, setMounted] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && sessionStorage.getItem('ltn_admin_ok') === '1') {
      setAdminUnlocked(true);
    }
  }, []);

  if (!mounted) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation côté serveur : le mot de passe saisi EST le secret admin (jamais dans le bundle).
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': pwInput },
        body: JSON.stringify({ op: 'admin_check' }),
      });
      if (res.ok) {
        sessionStorage.setItem('ltn_admin_ok', '1');
        sessionStorage.setItem('ltn_admin_secret', pwInput); // réutilisé par toutes les requêtes admin
        setAdminUnlocked(true);
        setPwError('');
      } else {
        setPwError('Mot de passe incorrect.');
      }
    } catch {
      setPwError('Erreur réseau, réessayez.');
    }
  };

  const handleLockAdmin = () => {
    sessionStorage.removeItem('ltn_admin_ok');
    sessionStorage.removeItem('ltn_admin_secret');
    setAdminUnlocked(false);
    setPwInput('');
  };

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

  // Gate mot de passe
  if (!adminUnlocked) {
    return (
      <div className="min-h-dvh flex flex-col justify-center items-center px-4">
        <form onSubmit={handleUnlock} className="glass-strong gradient-border max-w-md w-full p-8 rounded-3xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-tertiary/12 border border-tertiary/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px] text-tertiary">shield_person</span>
          </div>
          <div className="space-y-1">
            <h1 className="font-headline-lg italic uppercase tracking-tighter text-white">Espace Administrateur</h1>
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Accès réservé au personnel du bar. Indépendant des comptes joueurs.
            </p>
          </div>
          <div className="space-y-2 text-left">
            <label htmlFor="admin-pw" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">
              MOT DE PASSE
            </label>
            <input
              id="admin-pw"
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white font-body-md placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-tertiary/60 focus:border-transparent transition-all"
              placeholder="••••••••"
            />
            {pwError && (
              <p className="text-error font-data-mono text-[12px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {pwError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn-gold w-full font-headline-lg-mobile text-[17px] py-3.5 rounded-xl cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">lock_open</span>
            Déverrouiller
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col text-on-surface pb-12 pt-8">
      <main className="flex-grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-white/10 pb-4">
          <h1 className="font-headline-lg italic uppercase tracking-tighter text-white flex items-center gap-3">
            <span className="material-symbols-outlined text-[34px] text-tertiary">admin_panel_settings</span>
            Panel Admin
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-toggle-double-gains"
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
            <button
              onClick={handleLockAdmin}
              title="Verrouiller l'accès admin"
              className="font-label-caps text-label-caps px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] text-on-surface-variant hover:bg-white/[0.08] transition-all cursor-pointer flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">lock</span>
              Quitter
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-2 border-b border-white/10">
          {([
            { id: 'match' as const, label: 'Gestion du match', icon: 'stadium' },
            { id: 'joueurs' as const, label: 'Joueurs connectés', icon: 'group', badge: onlineCount },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`relative font-label-caps text-[11px] px-5 py-3 -mb-px border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === t.id
                  ? 'border-primary text-white'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span className="font-data-mono text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 rounded-full tabular">{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Info alerts */}
        {sessionSuccess && (
          <div className="bg-emerald-500/12 text-emerald-300 border border-emerald-500/25 p-4 rounded-xl text-center text-sm font-data-mono">
            {sessionSuccess}
          </div>
        )}
        {sessionError && (
          <div className="bg-error/12 text-error border border-error/25 p-4 rounded-xl text-center text-sm font-data-mono">
            {sessionError}
          </div>
        )}

        {/* Counters */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Counter label="JOUEURS CONNECTÉS" value={onlineCount} accent="text-emerald-400" />
          <Counter label="TOTAL MISÉ (TC)" value={totalBetsVolume} accent="text-primary" />
          <Counter label="NB PARIS PLACÉS" value={totalBetsCount} accent="text-white" />
          <Counter label="PARIS EN COURS" value={markets.filter((m) => !m.isClosed).length} accent="text-tertiary" />
        </section>

        {/* Présence : toujours montée (compteur live), visible seulement sous l'onglet Joueurs */}
        <div className={activeTab === 'joueurs' ? 'block' : 'hidden'}>
          <PresencePanel onCountChange={setOnlineCount} />
        </div>

        {/* ───────────── ONGLET « GESTION DU MATCH » ───────────── */}
        {activeTab === 'match' && (
        <>

        {/* No active match section */}
        {!hasActiveMatch && (
          <section className="glass-panel rounded-3xl p-12 text-center max-w-xl mx-auto space-y-6 border border-white/8">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-white/[0.02] border border-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[44px] text-on-surface-variant/40">sports_soccer</span>
            </div>
            <div className="space-y-2">
              <h2 className="font-headline-lg italic uppercase text-white">Aucun match en cours</h2>
              <p className="font-body-md text-sm text-on-surface-variant max-w-md mx-auto">
                Pour lancer les paris et démarrer l&apos;expérience au bar, importez ou sélectionnez un match de football.
              </p>
            </div>
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className="btn-gold font-headline-lg-mobile text-[16px] px-8 py-4 rounded-xl cursor-pointer inline-flex items-center gap-2.5"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              Démarrer une session
            </button>
          </section>
        )}

        {hasActiveMatch && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left Column */}
            <div className="lg:col-span-8 space-y-6">

              {/* Match Card display */}
              <section className="glass-panel rounded-2xl p-6 space-y-6 border border-white/8 relative overflow-hidden">
                {/* Visual indicator decorative */}
                <div className="absolute top-0 left-0 w-2 h-full bg-primary" />
                
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        stadium
                      </span>
                    </div>
                    <div>
                      <span className="block font-label-caps text-[9px] text-primary tracking-widest">SESSION DE MATCH ACTIVE</span>
                      <h2 className="font-headline-lg italic uppercase text-white text-[20px]">
                        {match.homeTeam} vs {match.awayTeam}
                      </h2>
                    </div>
                  </div>
                  <span className={`font-label-caps text-[10px] px-3.5 py-1.5 rounded-full border self-start sm:self-center ${
                    match.status === 'finished' ? 'bg-error/12 border-error/30 text-error'
                    : match.status === 'upcoming' ? 'bg-tertiary/12 border-tertiary/30 text-tertiary'
                    : 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {match.status === 'finished' ? 'Match Terminé' : match.status === 'half_time' ? 'Mi-Temps' : match.status === 'upcoming' ? 'Avant Match' : 'Match En Cours'}
                  </span>
                </div>

                {/* Score and Stats block */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/[0.02] border border-white/6 rounded-2xl p-5 items-center">
                  
                  {/* Score Board and Controls */}
                  <div className="flex justify-center items-center gap-4 md:col-span-2">
                    {/* Home Team */}
                    <div className="text-right flex-1">
                      <span className="block font-label-caps text-[11px] text-on-surface-variant truncate">{match.homeTeam}</span>
                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button
                          onClick={() => updateMatchStats({ homeScore: Math.max(0, match.homeScore - 1) })}
                          className="bg-white/[0.04] hover:bg-white/[0.08] w-8 h-8 rounded-lg border border-white/10 cursor-pointer text-sm font-bold flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="font-headline-lg italic text-[24px] text-white tabular px-1">{match.homeScore}</span>
                        <button
                          onClick={() => triggerGoal('home')}
                          className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary w-8 h-8 rounded-lg font-bold cursor-pointer text-sm flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="font-score-display text-[26px] opacity-40 px-1">:</div>

                    {/* Away Team */}
                    <div className="text-left flex-1">
                      <span className="block font-label-caps text-[11px] text-on-surface-variant truncate">{match.awayTeam}</span>
                      <div className="flex items-center justify-start gap-2 mt-2">
                        <button
                          onClick={() => triggerGoal('away')}
                          className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 w-8 h-8 rounded-lg font-bold cursor-pointer text-sm flex items-center justify-center"
                        >
                          +
                        </button>
                        <span className="font-headline-lg italic text-[24px] text-white tabular px-1">{match.awayScore}</span>
                        <button
                          onClick={() => updateMatchStats({ awayScore: Math.max(0, match.awayScore - 1) })}
                          className="bg-white/[0.04] hover:bg-white/[0.08] w-8 h-8 rounded-lg border border-white/10 cursor-pointer text-sm font-bold flex items-center justify-center"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Match Time & Stats */}
                  <div className="border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 flex flex-col justify-center gap-1.5">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-on-surface-variant font-label-caps text-[10px]">Temps Écoulé</span>
                      <span className="font-data-mono font-bold text-white">{match.elapsedTime}&apos;</span>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-on-surface-variant font-label-caps text-[10px]">Possession (Dom)</span>
                      <span className="font-data-mono text-white">{match.possessionHome}%</span>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-on-surface-variant font-label-caps text-[10px]">Tirs Cadrés (Dom)</span>
                      <span className="font-data-mono text-white">{match.shotsOnTargetHome}</span>
                    </div>
                  </div>
                </div>

                {/* Simulation and Time Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="match-status-select" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">MODIFIER LE STATUT</label>
                    <select
                      id="match-status-select"
                      value={match.status}
                      onChange={(e) => updateMatchStats({ status: e.target.value as typeof match.status })}
                      className={inputClass}
                    >
                      <option value="upcoming">Avant Match</option>
                      <option value="live">En Cours / Live</option>
                      <option value="half_time">Mi-temps</option>
                      <option value="finished">Terminé</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">TEMPS &amp; SIMULATION</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={match.elapsedTime}
                        onChange={(e) => updateMatchStats({ elapsedTime: Number(e.target.value) })}
                        className={`${inputClass} text-center font-data-mono w-24`}
                      />
                      <button
                        onClick={() => runSimulationStep()}
                        className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[10px] font-label-caps px-4 py-2.5 rounded-xl transition-all cursor-pointer flex-1 flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">play_arrow</span>
                        +1 Minute (Sim)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Session Lifecycle Buttons */}
                <div className="border-t border-white/10 pt-5 space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="font-label-caps text-[10px] text-on-surface-variant tracking-wider flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-primary">settings</span>
                      ACTIONS DE CYCLE DE VIE DE LA SESSION
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Terminer le match */}
                    <button
                      onClick={endMatch}
                      disabled={match.status === 'finished'}
                      className="bg-error/10 hover:bg-error/20 border border-error/30 text-error font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined text-[16px]">sports_score</span>
                      Terminer le match
                    </button>

                    {/* Fermer la session (archive + déconnexion globale) */}
                    <button
                      onClick={() => { if (confirm('Fermer la session ? Tous les joueurs seront déconnectés du jeu et les résultats archivés.')) closeSession(); }}
                      className="bg-tertiary/10 hover:bg-tertiary/20 border border-tertiary/30 text-tertiary font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                      Fermer &amp; archiver
                    </button>

                    {/* Supprimer complètement */}
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="bg-error/10 hover:bg-error/20 border border-error/20 text-error font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                        Supprimer le Match
                      </button>
                    ) : (
                      <button
                        onClick={async () => { await deleteSession(); setConfirmDelete(false); }}
                        className="bg-error/30 hover:bg-error/40 border border-error/60 text-error font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 animate-pulse font-bold"
                      >
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        Confirmer Suppr
                      </button>
                    )}

                    {/* Réinitialiser tout */}
                    {!confirmReset ? (
                      <button
                        onClick={() => setConfirmReset(true)}
                        className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-on-surface-variant font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                        Réinitialiser tout
                      </button>
                    ) : (
                      <button
                        onClick={async () => { await resetAll(); setConfirmReset(false); }}
                        className="bg-error/20 hover:bg-error/30 border border-error/50 text-error font-label-caps text-[10px] py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 animate-pulse"
                      >
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        Confirmer reset
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Resolution Panel */}
              <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
                <h2 className={sectionHead}>
                  <span className="material-symbols-outlined text-[18px] text-primary">gavel</span>
                  RÉSOLUTION DES PARIS
                </h2>

                <div className="space-y-3">
                  {markets.map((market) => (
                    <div key={market.id} className="bg-white/[0.02] border border-white/6 rounded-2xl p-4 space-y-3">
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

            {/* Right Column */}
            <div className="lg:col-span-4 space-y-6">

              {/* Flash bet */}
              <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
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
              <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
                <h2 className={sectionHead}>
                  <span className="material-symbols-outlined text-[18px] text-tertiary">redeem</span>
                  OFFRIR UN LOT
                </h2>

                <form onSubmit={handleAttribute} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="select-user" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">JOUEUR GAGNANT</label>
                    <select id="select-user" value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className={inputClass}>
                      <option value="">-- Choisir un joueur --</option>
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
              <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
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
              <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
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
        )}

        </>
        )}
      </main>

      {/* Modal de création de session : recherche (ligue + date) → revue des cotes → lancement */}
      <StartSessionModal
        open={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onCreated={handleSessionCreated}
      />

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
