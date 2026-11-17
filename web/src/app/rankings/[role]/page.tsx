import type { Metadata } from 'next'
import { Note, PageHead } from '@/components/kit'
import { getRanked, getRole, getSummary } from '@/lib/data'
import type { Role } from '@/lib/types'
import { Leaderboard } from '@/views/Leaderboard'

export function generateStaticParams() {
  return [{ role: 'bat' }, { role: 'bowl' }]
}

export async function generateMetadata({ params }: { params: Promise<{ role: Role }> }): Promise<Metadata> {
  const { role } = await params
  return { title: role === 'bat' ? 'Batters under pressure' : 'Bowlers under pressure' }
}

export default async function RankingsPage({ params }: { params: Promise<{ role: Role }> }) {
  const { role } = await params
  const data = getRole(role)
  // the list never shows per-match detail, so it is not sent to the browser
  const floor = data.eligibility
  const players = data.players
    .filter((p) => p.p_balls >= floor.export_min_balls && p.p_matches >= floor.export_min_matches)
    .map((p) => ({ ...p, matches: [], seasons: [], phases: [], moments: [] }))
  const [a, b, c] = getRanked(role)
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  return (
    <>
      <PageHead
        title={role === 'bat' ? 'Batters under pressure' : 'Bowlers under pressure'}
        summary={
          <>
            {a.name}, {b.name} and {c.name} lead the {data.eligibility.n_ranked} qualified {noun} RR could sign. Each has at least{' '}
            {data.eligibility.min_pressure_balls} high-pressure balls across {data.eligibility.min_pressure_matches} or more
            matches, so nobody ranks on one lucky night.
          </>
        }
      >
        <Note title="Three numbers to read first" className="max-w-md">
          <b>Under pressure +10</b>: {role === 'bat' ? '10 more runs scored' : '10 more runs saved'} per 100 pressure balls than an average {role === 'bat' ? 'batter' : 'bowler'} in the same spot.{' '}
          <b>Consistency 70%</b>: delivered 7 times in 10. <b>Top-10 confidence 60%</b>: stays top 10 in 6 of 10 re-runs, so a safe pick.
        </Note>
      </PageHead>
      <Leaderboard
        role={role}
        players={players}
        total={data.players.length}
        defaults={getSummary().weights}
        bar={{
          balls: data.eligibility.min_pressure_balls,
          matches: data.eligibility.min_pressure_matches,
          minBalls: data.eligibility.export_min_balls,
          minMatches: data.eligibility.export_min_matches,
        }}
      />
    </>
  )
}
