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
export const getRole = (role: 'bat' | 'bowl') => read<RoleData>(role === 'bat' ? 'batters.json' : 'bowlers.json')
export const getGrid = () => read<ChaseGrid>('chase_grid.json')
export const getRR = () => read<RRData>('rr2026.json')

/** Players inside the default bar (they carry the submitted rank and bootstrap figures). */
export const getRanked = (role: 'bat' | 'bowl') => getRole(role).players.filter((p) => p.rank != null)
