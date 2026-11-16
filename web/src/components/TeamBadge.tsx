import { teamOf } from '@/lib/teams'
import { cn } from '@/lib/utils'

/**
 * Team crest: the official logo when one has been added (see lib/teams.ts),
 * otherwise a kit-colour roundel with the team's short code.
 */
export function TeamBadge({ team, size = 22, className }: { team: string | null | undefined; size?: number; className?: string }) {
  const t = teamOf(team)
  if (!t) return null
  if (t.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={t.logo} alt={t.name} title={t.name} width={size} height={size} className={cn('shrink-0 object-contain', className)} />
  }
  const len = t.code.length
  return (
    <span
      role="img"
      aria-label={t.name}
      title={t.name}
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold leading-none ring-1 ring-white/25', className)}
      style={{ width: size, height: size, background: t.color, color: t.ink, fontSize: size * (len > 3 ? 0.3 : len > 2 ? 0.36 : 0.44) }}
    >
      {t.code}
    </span>
  )
}
