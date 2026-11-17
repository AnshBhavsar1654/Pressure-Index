import type { TermKey } from './terms'

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

export interface Moment {
  id: number
  date: string
  comp: string
  opp: string
  balls: number
  r: number
  out: number
  wpa: number
  /** the player's team's chance of winning before their first and after their last pressure ball */
  wp_from: number
  wp_to: number
  won: boolean
  /** plain headline for a finish or a final-over defence */
  headline: string | null
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
  /** rank in the submitted ranking (120+ pressure balls, 8+ matches, and signable by RR); null otherwise */
  rank: number | null
  /** rank among every qualified player, including those RR cannot sign */
  merit_rank: number | null
  /** why the player is outside the submitted ranking despite qualifying */
  excluded: 'rr' | 'pakistan' | 'retained' | null
  score: number | null
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
  z?: Record<ComponentKey, number>
  /** bootstrap rank stability, computed for the default pool only */
  boot: { p_top10: number; rank_med: number; rank_lo: number; rank_hi: number } | null
  press: TradStats
  norm: TradStats
  seasons: { season: number; p_balls: number; p_rv100: number | null; n_rv100: number | null }[]
  phases: { phase: string; balls: number; rv100: number | null }[]
  matches: PlayerMatch[]
  /** biggest pressure performances, largest win-chance swing first */
  moments: Moment[]
}

export interface RoleData {
  players: Player[]
  k: { kp: number; kp_cv: number; kn: number; mun: number; c_prior: number; cv_n: Record<string, number>; cv_p: Record<string, number> }
  split_half: Record<string, number>
  eligibility: {
    min_pressure_balls: number
    min_pressure_matches: number
    n_eligible: number
    /** qualified players RR can sign: the submitted ranking */
    n_ranked: number
    n_players: number
    export_min_balls: number
    export_min_matches: number
    n_exported: number
  }
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
  seasons: number[]
  pressure_threshold: number
  pressure_pctl: number
  knockout_mult: number
  season_weights: Record<string, number>
  comp_weights: Record<string, number>
  weights: Weights
  wp_model: Record<'1' | '2', WpMetrics> & {
    /** final over of a chase: the smooth model against the exact calculation, checked against results */
    endgame: { balls: number; brier_old: number; brier_new: number; rows: { situation: string; n: number; actual: number; old: number; new: number }[] }
  }
  contrast: { pressure: LeagueSlice; normal: LeagueSlice }
  by_phase: { innings: number; phase: string; balls: number; pressure_share: number; li: number }[]
  by_over: { innings: number; over: number; li: number; share: number }[]
  li_hist: { x: number; n: number; p: number }[]
  moments: { match: string; comp: string; date: string; over: string; state: string; striker: string; bowler: string; li: number; wp: number; result: string }[]
}

export interface ChaseGrid {
  cols: string[]
  rows: [number, number, number, number, number][] // wkts, overs_left, need, wp, li
}

/** Re-score players client-side from their component z-scores. */
const COMP_FIELD: Record<ComponentKey, 'p_rv100' | 'wpa100' | 'delta100' | 'cons'> = {
  pressure: 'p_rv100',
  impact: 'wpa100',
  delta: 'delta100',
  consistency: 'cons',
}

/**
 * Standardise each rating ingredient within the given pool (z-scores), blend them
 * with the weights and rank. Re-run whenever the pool changes, so a player is always
 * compared with the group currently on screen.
 */
export function rescore(players: Player[], w: Weights) {
  const keys = Object.keys(COMP_FIELD) as ComponentKey[]
  const stats = Object.fromEntries(
    keys.map((k) => {
      const v = players.map((p) => p[COMP_FIELD[k]])
      const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1)
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length || 1)) || 1
      return [k, { mean, sd }]
    }),
  ) as Record<ComponentKey, { mean: number; sd: number }>
  const total = keys.reduce((a, k) => a + w[k], 0) || 1
  const scored = players.map((p) => {
    const z = Object.fromEntries(keys.map((k) => [k, (p[COMP_FIELD[k]] - stats[k].mean) / stats[k].sd])) as Record<ComponentKey, number>
    return { ...p, z, liveScore: keys.reduce((a, k) => a + w[k] * z[k], 0) / total }
  })
  scored.sort((a, b) => b.liveScore - a.liveScore)
  // players RR cannot sign stay in the pool (they shape the averages) but take no rank
  let n = 0
  return scored.map((p) => ({ ...p, liveRank: p.excluded ? null : ++n }))
}

export type ScoredPlayer = ReturnType<typeof rescore>[number]

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  pressure: 'Under pressure',
  impact: 'Win impact',
  delta: 'Lift under pressure',
  consistency: 'Consistency',
}

/** The vocabulary entry that explains each rating ingredient. */
export const COMPONENT_TERM: Record<ComponentKey, TermKey> = {
  pressure: 'underPressure',
  impact: 'winImpact',
  delta: 'lift',
  consistency: 'consistency',
}


/* ----------------------------------------------------------------- RR 2026 */
export interface PhaseStats {
  bat_rv_pm: number; bowl_rv_pm: number; bat_rpo: number; bowl_rpo: number
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
  ipl26_balls: number; ipl_balls: number; rated: boolean; /** rank inside the 2026 franchise by runs added (1 = the team's most valuable player); null if not in an IPL 2026 squad */ core_rank: number | null; ipl26_net: number | null; sr?: number; avg?: number | null; econ?: number; bpw?: number | null; status: string
}
export interface Recommendation {
  gap: Gap; role: string; role_desc: string; default_min_balls: number; candidates: Candidate[]; internal: Candidate[]
}
export interface RRData {
  season: number
  summary: { pos: number; played: number; won: number; lost: number; points: number; nrr: number
    playoff_result: string | null; matches: number; wins_all: number }
  table: { pos: number; team: string; played: number; won: number; lost: number; nr: number; points: number; nrr: number }[]
  top4: string[]
  phases: RRPhase[]
  matchups: { bat_vs_pace: number; bat_vs_spin: number; bowl_pace: number; bowl_spin: number
    teams: { team: string; bat_vs_pace: number; bat_vs_spin: number; bowl_pace: number; bowl_spin: number }[] }
  order: { band: string; balls_pm: number; rv_pm: number; sr: number; league_sr: number; rv100: number; league_rv100: number }[]
  pressure: { bat: { balls_pm: number; rv_pm: number; rv100: number }; bowl: { balls_pm: number; rv_pm: number; rv100: number }
    league: { bat_rv100: number; bowl_rv100: number }; teams: { team: string; bat: number; bowl: number }[] }
  matches: RRMatch[]
  squad: SquadPlayer[]
  /** players in the IPL 2026 squad who were not in RR's 2025 squad */
  joined: { id: number; name: string; from_team: string | null; from_season: number | null; returning: boolean; ipl_seasons: number }[]
  gaps: Gap[]
  recommendations: Recommendation[]
  pool: { known: boolean; updated: string | null }
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
