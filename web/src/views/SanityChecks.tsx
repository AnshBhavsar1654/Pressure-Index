import Link from 'next/link'
import { Tag } from '@/components/kit'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import type { Player, Role } from '@/lib/types'
import { momentLine } from '@/views/Moments'

type Pools = Record<Role, Player[]>

const ordinalWord = (n: number) => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`)
const pts = (wpa: number) => `${wpa >= 0 ? '+' : '−'}${Math.abs(wpa * 100).toFixed(0)} pts`

function find(pools: Pools, role: Role, name: string, date: string) {
  const p = pools[role].find((x) => x.name === name)
  const m = p?.matches.find((x) => x.date === date)
  if (!p || !m) return null
  const mo = p.moments.find((x) => x.id === m.id) ?? null
  // where this match sits among the player's own matches with pressure balls, by win chance added
  const place = p.matches.toSorted((a, b) => b.wpa - a.wpa).findIndex((x) => x.id === m.id) + 1
  return { p, m, mo, place }
}

/** Known clutch performances, and the model's verdict on each, so anyone can check it against memory. */
export function SanityChecks({ pools }: { pools: Pools }) {
  const rinku = find(pools, 'bat', 'Rinku Singh', '2023-04-09')
  const kkr = find(pools, 'bat', 'Jos Buttler', '2024-04-16')
  const rcb = find(pools, 'bat', 'Jos Buttler', '2024-04-06')
  const tushar = find(pools, 'bowl', 'Tushar Deshpande', '2026-04-04')
  const short = find(pools, 'bat', 'Matthew Short', '2026-04-18')
  const patidar = find(pools, 'bat', 'Rajat Patidar', '2026-05-26')

  const cards: { title: string; story: string; verdict: string; href?: string }[] = []
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
      story: `Against RCB he made 100 in a chase of 184 that was won with five balls to spare. Against KKR he made 107 chasing 224, with RR eight down and needing 36 off the last 15 balls.`,
      verdict: `The KKR hundred counts far more: ${pts(kkr.m.wpa)} of win chance from ${kkr.m.balls} pressure balls at ${kkr.m.li.toFixed(1)}× average stakes, against ${pts(rcb.m.wpa)} from ${rcb.m.balls} balls at ${rcb.m.li.toFixed(1)}× for RCB, where his pressure runs came early in a chase that never got tight.`,
      href: `/players/bat/${kkr.p.id}/`,
    })
  if (tushar?.mo)
    cards.push({
      title: 'Tushar Deshpande v Gujarat Titans, 2026',
      story: `${tushar.mo.headline ?? momentLine(tushar.mo, 'bowl')} with three Gujarat wickets left.`,
      verdict: `RR were ${fmt.chance(tushar.mo.wp_from)} to win when the over began. The spell ranks ${ordinalWord(tushar.place)} of his ${tushar.p.matches.length} pressure matches, adding ${pts(tushar.m.wpa)} of win chance.`,
      href: `/players/bowl/${tushar.p.id}/`,
    })

  if (patidar)
    cards.push({
      title: 'Rajat Patidar v Gujarat Titans, Qualifier 1, 2026',
      story: `Batting first in a knockout, he made ${patidar.m.r} off ${patidar.m.balls} balls as RCB set 254; Gujarat’s chase fell 92 runs short.`,
      verdict: `A first-innings knock, but in a knockout every ball is a pressure ball: all ${patidar.m.balls} count, adding ${patidar.m.rv > 0 ? '+' : ''}${patidar.m.rv.toFixed(0)} runs against an average batter once each ball is weighted by its stakes. In a league game the same innings would count towards his normal level instead.`,
      href: `/players/bat/${patidar.p.id}/`,
    })
  if (short)
    cards.push({
      title: 'Matthew Short v Sunrisers Hyderabad, 2026',
      story: `The other side of the coin: ${short.m.r} off ${short.m.balls} pressure balls in a chase of 195 that CSK lost, after a fast start.`,
      verdict: `Not a hero’s innings, and the model agrees: it took ${Math.abs(short.m.wpa * 100).toFixed(0)} points off CSK’s chance of winning. The scoring rate fell behind what the chase needed, though CSK were still in it when he was out; the match was lost after he left.`,
      href: `/players/bat/${short.p.id}/`,
    })

  // the largest single-match pressure performances anywhere in the data
  const top = (role: Role) =>
    pools[role]
      .flatMap((p) => p.moments.map((mo) => ({ p, mo })))
      .toSorted((a, b) => b.mo.wpa - a.mo.wpa)
      .slice(0, 8)

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <article key={c.title} className="panel flex flex-col gap-2 p-5">
            <h3 className="text-[15.5px] font-semibold">{c.title}</h3>
            <p className="text-[14px] leading-relaxed text-ink-2">{c.story}</p>
            <p className="rounded-lg bg-pink-soft/50 px-3 py-2 text-[13.5px] leading-relaxed text-ink">
              <span className="mb-0.5 block text-[12px] font-semibold text-pink-ink">What the model says</span>
              {c.verdict}
            </p>
            {c.href && (
              <Link href={c.href} className="mt-auto text-[13px] font-semibold text-pink-ink hover:underline">
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
            </h3>
            <Table className="min-w-[520px] text-[13.5px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 text-ink-3">Player and match</TableHead>
                  <TableHead className="text-ink-3">What happened</TableHead>
                  <TableHead className="pr-5 text-right text-ink-3">Win chance</TableHead>
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
                    <TableCell className="num pr-5 text-right font-semibold">
                      {fmt.chance(mo.wp_from)} → {fmt.chance(mo.wp_to)}
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

