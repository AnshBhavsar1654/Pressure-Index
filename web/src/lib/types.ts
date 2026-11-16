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
  pressure: 'Output under pressure',
  impact: 'Match-winning impact',
  delta: 'Rise above own normal',
  consistency: 'Consistency',
}

export const COMPONENT_HINT: Record<ComponentKey, string> = {
  pressure: 'Runs added per 100 high-pressure balls, compared with an average player in the same situations',
  impact: 'How much each pressure ball moved the team’s chance of winning',
  delta: 'How much better (or worse) the player is under pressure than in ordinary moments',
  consistency: 'Share of pressure innings or spells that beat the average',
}

/* ----------------------------------------------------------------- RR 2026 */
export interface PhaseStats {
  bat_rv_pm: number; bowl_rv_pm: number; bat_rpo: number; bowl_rpo: number
  bat_bpw: number; bowl_bpw: number; bat_dot: number; bowl_dot: number; bat_bnd: number; bowl_bnd: number
}
export interface RRPhase {
  phase: string; overs: string; rr: PhaseStats; league: PhaseStats; top4: PhaseStats
  bat_rank: number; bowl_rank: number; teams: { team: string; bat: number; bowl: number }[]
}
export interface RRMatch {
  id: number; date: string; opp: string; stage: string; result: string; won: boolean; rr_batted_first: boolean
  scores: Record<string, { team: string; runs: number; wkts: number; balls: number }>
  bat_rv: number; bowl_rv: number; pressure_balls: number
  best: { bat: string | null; bowl: string | null }; worst: { bat: string | null; bowl: string | null }
  worm: [number, number, number, number][] // ball idx, RR win prob, pressure flag, innings
}
export interface SquadPlayer {
  id: number; name: string; nat: string; overseas: boolean; matches: number
  bat?: { balls: number; runs: number; outs: number; sr: number; avg: number | null; rv: number; rv100: number
    p_balls: number; p_rv100: number | null; phases: Record<string, { balls: number; sr: number; rv100: number | null }> }
  bowl?: { balls: number; runs: number; wkts: number; econ: number; rv: number; rv100: number; type: string; pace: string
    p_balls: number; p_rv100: number | null; phases: Record<string, { balls: number; econ: number; rv100: number | null }> }
}
export interface Gap {
  key: string; discipline: 'bat' | 'bowl'; phase: string; rr_rv_pm: number; top4_rv_pm: number
  gap_vs_avg: number; gap_vs_top4: number; rank: number
}
export interface Candidate {
  id: number; name: string; nat: string; overseas: boolean; ipl_team_2026: string | null; balls: number
  rv100: number; fit: number; press_score: number | null; press_rank: number | null
  ipl26_balls: number; ipl_balls: number; sr?: number; avg?: number | null; econ?: number; bpw?: number | null; status: string
}
export interface Recommendation {
  gap: Gap; role: string; role_desc: string; candidates: Candidate[]; internal: Candidate[]; pool_size: number
}
export interface RRData {
  season: number
  summary: { pos: number; played: number; won: number; lost: number; points: number; nrr: number
    playoff_result: string | null; matches: number; wins_all: number }
  table: { pos: number; team: string; played: number; won: number; lost: number; nr: number; points: number; nrr: number }[]
  top4: string[]
  phases: RRPhase[]
  matchups: { bat_vs_pace: number; bat_vs_spin: number; bowl_pace: number; bowl_spin: number; bowl_pace_share: number
    league_pace_share: number; teams: { team: string; bat_vs_pace: number; bat_vs_spin: number; bowl_pace: number; bowl_spin: number }[] }
  order: { band: string; balls_pm: number; rv_pm: number; sr: number; league_sr: number; rv100: number; league_rv100: number }[]
  pressure: { bat: { balls_pm: number; rv_pm: number; rv100: number }; bowl: { balls_pm: number; rv_pm: number; rv100: number }
    league: { bat_rv100: number; bowl_rv100: number }; teams: { team: string; bat: number; bowl: number }[] }
  matches: RRMatch[]
  squad: SquadPlayer[]
  gaps: Gap[]
  strengths: Gap[]
  recommendations: Recommendation[]
  pool: { known: boolean; note: string | null; updated: string | null }
  provenance: Provenance
}

export interface Provenance {
  files: { file: string; use: string; rows: number | null }[]
  comp_id: number
  match_ids: number[]
  league_balls: number
  league_matches: number
  reference: { name: string; url: string; accessed: string }
  checks: { item: string; public: string; ours: string; match: boolean }[]
  checks_passed: number
}
