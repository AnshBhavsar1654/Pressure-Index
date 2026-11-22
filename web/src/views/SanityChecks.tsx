import Link from 'next/link'
import { Tag } from '@/components/kit'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'
import { momentLine } from '@/views/Moments'

type Pools = Record<Role, Player[]>
/** The named players behind the known-moment cards, with their full match lists (keyed "role:name"). */
export const SANITY_PLAYERS: [Role, string][] = [
  ['bat', 'Rinku Singh'],
  ['bat', 'Jos Buttler'],
  ['bowl', 'Hardik Pandya'],
  ['bat', 'Rajat Patidar'],
  ['bat', 'Ravindra Jadeja'],
  ['bowl', 'Mohit Sharma'],
]

const ordinalWord = (n: number) => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`)
const pts = (wpa: number) => `${wpa >= 0 ? '+' : '−'}${Math.abs(wpa * 100).toFixed(0)} pts`

function find(full: Record<string, Player>, role: Role, name: string, date: string) {
  const p = full[`${role}:${name}`]
  const m = p?.matches.find((x) => x.date === date)
  if (!p || !m) return null
  const mo = p.moments.find((x) => x.id === m.id) ?? null
  // where this match sits among the player's own matches with pressure balls, by win chance added
  const place = p.matches.toSorted((a, b) => b.wpa - a.wpa).findIndex((x) => x.id === m.id) + 1
  return { p, m, mo, place }
}

/** Known clutch performances, and the model's verdict on each, so anyone can check it against memory. */
export function SanityChecks({ pools, full }: { pools: Pools; full: Record<string, Player> }) {
  const rinku = find(full, 'bat', 'Rinku Singh', '2023-04-09')
  const kkr = find(full, 'bat', 'Jos Buttler', '2024-04-16')
  const rcb = find(full, 'bat', 'Jos Buttler', '2024-04-06')
  const hardik = find(full, 'bowl', 'Hardik Pandya', '2024-06-29')
  const patidar = find(full, 'bat', 'Rajat Patidar', '2026-05-26')
  const jadeja = find(full, 'bat', 'Ravindra Jadeja', '2023-05-29')
  const mohit = find(full, 'bowl', 'Mohit Sharma', '2023-05-29')

  const cards: { title: string; story: string; verdict: string; href?: string }[] = []
  if (jadeja?.mo)
    cards.push({
      title: 'Ravindra Jadeja v Gujarat Titans, IPL final 2023',
      story: `Rain cut the chase to 171 off 15 overs. ${jadeja.mo.headline ?? momentLine(jadeja.mo, 'bat')}: a six and a four off the last two balls to win the title.`,
      verdict: `CSK were ${fmt.chance(jadeja.mo.wp_from)} to win when he took strike in the last over. His balls carried ${jadeja.m.li.toFixed(0)}× a typical ball’s stakes and added ${pts(jadeja.m.wpa)} of win chance, the biggest of his ${jadeja.p.matches.length} pressure matches.${mohit ? ` The other side: Mohit Sharma’s spell that night took ${pts(mohit.m.wpa).replace('−', '')} off Gujarat, the worst of his ${mohit.p.matches.length}.` : ''} Rain-reduced games are judged on their revised target, so this final counts like any other.`,
      href: `/players/bat/${jadeja.p.id}/`,
    })
  if (rinku?.mo)
    cards.push({
      title: 'Rinku Singh v Gujarat Titans, 2023',
      story: `${rinku.mo.headline ?? momentLine(rinku.mo, 'bat')}: five sixes off the last five balls.`,
      verdict: `The model gave KKR ${fmt.chance(rinku.mo.wp_from)} when the last five balls began. His pressure balls that day averaged ${rinku.m.li.toFixed(1)}× a typical ball’s stakes, and the innings ranks ${ordinalWord(rinku.place)} of his ${rinku.p.matches.length} pressure matches, adding ${pts(rinku.m.wpa)} of win chance.`,
      href: `/players/bat/${rinku.p.id}/`,
    })
  if (kkr && rcb)
    cards.push({
      title: 'Jos Buttler: two hundreds, ten days apart, 2024',
      story: `Against RCB he made 100 in a chase of 184 that was won with five balls to spare. Against KKR he made 107 chasing 224, eight down and needing 36 off the last 15 balls.`,
      verdict: `The KKR hundred counts far more: ${pts(kkr.m.wpa)} of win chance from ${kkr.m.balls} pressure balls at ${kkr.m.li.toFixed(1)}× average stakes, against ${pts(rcb.m.wpa)} from ${rcb.m.balls} balls at ${rcb.m.li.toFixed(1)}× for RCB, where his pressure runs came early in a chase that never got tight.`,
      href: `/players/bat/${kkr.p.id}/`,
    })
  if (hardik)
    cards.push({
      title: 'Hardik Pandya v South Africa, T20 World Cup final 2024',
      story: `South Africa needed 16 off the final over with Miller on strike. ${hardik.mo?.headline ?? 'He defended it'}: Miller caught on the boundary first ball, India won by 7 runs.`,
      verdict: `${hardik.mo ? `India were ${fmt.chance(hardik.mo.wp_from)} to win when his pressure work began. ` : ''}His ${hardik.m.balls} pressure balls in the final added ${pts(hardik.m.wpa)} of win chance, ranking ${ordinalWord(hardik.place)} of his ${hardik.p.matches.length} pressure matches. Every ball of a knockout is a pressure ball.`,
      href: `/players/bowl/${hardik.p.id}/`,
    })

  if (patidar)
    cards.push({
      title: 'Rajat Patidar v Gujarat Titans, Qualifier 1, 2026',
      story: `Batting first in a knockout, he made ${patidar.m.r} off ${patidar.m.balls} balls as RCB set 254; Gujarat’s chase fell 92 runs short.`,
      verdict: `A first-innings knock, but in a knockout every ball is a pressure ball: all ${patidar.m.balls} count, adding ${patidar.m.rv > 0 ? '+' : ''}${patidar.m.rv.toFixed(0)} runs against an average batter in the same spots and ${pts(patidar.m.wpa)} of win chance. In a league game the same innings would count towards his usual level instead.`,
      href: `/players/bat/${patidar.p.id}/`,
    })

  // the biggest turnarounds anywhere in the data, ordered by the swing the table shows (team's chance of winning
  // from when the player's pressure work began to when it ended), one row per player
  const swing = (mo: Player['moments'][number]) => mo.wp_to - mo.wp_from
  const top = (role: Role) =>
    pools[role]
      .flatMap((p) => p.moments.filter((mo) => mo.won).map((mo) => ({ p, mo })))
      .toSorted((a, b) => swing(b.mo) - swing(a.mo))
      .filter((x, i, all) => all.findIndex((y) => y.p.id === x.p.id) === i)
      .slice(0, 8)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <article key={c.title} className="panel flex flex-col gap-2 p-5">
            <h3 className="text-[15.5px] font-semibold">{c.title}</h3>
            <p className="text-[14px] leading-relaxed text-ink-2">{c.story}</p>
            <p className="rounded-lg bg-signal-soft/50 px-3 py-2 text-[13.5px] leading-relaxed text-ink">
              <span className="mb-0.5 block text-[12px] font-semibold text-signal-ink">What the model says</span>
              {c.verdict}
            </p>
            {c.href && (
              <Link href={c.href} className="mt-auto text-[13px] font-semibold text-signal-ink hover:underline">
                Open the profile
              </Link>
            )}
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <Card key={role} className="gap-0 pb-0">
            <h3 className="border-b px-5 py-3 text-[14.5px] font-semibold">
              Biggest match-winning {role === 'bat' ? 'innings' : 'spells'} under pressure, found by the model
              <span className="mt-0.5 block text-[12.5px] font-normal text-ink-3">
                Biggest turnaround first: the team’s chance of winning when the player’s pressure work began, and when it ended.
              </span>
            </h3>
            <Table className="min-w-[520px] text-[13.5px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 text-ink-3">Player and match</TableHead>
                  <TableHead className="text-ink-3">What happened</TableHead>
                  <TableHead className="pr-5 text-right text-ink-3">Team’s win chance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top(role).map(({ p, mo }) => (
                  <TableRow key={`${p.id}-${mo.id}`}>
                    <TableCell className="py-2 pl-5">
                      <Link href={`/players/${role}/${p.id}/`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <div className="text-[12px] text-ink-3">
                        v {mo.opp}, {fmt.date(mo.date)}
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-2">
                      {momentLine(mo, role)} {!mo.won && <Tag>Lost</Tag>}
                    </TableCell>
                    <TableCell className="num pr-5 text-right">
                      <span className="font-semibold">
                        {fmt.chance(mo.wp_from)} → {fmt.chance(mo.wp_to)}
                      </span>
                      <span className="block text-[12px] text-signal-ink">{pts(swing(mo))}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      </div>
    </div>
  )
}

