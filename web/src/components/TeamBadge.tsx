import { teamOf } from '@/lib/teams'
import { cn } from '@/lib/utils'

/** Team chip: the side's short code in a neutral mono badge (club colours are not used: colour is for data). */
export function TeamBadge({ team, size = 22, className }: { team: string | null | undefined; size?: number; className?: string }) {
  const t = teamOf(team)
  if (!t) return null
  return (
    <span
      role="img"
      aria-label={t.name}
      title={t.name}
      className={cn('inline-grid shrink-0 place-items-center rounded-md border border-line-strong bg-panel-2 font-mono font-medium leading-none text-ink-2', className)}
      style={{ minWidth: size, height: size, paddingInline: 3, fontSize: Math.max(9, size * (t.code.length > 3 ? 0.34 : 0.4)) }}
    >
      {t.code}
    </span>
  )
}
