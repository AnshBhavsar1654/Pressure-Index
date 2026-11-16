import { OverseasMark, PlayerAvatar, Stat, Tag, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SquadPlayer } from '@/lib/types'
import { cn } from '@/lib/utils'

export type Joined = {
  id: number
  name: string
  from_team: string | null
  from_season: number | null
  returning: boolean
  ipl_seasons: number
}

const net = (p?: SquadPlayer) => (p?.bat?.rv ?? 0) + (p?.bowl?.rv ?? 0)
const tone = (v: number) => (v >= 0 ? 'text-pink-ink' : 'text-blue')

/** Players added to the squad for IPL 2026 and how each did, from the season's ball-by-ball data. */
export function NewFaces({ joined, squad }: { joined: Joined[]; squad: SquadPlayer[] }) {
  const byId = new Map(squad.map((p) => [p.id, p]))
  const rows = joined
    .map((j) => ({ j, p: byId.get(j.id) }))
    .toSorted((a, b) => (b.p?.matches ? 1 : 0) - (a.p?.matches ? 1 : 0) || net(b.p) - net(a.p))
  const played = rows.filter((r) => r.p && r.p.matches > 0)
  const newIds = new Set(joined.map((j) => j.id))
  const newNet = played.reduce((a, r) => a + net(r.p), 0)
  const restNet = squad.filter((p) => !newIds.has(p.id)).reduce((a, p) => a + net(p), 0)
  const best = played[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="New to the squad" value={joined.length} note="in the IPL 2026 squad, not the 2025 one" />
        <Stat label="Got on the field" value={played.length} note={`${joined.length - played.length} did not play a match`} />
        <Stat
          label="Runs added by newcomers"
          value={signed(newNet, 0)}
          tone={newNet >= 0 ? 'pink' : 'blue'}
          note={`batting and bowling together; the rest of the squad added ${signed(restNet, 0)}`}
        />
        {best?.p && <Stat label="Best newcomer" value={best.j.name.split(' ').slice(-1)[0]} tone="pink" note={`${signed(net(best.p), 0)} runs added over ${best.p.matches} matches`} />}
      </div>

      <Card className="gap-0 pb-0">
        <CardHeader className="border-b pb-4">
          <CardTitle>How the newcomers did in 2026</CardTitle>
          <CardDescription>
            Best contribution first. Runs added compares each ball with what an average IPL 2026 player would do in the same
            situation, and for bowlers it means runs saved. The data pack does not record how each player arrived, by trade or
            at the auction, or what RR paid.
          </CardDescription>
        </CardHeader>
        <Table className="min-w-[860px] text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5 text-ink-3">Player</TableHead>
              <TableHead className="text-ink-3">Joined from</TableHead>
              <TableHead className="text-right text-ink-3">Matches</TableHead>
              <TableHead className="text-right text-ink-3">Runs</TableHead>
              <TableHead className="text-right text-ink-3">Strike rate</TableHead>
              <TableHead className="text-right text-ink-3">Wickets</TableHead>
              <TableHead className="text-right text-ink-3">Economy</TableHead>
              <TableHead className="pr-5 text-right text-ink-3" title="Runs added with the bat plus runs saved with the ball">
                Runs added
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ j, p }) => {
              const dnp = !p || p.matches === 0
              return (
                <TableRow key={j.id} className={cn(dnp && 'text-ink-3')}>
                  <TableCell className="py-2 pl-5">
                    <span className="flex items-center gap-2.5">
                      <PlayerAvatar name={j.name} rr size={30} />
                      <span className="font-medium">{j.name}</span>
                      {p?.overseas && <OverseasMark country={p.nat} size={13} />}
                    </span>
                  </TableCell>
                  <TableCell>
                    {j.from_team ? (
                      <span className="flex items-center gap-2">
                        <TeamBadge team={j.from_team} size={22} />
                        <span className="leading-tight">
                          <span className="block text-[13px]">{j.from_team}</span>
                          <span className="block text-[11.5px] text-ink-3">
                            IPL {j.from_season}
                            {j.returning && ' · back at RR'}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <Tag tone="blue">No IPL squad since 2022</Tag>
                    )}
                  </TableCell>
                  {dnp ? (
                    <TableCell colSpan={6} className="pr-5 text-right text-[13px]">
                      Did not play
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="num text-right">{p.matches}</TableCell>
                      <TableCell className="num text-right">{p.bat ? p.bat.runs : '–'}</TableCell>
                      <TableCell className="num text-right">{p.bat ? p.bat.sr : '–'}</TableCell>
                      <TableCell className="num text-right">{p.bowl ? p.bowl.wkts : '–'}</TableCell>
                      <TableCell className="num text-right">{p.bowl ? p.bowl.econ : '–'}</TableCell>
                      <TableCell className={cn('num pr-5 text-right font-semibold', tone(net(p)))}>{signed(net(p), 0)}</TableCell>
                    </>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
