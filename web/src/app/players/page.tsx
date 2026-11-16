import type { Metadata } from 'next'
import { PageHead } from '@/components/kit'
import { getRole } from '@/lib/data'
import type { Player } from '@/lib/types'
import { PlayersDirectory, type DirRow, type RoleLine } from '@/views/PlayersDirectory'

export const metadata: Metadata = { title: 'All players' }

const line = (p: Player): RoleLine => ({
  rank: p.rank,
  balls: p.p_balls,
  rv100: p.p_rv100,
})

export default function PlayersPage() {
  // merge batting and bowling records into one row per player (only the fields shown are sent)
  const map = new Map<number, DirRow>()
  for (const role of ['bat', 'bowl'] as const) {
    for (const p of getRole(role).players) {
      const row = map.get(p.id) ?? { id: p.id, name: p.name, country: p.country, team: p.ipl_team, kind: 'Batter', balls: 0 }
      row[role] = line(p)
      row.balls += p.p_balls
      row.country ??= p.country
      row.team ??= p.ipl_team
      map.set(p.id, row)
    }
  }
  const rows = [...map.values()].map((r) => {
    const bat = r.bat?.balls ?? 0
    const bowl = r.bowl?.balls ?? 0
    const kind: DirRow['kind'] = bat >= 30 && bowl >= 30 ? 'All-rounder' : bat >= bowl ? 'Batter' : 'Bowler'
    return { ...r, kind }
  })
  const ranked = rows.filter((r) => r.bat?.rank != null || r.bowl?.rank != null).length

  return (
    <>
      <PageHead
        title="All players"
        summary={
          <>
            Every one of the {rows.length} players who faced or bowled a high-pressure ball since 2022, with a profile page for
            each. {ranked} of them make my rankings of players RR could sign; the rest are here so you can check anyone.
          </>
        }
      />
      <PlayersDirectory rows={rows} />
    </>
  )
}
