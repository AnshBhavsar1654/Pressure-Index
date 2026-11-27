import { Flag } from '@/components/Flag'
import { TeamBadge } from '@/components/TeamBadge'
import { fmt } from '@/lib/format'
import type { MatchDetail } from '@/lib/types'
import { cn } from '@/lib/utils'

export function MatchScore({ match, className, showDate = false }: { match: MatchDetail; className?: string; showDate?: boolean }) {
  return (
    <div className={cn('grid gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-ink-3">
        <span>{match.comp}{match.stage !== 'League' && ` / ${match.stage}`}</span>
        {showDate && (
          <span className="flex flex-wrap gap-x-3">
            <time dateTime={match.date}>{fmt.date(match.date)}</time>
            {match.venue_country && <span>{match.venue_country}</span>}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 divide-x divide-line border-y border-line">
        {match.innings.map((innings) => (
          <div key={innings.team} className="min-w-0 py-2 pr-2 [&+div]:pl-3 sm:[&+div]:pl-5">
            <dt className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:text-base">
              <span aria-hidden className="shrink-0">
                {match.comp.startsWith('IPL') ? <TeamBadge team={innings.team} size={22} /> : <Flag country={innings.team} size={20} />}
              </span>
              {innings.team}
            </dt>
            <dd className="display num mt-1 flex flex-wrap items-baseline gap-x-2 text-[1.8rem] sm:text-[2.2rem]">
              {innings.runs}/{innings.wkts}
              <span className="font-sans text-xs font-normal tracking-normal text-ink-3">({Math.floor(innings.balls / 6)}.{innings.balls % 6} overs)</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm font-medium text-ink-2">{match.result}</p>
    </div>
  )
}
