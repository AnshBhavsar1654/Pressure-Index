import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmt } from '@/lib/format'
import type { Summary } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Final-over situations: how often the chasing side really won, against the old and new estimates. */
export function EndgameTable({ e }: { e: Summary['wp_model']['endgame'] }) {
  return (
    <Card className="gap-0 pb-0">
      <Table className="min-w-[560px] text-[14px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5 text-ink-3">Chasing side needs</TableHead>
            <TableHead className="text-right text-ink-3">Matches</TableHead>
            <TableHead className="text-right text-ink-3">Actually won</TableHead>
            <TableHead className="text-right text-ink-3">Smooth model</TableHead>
            <TableHead className="pr-5 text-right text-ink-3">Exact last over</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {e.rows.map((r) => {
            const gNew = Math.abs(r.new - r.actual)
            const gOld = Math.abs(r.old - r.actual)
            const tie = Math.abs(gNew - gOld) < 0.005 // equal to the shown precision: highlight neither
            return (
              <TableRow key={r.situation}>
                <TableCell className="py-2.5 pl-5">{r.situation}</TableCell>
                <TableCell className="num text-right text-ink-2">{r.n}</TableCell>
                <TableCell className="num text-right font-semibold">{fmt.pct(r.actual)}</TableCell>
                <TableCell className={cn('num text-right', !tie && gOld < gNew && 'font-semibold text-pink-ink')}>{fmt.pct(r.old, r.old < 0.01 ? 1 : 0)}</TableCell>
                <TableCell className={cn('num pr-5 text-right', !tie && gNew < gOld && 'font-semibold text-pink-ink')}>{fmt.pct(r.new, r.new < 0.01 ? 1 : 0)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <p className="border-t px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
        Pink marks the estimate closer to what happened. Each match counts once per situation, so the samples are small; the
        point is the size of the gap at the extremes. Across all {fmt.int(e.balls)} final-over chase balls the overall error{' '}
        {e.brier_new <= e.brier_old ? 'also falls' : 'stays about the same'} (Brier score {e.brier_old} smooth, {e.brier_new} exact; lower is better).
      </p>
    </Card>
  )
}
