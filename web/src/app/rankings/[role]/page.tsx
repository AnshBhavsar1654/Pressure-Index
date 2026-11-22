import type { Metadata } from 'next'
import Link from 'next/link'
import { Bullets, PageHead } from '@/components/kit'
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
  const players = data.players
    .filter((p) => p.p_balls >= 10 && p.p_matches >= 1)
    .map((p) => ({ ...p, matches: [], seasons: [], phases: [], moments: [] }))
  const [a, b, c] = getRanked(role)
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  return (
    <>
      <PageHead
        title={role === 'bat' ? 'Batters under pressure' : 'Bowlers under pressure'}
        summary={
          <>
            {a.name}, {b.name} and {c.name} lead the {data.eligibility.n_ranked} qualified {noun}, ranked by runs added per 100 pressure balls after shrinkage toward each player’s usual level.{' '}
            <Link href="/method/#fair" className="font-semibold text-signal-ink hover:underline">
              Who qualifies
            </Link>
          </>
        }
      >
        <section className="panel max-w-md p-4">
          <h2 className="mb-2 text-[14px] font-semibold">Reading the numbers</h2>
          <Bullets
            className="text-[13.5px]"
            items={[
              <>
                <b>Pressure rating +10:</b> {role === 'bat' ? '10 more runs scored' : '10 fewer runs conceded'} per 100 pressure balls than an average {role === 'bat' ? 'batter' : 'bowler'}
              </>,
              <>
                <b>Lift +5:</b> 5 better under pressure than usual
              </>,
              <>
                <b>Top-10 confidence 60%:</b> top 10 in 6 of 10 bootstrap re-runs; the small range under each rating is its 90% interval
              </>,
            ]}
          />
        </section>
      </PageHead>
      <Leaderboard
        role={role}
        players={players}
        total={data.players.length}
        bar={{
          balls: data.eligibility.min_pressure_balls,
          matches: data.eligibility.min_pressure_matches,
          recentBalls: data.eligibility.min_recent_balls,
          minBalls: 10,
          minMatches: 1,
        }}
      />
    </>
  )
}
