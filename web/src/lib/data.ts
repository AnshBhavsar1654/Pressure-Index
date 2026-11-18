import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import type { Example } from '@/views/WorkedExample'
import type { ChaseGrid, RoleData, RRData, Summary } from './types'

// All data is read from ./data at build time (static export), never in the browser.
const dir = path.join(process.cwd(), 'data')
const cache = new Map<string, unknown>()

function read<T>(file: string): T {
  // in development the data files can be regenerated while the server runs, so re-read them
  if (process.env.NODE_ENV !== 'production' || !cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
  return cache.get(file) as T
}

export const getSummary = () => read<Summary>('summary.json')
/** One player's rating rebuilt step by step (analysis/worked_example.py). */
export const getExample = () => read<Example>('example.json')
// Nationality fixes shared with the RR analysis: players with no T20Is in the window
// (analysis/nationality_overrides.json), and IPL players with no cap, who are Indian.
const overrides: Record<string, string> = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), '..', 'analysis', 'nationality_overrides.json'), 'utf8')).overrides
  } catch {
    return {}
  }
})()

function withNationality(d: RoleData): RoleData {
  for (const p of d.players) {
    p.country = overrides[p.name] ?? p.country ?? (p.ipl_team ? 'India (uncapped)' : null)
  }
  return d
}

const roles = new Map<string, RoleData>()
export const getRole = (role: 'bat' | 'bowl') => {
  if (!roles.has(role)) roles.set(role, withNationality(read<RoleData>(role === 'bat' ? 'batters.json' : 'bowlers.json')))
  return roles.get(role)!
}
export const getGrid = () => read<ChaseGrid>('chase_grid.json')
export const getRR = () => read<RRData>('rr2026.json')

/** My ranking: qualified players RR can sign, best first. */
export const getRanked = (role: 'bat' | 'bowl') =>
  getRole(role)
    .players.filter((p) => p.rank != null)
    .toSorted((a, b) => a.rank! - b.rank!)
/** Everyone who clears the bar, signable or not: the pool every rating is measured against. */
export const getQualified = (role: 'bat' | 'bowl') => getRole(role).players.filter((p) => p.merit_rank != null)
