import type { AppData, Role, ScoredPlayer } from '../lib/data'
import { fmt, iplCode } from '../lib/format'

interface Props {
  data: AppData
  bat: ScoredPlayer[]
  bowl: ScoredPlayer[]
  openPlayer: (role: Role, id: number) => void
  go: (tab: string) => void
}

export function Overview({ data, bat, bowl, openPlayer, go }: Props) {
  const s = data.summary
  const c = s.contrast
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
        <div className="flex flex-col gap-4">
          <p className="eyebrow text-pink!">SupeRR Selector · Season 2 · Round 1</p>
          <h1 className="display text-[2.6rem] font-bold leading-[0.98] text-ink sm:text-[3.4rem]">
            Who delivers when
            <br />
            the match is on the line?
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
            Every one of {fmt.int(s.n_balls)} deliveries from IPL and T20I cricket since 2022 is scored for how much it
            could swing the result. The fifth of balls that matter most are where these rankings are decided. Each player
            is measured against what the situation demanded and against their own usual level.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line">
          <Stat label="Deliveries analysed" value={fmt.int(s.n_balls)} />
          <Stat label="Matches" value={fmt.int(s.n_matches)} note={`${s.n_ipl_matches} IPL · ${s.n_t20i_matches} T20I`} />
          <Stat label="High-pressure balls" value={fmt.int(c.pressure.balls)} note="top 20% by Leverage Index" />
          <Stat
            label="Eligible players"
            value={`${data.bat.eligibility.n_eligible} + ${data.bowl.eligibility.n_eligible}`}
            note="batters + bowlers"
          />
        </dl>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <TopTen title="Top 10 batters under pressure" role="bat" players={bat} openPlayer={openPlayer} onMore={() => go('batters')} />
        <TopTen title="Top 10 bowlers under pressure" role="bowl" players={bowl} openPlayer={openPlayer} onMore={() => go('bowlers')} />
      </section>

      <section className="panel grid gap-6 p-5 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Why the definition holds</p>
          <h2 className="display text-[1.6rem] font-semibold leading-tight">High-pressure balls play differently</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            The pressure label is never used to fit the scoring model, yet the game changes in exactly the way you would
            expect when the stakes rise: more wickets fall, more extras are bowled, and both sides take more risks.
          </p>
          <button onClick={() => go('pressure')} className="mt-1 self-start text-[13.5px] font-semibold text-pink underline-offset-4 hover:underline">
            See how pressure is measured
          </button>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-4">
          <Contrast label="Wickets per 100 balls" p={c.pressure.wkt_pct} n={c.normal.wkt_pct} d={2} />
          <Contrast label="Runs per over" p={c.pressure.rpo} n={c.normal.rpo} d={2} />
          <Contrast label="Dot-ball %" p={c.pressure.dot_pct} n={c.normal.dot_pct} />
          <Contrast label="Wides + no-balls %" p={c.pressure.extras_pct} n={c.normal.extras_pct} d={2} />
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="display num text-[2rem] font-semibold leading-none text-ink">{value}</dd>
      {note && <dd className="text-[12px] text-ink-3">{note}</dd>}
    </div>
  )
}

function Contrast({ label, p, n, d = 1 }: { label: string; p: number; n: number; d?: number }) {
  const diff = ((p - n) / n) * 100
  return (
    <div className="flex flex-col gap-2 bg-surface p-4">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="display num text-[1.9rem] font-semibold leading-none text-pink">{p.toFixed(d)}</span>
        <span className="num text-[13px] text-ink-3">vs {n.toFixed(d)}</span>
      </div>
      <span className="num text-[12px] font-medium text-ink-2">
        {diff >= 0 ? '+' : '−'}
        {Math.abs(diff).toFixed(0)}% under pressure
      </span>
    </div>
  )
}

function TopTen({
  title,
  role,
  players,
  openPlayer,
  onMore,
}: {
  title: string
  role: Role
  players: ScoredPlayer[]
  openPlayer: (role: Role, id: number) => void
  onMore: () => void
}) {
  const top = players.slice(0, 10)
  const maxScore = Math.max(...top.map((p) => p.liveScore))
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line bg-navy px-5 py-3.5 text-navy-ink">
        <h2 className="display text-[1.35rem] font-semibold">{title}</h2>
        <button onClick={onMore} className="text-[12.5px] font-semibold text-navy-ink/80 hover:text-navy-ink">
          Full table
        </button>
      </div>
      <div className="grid grid-cols-[2rem_1fr_5.5rem_4.2rem] gap-x-3 border-b border-line px-5 py-2 text-[11px] uppercase tracking-wider text-ink-3">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">{role === 'bat' ? 'Pressure SR' : 'Pressure econ'}</span>
        <span className="text-right" title="Share of 400 bootstrap resamples in which the player stays top 10">
          Holds top 10
        </span>
      </div>
      <ol>
        {top.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => openPlayer(role, p.id)}
              className="grid w-full grid-cols-[2rem_1fr_5.5rem_4.2rem] items-center gap-x-3 border-b border-line px-5 py-2.5 text-left last:border-b-0 hover:bg-surface-2"
            >
              <span className="display num text-[1.35rem] font-bold text-pink">{p.liveRank}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-semibold text-ink">{p.name}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-3">
                    {[p.country, iplCode(p.ipl_team)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="h-[5px] rounded-full bg-surface-2">
                  <span
                    className="block h-[5px] rounded-full bg-pink"
                    style={{ width: `${Math.max(6, (p.liveScore / maxScore) * 100)}%` }}
                  />
                </span>
              </span>
              <span className="num text-right text-[13.5px]">
                {role === 'bat' ? fmt.dec(p.press.sr, 0) : fmt.dec(p.press.econ, 2)}
                <span className="block text-[11px] text-ink-3">
                  vs {role === 'bat' ? fmt.dec(p.norm.sr, 0) : fmt.dec(p.norm.econ, 2)}
                </span>
              </span>
              <span className="num text-right text-[13.5px] font-medium">{fmt.pct(p.boot.p_top10)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
