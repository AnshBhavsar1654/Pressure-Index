import { Tag } from '@/components/kit'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fmt } from '@/lib/format'
import type { Moment, Role } from '@/lib/types'

/** One line that says what the player did in a big moment. */
export function momentLine(m: Moment, role: Role) {
  if (m.headline) return m.headline
  return role === 'bat'
    ? `${m.r} runs off ${m.balls} pressure balls${m.out ? ', then out' : ''}`
    : `${m.balls} pressure balls for ${m.r} runs and ${m.out} wicket${m.out === 1 ? '' : 's'}`
}

/** The player's biggest pressure performances, largest swing in the team's chance of winning first. */
export function Moments({ moments, role }: { moments: Moment[]; role: Role }) {
  if (!moments.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Biggest moments</CardTitle>
        <CardDescription>
          The matches where this player’s pressure balls moved their team’s chance of winning the most. For a finish or a last-over defence, the chance shown is from the start of that situation.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {moments.map((m) => (
          <div key={m.id} className="flex flex-col gap-2 rounded-lg border border-line bg-panel-2/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-semibold">v {m.opp}</div>
                <div className="text-[12px] text-ink-3">
                  {m.comp}, {fmt.date(m.date)}
                </div>
              </div>
              <Tag tone={m.won ? 'signal' : 'neutral'}>{m.won ? 'Won' : 'Lost'}</Tag>
            </div>
            <p className="text-[14px] leading-snug text-ink">{momentLine(m, role)}</p>
            <div className="mt-auto flex items-baseline gap-2">
              <span className="display num text-[1.6rem]">
                {fmt.chance(m.wp_from)} → {fmt.chance(m.wp_to)}
              </span>
              <span className="text-[12px] text-ink-3">team’s chance of winning</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
