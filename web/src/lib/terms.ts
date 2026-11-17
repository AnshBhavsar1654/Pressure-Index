import { iplCode } from './format'
import type { Player, Role } from './types'

/**
 * Every statistic on the dashboard, named once in plain words. Tables, charts and the
 * glossary on the methodology page all read from here, so a term never changes name
 * between pages and its explanation is always one hover away.
 */
type Term = { label: string; def: string; bowl?: { label?: string; def?: string } }

export const TERMS = {
  pressureBall: {
    label: 'Pressure ball',
    def: 'One of the 20% of balls where the next delivery could swing the result the most, plus every ball of a knockout. Late league games with a playoff place on the line count a little more.',
  },
  pressureBalls: {
    label: 'Pressure balls',
    def: 'How many pressure balls the player has faced or bowled since 2022. More balls means more evidence behind the numbers.',
  },
  underPressure: {
    label: 'Under pressure',
    def: 'Runs added per 100 pressure balls, compared with an average batter in exactly the same situation. Balls with more at stake count for more. +10 means 10 runs better than average; 0 is average.',
    bowl: {
      def: 'Runs saved per 100 pressure balls, compared with an average bowler in exactly the same situation. Balls with more at stake count for more. +10 means 10 fewer runs conceded than average; 0 is average.',
    },
  },
  normal: {
    label: 'Normal',
    def: 'The same measure in the other 80% of balls, when little is at stake.',
  },
  lift: {
    label: 'Lift',
    def: 'Under pressure minus normal. Positive means the player gets better when it matters; negative means they fade.',
  },
  winImpact: {
    label: 'Win impact',
    def: 'How much the player moved their team’s chance of winning, in percentage points per 100 pressure balls. +25 pts means a quarter of a win added every 100 balls.',
  },
  consistency: {
    label: 'Consistency',
    def: 'Share of pressure innings (6 balls or more) where the player beat the average. 70% means they delivered 7 times out of 10.',
    bowl: { def: 'Share of pressure spells (6 balls or more) where the player beat the average. 70% means they delivered 7 times out of 10.' },
  },
  confidence: {
    label: 'Top-10 confidence',
    def: 'I re-ran the whole ranking 400 times with the matches reshuffled. This is how often the player stayed in the top 10. Above 50% is a safe pick; below 30% is a close call.',
  },
  rankRange: {
    label: 'Likely rank range',
    def: 'In 9 of every 10 re-runs, the player finished inside this range.',
  },
  rank: {
    label: 'Rank',
    def: 'My ranking of players RR could sign. It leaves out Rajasthan Royals’ own players, players retained by other teams, and Pakistani players, who cannot enter the IPL auction.',
  },
  qualified: {
    label: 'Qualified',
    def: 'At least 120 pressure balls across 8 or more matches, so nobody ranks on one lucky night.',
  },
  rate: {
    label: 'Strike rate',
    def: 'Runs per 100 balls under pressure, with the normal figure after the slash. Raw numbers, not adjusted for the situation.',
    bowl: { label: 'Economy', def: 'Runs conceded per over under pressure, with the normal figure after the slash. Lower is better. Raw numbers, not adjusted for the situation.' },
  },
  stakes: {
    label: 'Stakes',
    def: 'How much one ball could move the chance of winning, compared with a typical ball (1×).',
  },
  roleFit: {
    label: 'Role fit',
    def: 'How well the player does this exact job (70%) plus how they handle pressure (30%). The longer the bar, the better the fit.',
  },
  seasonRuns: {
    label: 'Runs added',
    def: 'Runs above an average IPL 2026 player in the same situations, added up over the season. For bowlers this is runs saved.',
  },
  phase: {
    label: 'Phase',
    def: 'Powerplay is overs 1 to 6, the middle overs are 7 to 15, and the death is overs 16 to 20.',
  },
} satisfies Record<string, Term>

export type TermKey = keyof typeof TERMS

export function term(key: TermKey, role: Role = 'bat') {
  const t: Term = TERMS[key]
  const o = role === 'bowl' ? t.bowl : undefined
  return { label: o?.label ?? t.label, def: o?.def ?? t.def }
}

/** "runs added" for batters, "runs saved" for bowlers. */
export const runsWord = (role: Role) => (role === 'bat' ? 'runs added' : 'runs saved')

/** Win impact is stored as win probability per 100 balls; shown as percentage points. */
export const winPts = (v: number | null | undefined) =>
  v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(0)} pts`

/** Rating ingredients are z-scores in the qualified pool; this turns one into "better than X%". */
export function betterThan(z: number) {
  // Abramowitz-Stegun approximation of the normal CDF; plenty for a label
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return Math.min(99, Math.max(1, Math.round(100 * (z > 0 ? 1 - p : p))))
}

/** Why a qualified player is outside my ranking: short form for tables, long form for profiles. */
export const EXCLUDED_NOTE = {
  rr: 'Already at RR',
  pakistan: 'Can’t enter the IPL auction',
  retained: 'Retained by their team',
} as const
export const EXCLUDED_LONG = {
  rr: 'Already in the Rajasthan Royals squad, so left out of my ranking of players to target.',
  pakistan: 'Pakistani players cannot register for the IPL auction, so left out of my ranking.',
  retained: 'Retained by their IPL team for 2027, so not in the auction and left out of my ranking.',
} as const

type Excludable = Pick<Player, 'excluded' | 'retained_by'>
/** Short reason, naming the franchise for a retained player ("Retained by CSK"). */
export const excludedNote = (p: Excludable) =>
  p.excluded === 'retained' && p.retained_by ? `Retained by ${iplCode(p.retained_by)}` : p.excluded ? EXCLUDED_NOTE[p.excluded] : ''
/** Long reason for profiles. */
export const excludedLong = (p: Excludable) =>
  p.excluded === 'retained' && p.retained_by
    ? `Retained by ${p.retained_by} for IPL 2027, so not in the auction and left out of my ranking.`
    : p.excluded
      ? EXCLUDED_LONG[p.excluded]
      : ''
