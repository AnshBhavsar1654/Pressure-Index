import type { TermKey } from './terms'

export type Role = 'bat' | 'bowl'
/** The evidence shown beside each rating. Only `pressure` (the rating itself) decides the rank. */
export type ComponentKey = 'pressure' | 'normal' | 'delta' | 'impact' | 'consistency'

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
  /** what an average batter would strike at on exactly these balls (before wickets) */
  par_sr?: number | null
  /** what an average bowler would concede per over on exactly these balls (before wickets) */
  par_econ?: number | null
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
  /** rank among every player who clears the evidence bar, by rating; null below the bar */
  rank: number | null
  /** latest national side; IPL-only players are Indian unless the reference table says otherwise */
  country: string | null
  /** has played a T20 international in the data */
  capped: boolean
  ipl_team: string | null
  ipl_season: number | null
  p_balls: number
  p_matches: number
  n_balls: number
  /** pressure balls as the evidence bar counts them (a knockout first-innings ball counts half), all and recent */
  p_eff: number
  r_eff: number
  /** THE rating: runs added per 100 pressure balls, shrunk toward the usual level until the record is long */
  p_rv100: number
  /** usual level: the same measure on the other balls */
  n_rv100: number
  /** the raw pressure record (recency-weighted runs added per 100 pressure balls), before shrinkage */
  p_raw100: number
  /** lift: rating minus usual level */
  delta100: number
  /** win chance added per 100 pressure balls (a fraction; x100 for points) */
  wpa100: number
  /** share of pressure innings or spells (6+ balls) that beat the average; null if none */
  cons: number | null
  c_n: number
  /** the rating for the recent seasons alone */
  recent100: number
  r_balls: number
  r_matches: number
  /** first season the player appears in top-level cricket in the data */
  debut: number
  /** played top-level cricket in the latest season */
  active: boolean
  /** first top-level season within the last three */
  new_face: boolean
  /** unsupervised playing-style cluster and its position on the 2-D map (players with 300+ balls) */
  archetype: { name: string; x: number; y: number } | null
  z?: Record<ComponentKey, number>
  /** share of the pool (0-100) this player beats on each piece of evidence */
  beats?: Record<ComponentKey, number>
  /** bootstrap (400 match resamples): rank and rating intervals, for qualified players */
  boot: { p_top10: number; rank_med: number; rank_lo: number; rank_hi: number; rating_lo: number | null; rating_hi: number | null } | null
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
  k: { K: number }
  /** odd against even matches, for rating / normal / lift / wpa100 / cons */
  split_half: Record<'rating' | 'normal' | 'lift' | 'wpa100' | 'cons', number>
  /** forward test: ratings from earlier seasons against the next season's pressure output */
  forward: { n: number; rating: number; normal: number; lift: number; wpa100: number }
  eligibility: {
    min_pressure_balls: number
    min_pressure_matches: number
    recent_from: number
    min_recent_balls: number
    new_from: number
    active_season: number
    n_eligible: number
    n_ranked: number
    n_players: number
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
  coef?: Record<string, number>
}

export interface Summary {
  n_balls: number
  n_matches: number
  n_ipl_matches: number
  n_t20i_matches: number
  n_t20i_full: number
  n_top_level_matches: number
  n_top_level_balls: number
  seasons: number[]
  world_cups: { name: string; matches: number }[]
  source: { name: string; url: string; licence: string }
  pressure_threshold: number
  pressure_pctl: number
  K: number
  season_weights: Record<string, number>
  top_level: string[]
  min_match_balls: number
  n_reduced_included: number
  n_short_excluded: number
  forward: Record<Role, { n: number; rating: number; normal: number; lift: number; wpa100: number }>
  wp_model: Record<'1' | '2', WpMetrics> & {
    /** final over of a chase: the smooth model against the exact calculation, checked against results */
    endgame: { balls: number; brier_old: number; brier_new: number; rows: { situation: string; n: number; actual: number; old: number; new: number }[] }
  }
  contrast: { pressure: LeagueSlice; normal: LeagueSlice }
  by_phase: { innings: number; phase: string; balls: number; pressure_share: number; li: number }[]
  by_over: { innings: number; over: number; li: number; share: number }[]
  li_hist: { x: number; n: number; p: number }[]
  moments: { id: number; match: string; comp: string; date: string; over: string; state: string; striker: string; bowler: string; li: number; wp: number; result: string }[]
}

export interface ChaseGrid {
  cols: string[]
  rows: [number, number, number, number, number][] // wkts, overs_left, need, wp, li
}

const COMP_FIELD: Record<ComponentKey, 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons'> = {
  pressure: 'p_rv100',
  normal: 'n_rv100',
  delta: 'delta100',
  impact: 'wpa100',
  consistency: 'cons',
}

/**
 * Rank a pool by the rating. Each piece of evidence is also put on a common scale within the pool
 * (z, shown as "better than X%"), but only the rating decides the order.
 */
export function rescore(players: Player[]) {
  const keys = Object.keys(COMP_FIELD) as ComponentKey[]
  const stats = Object.fromEntries(
    keys.map((k) => {
      const v = players.map((p) => p[COMP_FIELD[k]]).filter((x): x is number => x != null)
      const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1)
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length || 1)) || 1
      return [k, { mean, sd }]
    }),
  ) as Record<ComponentKey, { mean: number; sd: number }>
  const sorted = Object.fromEntries(
    keys.map((k) => [k, players.map((p) => p[COMP_FIELD[k]]).filter((x): x is number => x != null).toSorted((a, b) => a - b)]),
  ) as Record<ComponentKey, number[]>
  const share = (k: ComponentKey, v: number | null) => {
    const xs = sorted[k]
    if (v == null || !xs.length) return 50
    let below = 0
    while (below < xs.length && xs[below] < v) below++
    return Math.round((100 * below) / xs.length)
  }
  const scored = players
    .map((p) => {
      const z = Object.fromEntries(keys.map((k) => [k, ((p[COMP_FIELD[k]] ?? stats[k].mean) - stats[k].mean) / stats[k].sd])) as Record<ComponentKey, number>
      const beats = Object.fromEntries(keys.map((k) => [k, share(k, p[COMP_FIELD[k]])])) as Record<ComponentKey, number>
      return { ...p, z, beats, liveScore: p.p_rv100 }
    })
    .toSorted((a, b) => b.liveScore - a.liveScore)
  return scored.map((p, i) => ({ ...p, liveRank: (i + 1) as number | null }))
}

export type ScoredPlayer = ReturnType<typeof rescore>[number]

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  pressure: 'Pressure rating',
  normal: 'Usual level',
  delta: 'Lift under pressure',
  impact: 'Win impact',
  consistency: 'Consistency',
}

/** The vocabulary entry that explains each piece of evidence. */
export const COMPONENT_TERM: Record<ComponentKey, TermKey> = {
  pressure: 'underPressure',
  normal: 'normal',
  delta: 'lift',
  impact: 'winImpact',
  consistency: 'consistency',
}

/* ----------------------------------------------------------------- teams */
export interface TeamPhase {
  phase: string; overs: string; bat: number; bowl: number; bat_rpo: number; bowl_rpo: number; bat_rank: number; bowl_rank: number
}
export interface TeamMatch {
  id: number; date: string; opp: string; stage: string; result: string; won: boolean | null
  scores: Record<string, { team: string; runs: number; wkts: number; balls: number }>
  bat_rv: number; bowl_rv: number; pressure_balls: number
}
export interface TeamPlayer {
  id: number; name: string; matches: number; rv: number
  bat?: { balls: number; runs: number; outs: number; sr: number; rv: number; p_balls: number; p_rv100: number | null }
  bowl?: { balls: number; runs: number; wkts: number; econ: number; rv: number; p_balls: number; p_rv100: number | null }
}
export interface TeamSeason {
  summary: { pos: number; played: number; won: number; lost: number; nr: number; points: number; nrr: number
    matches: number; wins_all: number; bat_rv_pm: number; bowl_rv_pm: number }
  phases: TeamPhase[]
  order: { band: string; balls_pm: number; rv_pm: number; sr: number; league_sr: number }[]
  pressure: { bat_rv100: number; bowl_rv100: number; bat_rv_pm: number; bowl_rv_pm: number; balls_pm: number }
  matches: TeamMatch[]
  squad: TeamPlayer[]
}
export interface Season {
  season: number; champion: string | null
  table: { pos: number; team: string; played: number; won: number; lost: number; nr: number; points: number; nrr: number }[]
  teams: Record<string, TeamSeason>
  league: { matches: number; balls: number }
}
export interface TeamsData { seasons: number[]; by_season: Record<string, Season> }

/* ----------------------------------------------------------------- matches */
export interface MatchIndexRow {
  id: number; date: string; comp: string; stage: string; teams: [string, string]; winner: string | null; result: string
  knockout: boolean; score: string; max_li: number; pressure: number; drama: number
}
/** [innings, "over.ball", WP of the side batting first, stakes, pressure flag, outcome, striker idx, bowler idx] */
export type BallRow = [number, string, number, number, number, string, number, number]
export interface MatchDetail {
  id: number; date: string; comp: string; stage: string; teams: [string, string]; winner: string | null; result: string
  venue_country: string | null; knockout: boolean; target: number | null
  innings: { team: string; runs: number; wkts: number; balls: number; pressure: number }[]
  people: string[]
  balls: BallRow[]
  batting: { name: string; team: string; r: number; b: number; rv: number; wpa: number }[]
  bowling: { name: string; team: string; r: number; b: number; w: number; rv: number; wpa: number }[]
  swings: { inn: number; over: string; striker: string; bowler: string; outcome: string; wpa: number; bat_team: string }[]
}

/* ----------------------------------------------------------------- model lab */
export interface ModelMetrics { auc: number; brier: number; logloss: number; ece: number }
export type CalBin = { pred: number; actual: number; n: number }
export interface ModelLab {
  wp_comparison: {
    candidates: string[]
    sample_matches: number
    innings: Record<'1' | '2', {
      n_balls: number; n_matches: number; holdout_season: number; holdout_balls: number
      cv: Record<string, ModelMetrics>; holdout: Record<string, ModelMetrics>
      calibration: Record<string, CalBin[]>
      importance: { feature: string; importance: number }[]
    }>
    curves: { by_wickets: { wkts: number; points: [number, number][] }[]; by_need: { need: number; points: [number, number][] }[] }
  } | null
  tuning: {
    grid: { pctl: number[]; K: number[]; step: number[] }
    rows: { role: Role; pctl: number; K: number; step: number; n: number; r: number }[]
    production: { pctl: number; K: number; step: number; bat: number; bowl: number; mean: number }
    best: { pctl: number; K: number; step: number; bat: number; bowl: number; mean: number }
  } | null
  next_season: Record<Role, {
    n: number; train_years: number[]
    corr: { gbm: number; rating: number; normal: number; last: number }
    importance: { feature: string; drop: number }[]
  }> | null
  archetypes: Record<Role, {
    k: number; silhouette: Record<string, number>; explained: number[]; features: string[]
    clusters: { id: number; name: string; size: number; centroid: Record<string, number> }[]
  }>
  re_surface: { season: number; competition: string; rows: [number, number, number][] }
  stability: Record<Role, { name: string; rank: number; p_top10: number; lo: number; hi: number; rating: number; rating_lo: number; rating_hi: number }[]>
  split_half: Record<Role, Record<string, number>>
  forward: Record<Role, { n: number; rating: number; normal: number; lift: number; wpa100: number }>
  dataset: { balls: number; train_matches: number }
}
