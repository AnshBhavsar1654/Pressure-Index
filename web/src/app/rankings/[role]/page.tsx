import type { Metadata } from 'next'
import { Note, PageHead } from '@/components/kit'
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
  // the list never shows per-match detail, so it is not sent to the browser
  const players = data.players.map((p) => ({ ...p, matches: [], seasons: [], phases: [] }))
  const [a, b, c] = data.players
  const noun = role === 'bat' ? 'batters' : 'bowlers'
  return (
    <>
      <PageHead
        title={role === 'bat' ? 'Batters under pressure' : 'Bowlers under pressure'}
        summary={
          <>
            {a.name}, {b.name} and {c.name} lead {data.eligibility.n_eligible} eligible {noun}. Each has at least{' '}
            {data.eligibility.min_pressure_balls} high-pressure balls across {data.eligibility.min_pressure_matches} or more
            matches, so nobody ranks on one lucky night.
          </>
        }
      >
        <Note title="Reading the numbers" className="max-w-md">
          <b>+10</b> under pressure means 10 more runs per 100 pressure balls than an average player in the same situations
          {role === 'bowl' ? ' (for bowlers, 10 runs saved)' : ''}. <b>0</b> is exactly average.
        </Note>
      </PageHead>
      <Leaderboard role={role} players={players} defaults={getSummary().weights} />
    </>
  )
}
