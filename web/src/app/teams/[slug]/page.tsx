import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHead } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Button } from '@/components/ui/button'
import { getTeams } from '@/lib/data'
import { TEAMS, teamBySlug } from '@/lib/teams'
import { TeamSeasonView, type TeamSeasons } from '@/views/TeamSeasonView'

type Params = { slug: string }

export function generateStaticParams() {
  return Object.values(TEAMS).map((t) => ({ slug: t.code.toLowerCase() }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  return { title: teamBySlug(slug)?.name ?? 'Team' }
}

export default async function TeamPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const team = teamBySlug(slug)
  if (!team) notFound()
  const data = getTeams()
  const seasons: TeamSeasons = {}
  for (const y of data.seasons) {
    const s = data.by_season[String(y)]
    if (s.teams[team.name]) seasons[String(y)] = { season: s.teams[team.name], nTeams: s.table.length, champion: s.champion }
  }
  const titles = Object.entries(seasons).filter(([, v]) => v.champion === team.name).map(([y]) => y)
  return (
    <>
      <Button asChild variant="ghost" className="mb-2 rounded-lg px-3">
        <Link href="/teams/">
          <CaretLeftIcon data-icon="inline-start" />
          All teams
        </Link>
      </Button>
      <PageHead
        title={team.name}
        summary={
          <span className="flex flex-wrap items-center gap-2">
            <TeamBadge team={team.name} size={26} />
            IPL {Object.keys(seasons).sort()[0]}–{Object.keys(seasons).sort().at(-1)}
            {titles.length ? ` · champions in ${titles.join(', ')}` : ''}. Where the side won and lost runs, phase by phase, against an average team.
          </span>
        }
      />
      <TeamSeasonView team={team.name} seasons={seasons} />
    </>
  )
}
