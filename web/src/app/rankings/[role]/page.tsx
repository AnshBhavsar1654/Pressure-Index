import type { Metadata } from 'next'
import { PageHead, Plain } from '@/components/ui'
import { getRole, getSummary } from '@/lib/data'
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
  const s = getSummary()
  // the list page only needs summary fields: drop per-match detail to keep the page light
  const players = data.players.map((p) => ({ ...p, matches: [], seasons: [], phases: [] }))
  const top = data.players.slice(0, 3).map((p) => p.name)
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  return (
    <>
      <PageHead
        title={role === 'bat' ? 'Batters under pressure' : 'Bowlers under pressure'}
        takeaway={
          <>
            {top[0]}, {top[1]} and {top[2]} lead {data.eligibility.n_eligible} eligible {noun}. To qualify, a player needs at
            least {data.eligibility.min_pressure_balls} high-pressure balls across {data.eligibility.min_pressure_matches} or
            more matches, so nobody ranks on one lucky night.
          </>
        }
      >
        <div className="max-w-sm">
          <Plain title="How to read the numbers">
            <b>+10</b> under pressure means the player added 10 more runs per 100 pressure balls than an average player would
            have in the same situations{role === 'bowl' ? ' (for bowlers: 10 runs saved)' : ''}. <b>0</b> is exactly average.
          </Plain>
        </div>
      </PageHead>
      <Leaderboard role={role} players={players} defaults={s.weights} />
    </>
  )
}
