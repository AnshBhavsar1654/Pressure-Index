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
  /** rank in the submitted ranking (qualified, signable at the 2027 auction, not worse under pressure than usual); null otherwise */
  rank: number | null
  /** rank among every qualified player by rating, before any auction rule */
  merit_rank: number | null
  /** why a player is outside the submitted ranking: cannot be signed, or dips under pressure */
  excluded: 'rr' | 'pakistan' | 'retained' | 'retired' | 'unavailable' | 'inactive' | 'dips' | null
  /** Indian player: a third of the evidence bar, and a priority top-10 place if above average */
  indian: boolean
  /** rank among Indian options beyond the top 10 (signable, in a 2026 squad, above average, not dipping) */
  india_rank: number | null
  /** franchise that retained the player for IPL 2027, from the announced lists */
  retained_by: string | null
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
  /** pressure balls as the evidence bar counts them (a knockout first-innings ball counts half), all and 2025-26 */
  p_eff: number
  r_eff: number
  /** THE rating: runs added per 100 pressure balls, leaning on the usual level until the record is long */
  p_rv100: number
  /** usual level: the same measure on the other balls */
  n_rv100: number
  /** the raw pressure record (recency-weighted runs added per 100 pressure balls), before leaning on the usual level */
  p_raw100: number
  /** lift: rating minus usual level */
  delta100: number
  /** win chance added per 100 pressure balls (a fraction; ×100 for points) */
  wpa100: number
  /** share of pressure innings or spells (6+ balls) that beat the average; null if none */
  cons: number | null
  c_n: number
  /** the rating for 2025-26 alone */
  recent100: number
  /** pressure balls and matches in 2025-26 */
  r_balls: number
  r_matches: number
  /** first season the player appears in the data */
  debut: number
  /** public birth date (YYYY-MM-DD, or YYYY where clearly older than the cutoff); only for the label's candidate pool */
  born: string | null
  /** under 26 at the start of IPL 2027 (born on or after eligibility.emerging_born_from): a label, not a quota */
  emerging: boolean
  z?: Record<ComponentKey, number>
  /** share of the pool (0-100) this player beats on each piece of evidence */
  beats?: Record<ComponentKey, number>
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
  k: { K: number }
  /** odd against even matches, for rating / normal / lift / wpa100 / cons */
  split_half: Record<'rating' | 'normal' | 'lift' | 'wpa100' | 'cons', number>
  /** forward test: ratings from earlier seasons against the next season's pressure output */
  forward: { n: number; rating: number; normal: number; lift: number; wpa100: number }
  eligibility: {
    min_pressure_balls: number
    min_pressure_matches: number
    recent_from: number; min_recent_balls: number
    emerging_born_from: string
    indian_bar: number; indian_places: number; scout_min_balls: number; n_indian_top10: number; max_bangladesh: number
    /** the Indian bar: [pressure balls, matches, 2025-26 pressure balls] */
    indian_min: [number, number, number]
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
  n_top_level_matches: number
  /** public data added next to the data pack: the 2026 T20 World Cup from Cricsheet */
  public: { name: string; source: string; matches: number; balls: number } | null
  pressure_threshold: number
  pressure_pctl: number
  K: number
  season_weights: Record<string, number>
  top_level: string[]
  min_match_balls: number
  n_reduced_included: number
  n_short_excluded: number
  forward: Record<Role, { n: number; rating: number; normal: number; lift: number; wpa100: number }>
  /** Indian players first seen in `from` or later with 60+ balls: how many were kept and how many reached the auction */
  new_indians: { total: number; kept: number; available: number; from: number }
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

const COMP_FIELD: Record<ComponentKey, 'p_rv100' | 'n_rv100' | 'delta100' | 'wpa100' | 'cons'> = {
  pressure: 'p_rv100',
  normal: 'n_rv100',
  delta: 'delta100',
  impact: 'wpa100',
  consistency: 'cons',
}

/** A player can be recommended if RR can sign him and he is not worse under pressure than usual. */
export const recommendable = (p: Pick<Player, 'excluded' | 'delta100'>) => !p.excluded && p.delta100 >= 0

/** Indian players need this share of the evidence bar (rounded up): the data pack has no domestic cricket. */
export const INDIAN_BAR = 1 / 3
/** The pipeline's priority rule: up to this many above-average Indians are guaranteed a top-10 place. */
export const INDIAN_PLACES = 5
/** Board release (NOC) risk: at most this many Bangladeshi players in a top 10. */
export const MAX_BANGLADESH = 1

/**
 * Rank a pool by the rating. Each piece of evidence is also put on a common scale within the pool
 * (z, shown as "better than X%"), but only the rating decides the order. Players who cannot be
 * signed, or who dip under pressure, stay in the pool and keep their place in the order but take no rank.
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
  // "beats X%": the real share of the pool below the player, not a bell-curve guess from the z-score
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
  const scored = players.map((p) => {
    const z = Object.fromEntries(keys.map((k) => [k, ((p[COMP_FIELD[k]] ?? stats[k].mean) - stats[k].mean) / stats[k].sd])) as Record<ComponentKey, number>
    const beats = Object.fromEntries(keys.map((k) => [k, share(k, p[COMP_FIELD[k]])])) as Record<ComponentKey, number>
    return { ...p, z, beats, liveScore: p.p_rv100 }
  })
  scored.sort((a, b) => b.liveScore - a.liveScore)
  // same rule as the pipeline: each above-average Indian gets a top-10 place (up to 5), the rest on merit
  const cand = scored.filter(recommendable)
  const top = cand.filter((p) => p.indian && p.liveScore > 0).slice(0, INDIAN_PLACES)
  let bd = 0
  for (const p of cand) {
    if (top.length >= 10) break
    if (top.includes(p)) continue
    if (p.country === 'Bangladesh' && bd++ >= MAX_BANGLADESH) continue
    top.push(p)
  }
  top.sort((a, b) => b.liveScore - a.liveScore)
  const order = [...top, ...cand.filter((p) => !top.includes(p))]
  const rankOf = new Map(order.map((p, i) => [p.id, i + 1]))
  return scored.map((p) => ({ ...p, liveRank: rankOf.get(p.id) ?? null }))
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


/* ----------------------------------------------------------------- RR 2026 */
export interface PhaseStats {
  bat_rv_pm: number; bowl_rv_pm: number; bat_rpo: number; bowl_rpo: number
}
export interface RRPhase {
  phase: string; overs: string; rr: PhaseStats; league: PhaseStats; top4: PhaseStats
  bat_rank: number; bowl_rank: number; teams: { team: string; bat: number; bowl: number }[]
  /** the best side in this phase, batting and bowling */
  best: Record<'bat' | 'bowl', { team: string; v: number }>
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
  /** kept by RR for IPL 2027 (false until RR announce) */
  retained?: boolean
  bat?: { balls: number; runs: number; outs: number; sr: number; avg: number | null; rv: number; rv100: number
    p_balls: number; p_rv100: number | null; phases: Record<string, { balls: number; sr: number; rv100: number | null }> }
  bowl?: { balls: number; runs: number; wkts: number; econ: number; rv: number; rv100: number; type: string; pace: string
    p_balls: number; p_rv100: number | null; phases: Record<string, { balls: number; econ: number; rv100: number | null }> }
}
export interface Gap {
  key: string; discipline: 'bat' | 'bowl'; phase: string; rr_rv_pm: number; top4_rv_pm: number
  gap_vs_avg: number; gap_vs_top4: number; rank: number
}
/** A player RR kept for 2027. role: keeper if he kept wicket in a quarter of his matches since 2024, all-rounder
 * if he bowled 6+ and faced 8+ balls a match, bowler if he bowled 6+ balls a match, batter otherwise; null = no matches yet. */
export interface RetainedPlayer {
  id: number; name: string; role: 'batter' | 'keeper' | 'allrounder' | 'bowler' | null; overseas: boolean
  /** 'public record' when the data cannot show the role (analysis/role_overrides.json) */
  role_source?: 'data' | 'public record'
  matches: number; wk_matches: number
  bat26: { runs: number; sr: number } | null
  bowl26: { wkts: number; econ: number } | null
}
/** a role RR need to fix for 2027 */
export interface Recommendation {
  gap: Gap; role: string; role_desc: string
}
export interface RRData {
  season: number
  summary: { pos: number; played: number; won: number; lost: number; points: number; nrr: number
    playoff_result: string | null; matches: number; wins_all: number }
  table: { pos: number; team: string; played: number; won: number; lost: number; nr: number; points: number; nrr: number }[]
  top4: string[]
  /** the other playoff sides: RR's benchmark (`top4` stats in each phase are their average) */
  bench: string[]
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
  /** known: every franchise has announced; announced: the franchises whose retentions are in */
  pool: { known: boolean; updated: string | null; announced: string[] }
  /** IPL squad rules (25 players, 8 overseas) against RR's retentions */
  slots: { squad_max: number; overseas_max: number; retained: number; retained_overseas: number; open: number; open_overseas: number } | null
  /** how many retained players fill each role */
  squad_need: Record<'batter' | 'keeper' | 'allrounder' | 'bowler', number>
  /** RR's retained players for 2027, with a role worked out from their matches since 2024 */
  retained_squad: RetainedPlayer[]
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
