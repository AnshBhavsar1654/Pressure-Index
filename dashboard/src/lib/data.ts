import { useEffect, useState } from 'react'

export type Role = 'bat' | 'bowl'
export type ComponentKey = 'pressure' | 'impact' | 'delta' | 'consistency'
export type Weights = Record<ComponentKey, number>

export interface TradStats {
  balls: number
  runs: number
  outs: number
  dot_pct: number | null
  bnd_pct: number | null
  rv100: number | null
  sr: number | null
  avg: number | null
  econ?: number
}

export interface PlayerMatch {
  id: number
  date: string
  opp: string
  comp: string
  balls: number
  rv: number
  wpa: number
  r: number
  out: number
  li: number
}

export interface Player {
  id: number
  name: string
  rank: number
  score: number
  country: string | null
  ipl_team: string | null
  ipl_season: number | null
  hand: string | null
  bowl_type: string | null
  pace: string | null
  p_balls: number
  p_matches: number
  n_balls: number
  p_rv100: number
  n_rv100: number
  delta100: number
  wpa100: number
  cons: number
  cons_n: number
  z: Record<ComponentKey, number>
  boot: { p_top10: number; rank_med: number; rank_lo: number; rank_hi: number }
  press: TradStats
  norm: TradStats
  seasons: { season: number; p_balls: number; p_rv100: number | null; n_rv100: number | null }[]
  phases: { phase: string; balls: number; rv100: number | null }[]
  matches: PlayerMatch[]
  tiers: Record<string, number>
}

export interface RoleData {
  players: Player[]
  k: { kp: number; kp_cv: number; kn: number; mun: number; c_prior: number; cv_n: Record<string, number>; cv_p: Record<string, number> }
  split_half: Record<string, number>
  eligibility: { min_pressure_balls: number; min_pressure_matches: number; n_eligible: number; n_players: number }
}

export interface LeagueSlice {
  balls: number
  rpo: number
  wkt_pct: number
  dot_pct: number
  bnd_pct: number
  extras_pct: number
  li: number
}

export interface WpMetrics {
  auc: number
  brier: number
  logloss: number
  n_balls: number
  n_matches: number
  calibration: { pred: number; actual: number; n: number }[]
}

export interface Summary {
  n_balls: number
  n_matches: number
  n_ipl_matches: number
  n_t20i_matches: number
  n_emerging_matches: number
  seasons: number[]
  pressure_threshold: number
  pressure_pctl: number
  knockout_mult: number
  season_weights: Record<string, number>
  comp_weights: Record<string, number>
  weights: Weights
  wp_model: Record<'1' | '2', WpMetrics>
  contrast: { pressure: LeagueSlice; normal: LeagueSlice }
  by_phase: { innings: number; phase: string; balls: number; pressure_share: number; li: number }[]
  by_over: { innings: number; over: number; li: number; share: number }[]
  by_wkts: { innings: number; wkts: number; li: number; n: number }[]
  li_hist: { x: number; n: number; p: number }[]
  moments: { match: string; comp: string; date: string; over: string; state: string; striker: string; bowler: string; li: number; wp: number; result: string }[]
  outcome_probs: Record<string, Record<string, number>>
  re_ipl: number[][]
  re_t20i: number[][]
}

export interface ChaseGrid {
  cols: string[]
  rows: [number, number, number, number, number][] // wkts, overs_left, need, wp, li
}

export interface AppData {
  summary: Summary
  bat: RoleData
  bowl: RoleData
  grid: ChaseGrid
}

const base = import.meta.env.BASE_URL

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(`${base}data/${file}`)
  if (!res.ok) throw new Error(`Could not load ${file} (${res.status})`)
  return res.json() as Promise<T>
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([
      getJson<Summary>('summary.json'),
      getJson<RoleData>('batters.json'),
      getJson<RoleData>('bowlers.json'),
      getJson<ChaseGrid>('chase_grid.json'),
    ])
      .then(([summary, bat, bowl, grid]) => setData({ summary, bat, bowl, grid }))
      .catch((e: Error) => setError(e.message))
  }, [])
  return { data, error }
}

/** Re-score players client-side from their component z-scores. */
export function rescore(players: Player[], w: Weights) {
  const total = w.pressure + w.impact + w.delta + w.consistency || 1
  const scored = players.map((p) => ({
    ...p,
    liveScore:
      (w.pressure * p.z.pressure + w.impact * p.z.impact + w.delta * p.z.delta + w.consistency * p.z.consistency) /
      total,
  }))
  scored.sort((a, b) => b.liveScore - a.liveScore)
  return scored.map((p, i) => ({ ...p, liveRank: i + 1 }))
}

export type ScoredPlayer = ReturnType<typeof rescore>[number]

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  pressure: 'Pressure run value',
  impact: 'Win probability added',
  delta: 'Lift over own baseline',
  consistency: 'Match-to-match consistency',
}

export const COMPONENT_HINT: Record<ComponentKey, string> = {
  pressure: 'Runs above expected per 100 high-pressure balls, shrunk toward the player’s own level',
  impact: 'Share of match won per 100 high-pressure balls, from the win-probability model',
  delta: 'How much better (or worse) the player is under pressure than in ordinary situations',
  consistency: 'Share of pressure innings or spells that finished above expectation',
}
