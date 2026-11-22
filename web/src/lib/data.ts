import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import type { Example } from '@/views/WorkedExample'
import type { ChaseGrid, MatchDetail, MatchIndexRow, ModelLab, Player, Role, RoleData, StylePoint, Summary, TeamsData } from './types'

// All data is read from ./data at build time (static export), never in the browser.
// The files are written by the Python pipeline: `python -m pressure_index export`.
const dir = path.join(process.cwd(), 'data')
const cache = new Map<string, unknown>()

function read<T>(file: string): T {
  // in development the data files can be regenerated while the server runs, so re-read them
  if (process.env.NODE_ENV !== 'production' || !cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
  return cache.get(file) as T
}

export const getSummary = () => read<Summary>('summary.json')
/** The top-rated batter's rating rebuilt step by step (checked against the published figures). */
export const getExample = () => read<Example>('example.json')
export const getRole = (role: 'bat' | 'bowl') => read<RoleData>(role === 'bat' ? 'batters.json' : 'bowlers.json')
export const getGrid = () => read<ChaseGrid>('chase_grid.json')
export const getTeams = () => read<TeamsData>('teams.json')
export const getMatches = () => read<{ matches: MatchIndexRow[] }>('matches.json').matches
export const getLab = () => read<ModelLab>('model_lab.json')

export const getStylePoints = () => read<{ points: StylePoint[] }>('similarity.json').points

/** One player's full record (seasons, phases, matches, similar players), or null if there is none. */
export function getPlayer(role: Role, id: string | number): Player | null {
  if (!/^\d+$/.test(String(id))) return null
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'players', role, `${id}.json`), 'utf8')) as Player
  } catch {
    return null
  }
}

/** Everyone who clears the evidence bar, best first. */
export const getRanked = (role: 'bat' | 'bowl') =>
  getRole(role)
    .players.filter((p) => p.rank != null)
    .toSorted((a, b) => a.rank! - b.rank!)
/** Same pool: kept as a separate name for the pages that compare against "everyone qualified". */
export const getQualified = getRanked

/** One match's ball-by-ball detail (the same file the match explorer fetches in the browser). */
export const getMatchDetail = (id: number) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'matches', `${id}.json`), 'utf8')) as MatchDetail
