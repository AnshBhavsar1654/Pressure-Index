import type { Metadata } from 'next'
import { Note, PageHead } from '@/components/kit'
import { getRanked, getRole } from '@/lib/data'
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
            {a.name}, {b.name} and {c.name} lead the {data.eligibility.n_ranked} qualified {noun} RR could buy who rise under
            pressure. One number decides the order: runs {role === 'bat' ? 'added' : 'saved'} per 100 pressure balls against an
            average {role === 'bat' ? 'batter' : 'bowler'} in the same spot. Each has at least {data.eligibility.min_pressure_balls}{' '}
            pressure balls across {data.eligibility.min_pressure_matches} or more matches, {data.eligibility.min_recent_balls}+ of them
            in 2025–26, and is not worse under pressure than usual.
          </>
        }
      >
        <Note title="Three numbers to read first" className="max-w-md">
          <b>Pressure rating +10</b>: {role === 'bat' ? '10 more runs scored' : '10 more runs saved'} per 100 pressure balls than an average {role === 'bat' ? 'batter' : 'bowler'} in the same spot.{' '}
          <b>Lift +5</b>: 5 better under pressure than usual. <b>Top-10 confidence 60%</b>: stays top 10 in 6 of 10 re-runs.
        </Note>
      </PageHead>
      <Leaderboard
        role={role}
        players={players}
        total={data.players.length}
        bar={{
          balls: data.eligibility.min_pressure_balls,
          matches: data.eligibility.min_pressure_matches,
          recentBalls: data.eligibility.min_recent_balls,
          minBalls: data.eligibility.export_min_balls,
          minMatches: data.eligibility.export_min_matches,
        }}
      />
    </>
  )
}
