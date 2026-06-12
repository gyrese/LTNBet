'use client';

import React, { useEffect, useMemo, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface League { name: string; slug: string; eventsCount?: number }
interface MatchResult {
  id: string;
  oddsEventId: number | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  startsAt: string;
  league: string;
  leagueSlug: string;
}
type OddsSource = 'api' | 'default' | 'manual';
interface BlueprintOutcome { id: string; name: string; baseOdds: number; oddsSource: OddsSource }
interface BlueprintMarket { id: string; type: string; title: string; outcomes: BlueprintOutcome[]; disabled?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}

const inputClass =
  'w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all';

// En-têtes des requêtes admin (joint le secret stocké au déverrouillage du panneau).
const adminHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const s = sessionStorage.getItem('ltn_admin_secret');
    if (s) h['x-admin-secret'] = s;
  }
  return h;
};

const todayStr = () => new Date().toISOString().split('T')[0];

const shiftDate = (d: string, days: number) => {
  const base = d || todayStr();
  const dt = new Date(base + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
};

const statusBadge = (s: string) =>
  s === 'live'
    ? 'bg-error/12 border-error/30 text-error'
    : s === 'finished'
    ? 'bg-white/5 border-white/10 text-on-surface-variant/60'
    : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300';

export default function StartSessionModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<'select' | 'review'>('select');

  // Filtres
  const [leagues, setLeagues] = useState<{ popular: League[]; all: League[] }>({ popular: [], all: [] });
  const [leagueSlug, setLeagueSlug] = useState('');
  const [leagueLabel, setLeagueLabel] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const [date, setDate] = useState(todayStr());
  const [teamSearch, setTeamSearch] = useState('');

  // Résultats
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [demo, setDemo] = useState(false);

  // Revue des cotes
  const [selected, setSelected] = useState<MatchResult | null>(null);
  const [markets, setMarkets] = useState<BlueprintMarket[]>([]);
  const [bookmaker, setBookmaker] = useState<string | null>(null);
  const [apiOddsCount, setApiOddsCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState('');

  // ── Chargement initial des ligues ──
  useEffect(() => {
    if (!open) return;
    setStep('select');
    setError('');
    fetch('/api/admin/matches/search?op=leagues')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setLeagues({ popular: res.popular || [], all: res.all || [] });
          setDemo(Boolean(res.demo));
        }
      })
      .catch(() => {});
  }, [open]);

  // ── Chargement des matchs (déclenché par filtres) ──
  const loadEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ op: 'events' });
      if (leagueSlug) params.set('league', leagueSlug);
      if (date) params.set('date', date);
      if (teamSearch.trim()) params.set('q', teamSearch.trim());
      const res = await fetch(`/api/admin/matches/search?${params.toString()}`).then((r) => r.json());
      if (res.success) {
        setResults(res.results || []);
        setDemo(Boolean(res.demo));
      } else {
        setError(res.error || 'Erreur de recherche.');
      }
    } catch {
      setError('Erreur réseau lors de la recherche.');
    }
    setLoading(false);
  };

  // Recharge auto quand la ligue ou la date change
  useEffect(() => {
    if (!open) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leagueSlug, date]);

  const filteredAllLeagues = useMemo(() => {
    const q = leagueFilter.trim().toLowerCase();
    if (!q) return [];
    return leagues.all.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 40);
  }, [leagueFilter, leagues.all]);

  // ── Sélection d'un match → prévisualisation des cotes ──
  const selectMatch = async (m: MatchResult) => {
    setSelected(m);
    setPreviewLoading(true);
    setError('');
    setStep('review');
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ op: 'preview_session', match: m }),
      }).then((r) => r.json());
      if (res.success) {
        setMarkets(res.markets || []);
        setBookmaker(res.oddsBookmaker || null);
        setApiOddsCount(res.apiOddsCount || 0);
      } else {
        setError(res.error || 'Impossible de charger les cotes.');
      }
    } catch {
      setError('Erreur réseau lors du chargement des cotes.');
    }
    setPreviewLoading(false);
  };

  const reloadOdds = () => {
    if (selected) selectMatch(selected);
  };

  const updateOdds = (marketId: string, outcomeId: string, value: string) => {
    const v = parseFloat(value);
    setMarkets((prev) =>
      prev.map((m) =>
        m.id !== marketId
          ? m
          : {
              ...m,
              outcomes: m.outcomes.map((o) =>
                o.id !== outcomeId ? o : { ...o, baseOdds: Number.isFinite(v) ? v : o.baseOdds, oddsSource: 'manual' as OddsSource },
              ),
            },
      ),
    );
  };

  const toggleMarket = (marketId: string) => {
    setMarkets((prev) =>
      prev.map((m) =>
        m.id !== marketId ? m : { ...m, disabled: !m.disabled },
      ),
    );
  };

  // ── Lancement de la session ──
  const launch = async () => {
    if (!selected) return;

    // Filter active markets
    const activeMarkets = markets.filter((m) => !m.disabled);

    if (activeMarkets.length === 0) {
      setError('Vous devez activer au moins un marché de cotes avant de lancer la session.');
      return;
    }

    // Garde-fou : cotes valides (> 1)
    const bad = activeMarkets.some((m) => m.outcomes.some((o) => !(Number(o.baseOdds) > 1)));
    if (bad) {
      setError('Toutes les cotes doivent être supérieures à 1.00.');
      return;
    }
    setLaunching(true);
    setError('');
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ op: 'create_session', force: true, match: selected, markets: activeMarkets }),
      }).then((r) => r.json());
      if (res.success) {
        onCreated(`Session lancée : ${selected.homeTeam} vs ${selected.awayTeam}`);
        onClose();
      } else {
        setError(res.error || 'Impossible de lancer la session.');
      }
    } catch {
      setError('Erreur réseau lors du lancement.');
    }
    setLaunching(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-strong border border-white/10 rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col p-6 space-y-4">

        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/10 pb-3">
          <h3 className="font-headline-lg italic uppercase text-white text-[18px] flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-[22px]">sports_soccer</span>
            {step === 'select' ? 'Démarrer une session' : 'Vérifier les cotes'}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant/60 hover:text-white cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-all">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {demo && (
          <div className="bg-tertiary/10 text-tertiary border border-tertiary/25 p-3 rounded-xl text-center text-[12px] font-data-mono">
            Mode démo : aucune clé odds-api.io détectée. Les matchs et cotes sont fictifs.
          </div>
        )}
        {error && (
          <div className="bg-error/12 text-error border border-error/25 p-3 rounded-xl text-center text-[12px] font-data-mono">
            {error}
          </div>
        )}

        {/* ───────────── STEP 1 : SELECT ───────────── */}
        {step === 'select' && (
          <>
            {/* Filtres */}
            <div className="space-y-3">
              {/* Ligues populaires */}
              {leagues.popular.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setLeagueSlug(''); setLeagueLabel(''); }}
                    className={`font-label-caps text-[10px] px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                      !leagueSlug ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/[0.04] border-white/10 text-on-surface-variant hover:bg-white/[0.08]'
                    }`}
                  >
                    Toutes (du jour)
                  </button>
                  {leagues.popular.map((l) => (
                    <button
                      key={l.slug}
                      onClick={() => { setLeagueSlug(l.slug); setLeagueLabel(l.name); }}
                      className={`font-label-caps text-[10px] px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                        leagueSlug === l.slug ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/[0.04] border-white/10 text-on-surface-variant hover:bg-white/[0.08]'
                      }`}
                      title={l.name}
                    >
                      {shortLeague(l.name)}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Recherche de compétition */}
                <div className="relative">
                  <input
                    value={leagueFilter}
                    onChange={(e) => setLeagueFilter(e.target.value)}
                    placeholder="Filtrer une compétition…"
                    className={inputClass}
                  />
                  {filteredAllLeagues.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-surface-container-high border border-white/15 rounded-xl shadow-xl divide-y divide-white/5">
                      {filteredAllLeagues.map((l) => (
                        <button
                          key={l.slug}
                          onClick={() => { setLeagueSlug(l.slug); setLeagueLabel(l.name); setLeagueFilter(''); }}
                          className="w-full text-left px-3 py-2 text-[12px] text-on-surface hover:bg-white/[0.06] cursor-pointer flex justify-between gap-2"
                        >
                          <span className="truncate">{l.name}</span>
                          <span className="text-on-surface-variant/40 shrink-0">{l.eventsCount ?? ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setDate((d) => shiftDate(d, -1))} className="w-9 h-9 shrink-0 rounded-lg bg-white/[0.04] border border-white/10 text-on-surface-variant hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                  </button>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} text-center`} />
                  <button onClick={() => setDate((d) => shiftDate(d, 1))} className="w-9 h-9 shrink-0 rounded-lg bg-white/[0.04] border border-white/10 text-on-surface-variant hover:bg-white/[0.08] cursor-pointer flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                  </button>
                </div>
              </div>

              {/* Ligue sélectionnée + recherche équipe */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">
                  {leagueLabel ? <>Compétition : <span className="text-primary">{leagueLabel}</span></> : 'Toutes compétitions du jour'}
                </span>
                <input
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadEvents()}
                  placeholder="Filtrer par équipe…"
                  className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-white text-[12px] focus:outline-none focus:ring-2 focus:ring-primary/40 w-44"
                />
              </div>
            </div>

            {/* Liste des matchs */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[200px] max-h-[46vh]">
              {loading ? (
                <div className="text-center py-12 text-sm text-on-surface-variant/60 font-data-mono">Chargement des matchs…</div>
              ) : results.length > 0 ? (
                <div className="divide-y divide-white/5 border border-white/8 bg-white/[0.01] rounded-2xl overflow-hidden">
                  {results.map((m) => {
                    const isPast = new Date(m.startsAt).getTime() <= Date.now() || m.status === 'finished';
                    const statusText = m.status === 'upcoming' && isPast ? 'PASSÉ' : m.status.toUpperCase();
                    const badgeClass = m.status === 'upcoming' && isPast
                      ? 'bg-white/5 border-white/10 text-on-surface-variant/60'
                      : statusBadge(m.status);
                    return (
                      <div key={m.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-body-md font-bold text-white text-[14px] truncate">{m.homeTeam} <span className="text-on-surface-variant/40">vs</span> {m.awayTeam}</span>
                            <span className={`text-[9px] font-label-caps px-2 py-0.5 rounded-full border ${badgeClass}`}>{statusText}</span>
                          </div>
                          <span className="block text-[10px] font-data-mono text-on-surface-variant/60 mt-1 truncate">
                            {m.league ? `${m.league} · ` : ''}{new Date(m.startsAt).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {m.status === 'live' && ` · ${m.homeScore}-${m.awayScore}`}
                          </span>
                        </div>
                        {isPast ? (
                          <button
                            disabled
                            className="bg-white/5 border border-white/10 text-on-surface-variant/40 font-label-caps text-[10px] px-4 py-2 rounded-xl whitespace-nowrap shrink-0 cursor-not-allowed"
                          >
                            Passé
                          </button>
                        ) : (
                          <button
                            onClick={() => selectMatch(m)}
                            className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-label-caps text-[10px] px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Choisir
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-on-surface-variant/40 font-data-mono">
                  Aucun match pour ces filtres. Changez de compétition ou de date.
                </div>
              )}
            </div>
          </>
        )}

        {/* ───────────── STEP 2 : REVIEW ODDS ───────────── */}
        {step === 'review' && selected && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap bg-white/[0.02] border border-white/8 rounded-2xl p-3.5">
              <div>
                <span className="block font-headline-lg italic uppercase text-white text-[16px]">{selected.homeTeam} vs {selected.awayTeam}</span>
                <span className="block text-[10px] font-data-mono text-on-surface-variant/60 mt-0.5">{selected.league}</span>
              </div>
              <div className="text-right">
                {previewLoading ? (
                  <span className="text-[11px] font-data-mono text-on-surface-variant/60">Chargement des cotes…</span>
                ) : (
                  <>
                    <span className="block text-[11px] font-data-mono text-on-surface">
                      {bookmaker ? <>Cotes : <span className="text-emerald-300">{bookmaker}</span></> : <span className="text-tertiary">Cotes par défaut (bookmaker indisponible)</span>}
                    </span>
                    <span className="block text-[10px] font-data-mono text-on-surface-variant/60">{apiOddsCount} cote(s) réelle(s) · le reste éditable</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-label-caps text-on-surface-variant/70">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> réelle</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/30" /> défaut</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tertiary" /> modifiée</span>
              </span>
              <button onClick={reloadOdds} disabled={previewLoading} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] cursor-pointer disabled:opacity-40">
                <span className="material-symbols-outlined text-[14px]">refresh</span> Recharger
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-[42vh]">
              {markets.map((mk) => {
                const isMarketDisabled = mk.disabled === true;
                return (
                  <div
                    key={mk.id}
                    className={`border rounded-2xl p-3.5 transition-all ${
                      isMarketDisabled
                        ? 'bg-black/20 border-white/5 opacity-40 shadow-inner'
                        : 'bg-white/[0.02] border-white/6 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <span className={`font-label-caps text-[10px] tracking-wider ${isMarketDisabled ? 'text-on-surface-variant/40 line-through' : 'text-on-surface'}`}>
                        {mk.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleMarket(mk.id)}
                        className="text-on-surface-variant/60 hover:text-white shrink-0 flex items-center justify-center transition-colors focus:outline-none cursor-pointer"
                        title={isMarketDisabled ? 'Activer ce marché' : 'Désactiver ce marché'}
                      >
                        <span className={`material-symbols-outlined text-[24px] ${isMarketDisabled ? 'text-white/20' : 'text-emerald-400'}`}>
                          {isMarketDisabled ? 'toggle_off' : 'toggle_on'}
                        </span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mk.outcomes.map((o) => (
                        <div
                          key={o.id}
                          className={`flex items-center justify-between gap-2 border border-white/8 rounded-xl px-3 py-2 bg-white/[0.02] ${
                            isMarketDisabled ? 'opacity-30' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isMarketDisabled ? 'bg-white/10' : o.oddsSource === 'api' ? 'bg-emerald-400' : o.oddsSource === 'manual' ? 'bg-tertiary' : 'bg-white/30'}`} />
                            <span className={`text-[12px] truncate ${isMarketDisabled ? 'text-on-surface-variant/40' : 'text-on-surface'}`}>{o.name}</span>
                          </span>
                          <input
                            type="number"
                            step="0.05"
                            min="1.01"
                            value={o.baseOdds}
                            disabled={isMarketDisabled}
                            onChange={(e) => updateOdds(mk.id, o.id, e.target.value)}
                            className="w-20 shrink-0 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1 text-white text-[13px] font-data-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/40 tabular disabled:cursor-not-allowed"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
              <button onClick={() => setStep('select')} className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-on-surface font-label-caps text-[11px] px-4 py-2.5 rounded-xl cursor-pointer flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Retour
              </button>
              <button onClick={launch} disabled={launching || previewLoading} className="btn-gold font-label-caps text-[12px] px-6 py-2.5 rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">{launching ? 'progress_activity' : 'rocket_launch'}</span>
                {launching ? 'Lancement…' : 'Valider & lancer la session'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Raccourcit les noms de ligue (« France - Ligue 1 » → « Ligue 1 »).
function shortLeague(name: string) {
  const parts = name.split(' - ');
  return parts.length > 1 ? parts[1] : name;
}
