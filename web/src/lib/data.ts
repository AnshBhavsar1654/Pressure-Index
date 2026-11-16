import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import type { ChaseGrid, RoleData, RRData, Summary } from './types'

// All data is read from ./data at build time (static export), never in the browser.
const dir = path.join(process.cwd(), 'data')
const cache = new Map<string, unknown>()

function read<T>(file: string): T {
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
  return cache.get(file) as T
}

export const getSummary = () => read<Summary>('summary.json')
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

/** Players inside the default bar (they carry the submitted rank and bootstrap figures). */
export const getRanked = (role: 'bat' | 'bowl') => getRole(role).players.filter((p) => p.rank != null)
