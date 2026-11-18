import type { Metadata } from 'next'
import Link from 'next/link'
import { Flag } from '@/components/Flag'
import { Note, OverseasMark, PageHead, PlayerAvatar, SectionHead, Tag, ordinal, signed } from '@/components/kit'
import { TeamBadge } from '@/components/TeamBadge'
import { Term } from '@/components/Term'
import { getRole, getRR, getSummary } from '@/lib/data'
import { momentLine } from '@/views/Moments'
import { fmt, iplCode } from '@/lib/format'
import { winPts } from '@/lib/terms'
import { rescore, type ComponentKey, type Gap, type Player, type Role } from '@/lib/types'

export const metadata: Metadata = { title: 'My picks' }

const PHASE_WORD: Record<string, string> = { Powerplay: 'powerplay', Middle: 'middle overs', Death: 'death' }
const SLOT: Record<string, string> = {
  bat_powerplay: 'opening batter',
  bat_middle: 'middle-order batter',
  bat_death: 'finisher',
  bowl_powerplay: 'new-ball bowler',
  bowl_middle: 'middle-overs bowler',
  bowl_death: 'death bowler',
}
const MIN_PHASE_BALLS = 30 // fewer pressure balls than this in a phase is too thin to call a strength

type Pick = { p: Player; z: Record<ComponentKey, number>; beats: Record<ComponentKey, number> }

/** The recommended players, best first, with each piece of evidence against the whole qualified pool. */
function picks(role: Role): Pick[] {
  const pool = getRole(role).players.filter((p) => p.merit_rank != null)
  return rescore(pool)
    .filter((p) => p.rank != null && p.rank <= 10)
    .toSorted((a, b) => a.rank! - b.rank!)
    .map((p) => ({ p, z: p.z, beats: p.beats }))
}

/** One line of evidence: how much there is, and the raw rate against what an average player would do on the same balls. */
function evidence(p: Player, role: Role) {
  const rate =
    role === 'bat'
      ? `strike rate ${fmt.dec(p.press.sr, 0)} vs ${fmt.dec(p.press.par_sr, 0)} for an average batter`
      : `economy ${fmt.dec(p.press.econ, 2)} vs ${fmt.dec(p.press.par_econ, 2)} for an average bowler`
  return `${fmt.int(p.p_balls)} pressure balls in ${p.p_matches} matches · ${rate}`
}

/** The biggest pressure moment, in one short line. */
function moment(p: Player, role: Role) {
  const m = p.moments[0]
  if (!m) return null
  return `${momentLine(m, role)} v ${m.opp}, ${fmt.date(m.date)} (${fmt.chance(m.wp_from)} → ${fmt.chance(m.wp_to)}${m.won ? '' : ', lost'})`
}

/** Where the player is strongest under pressure, and whether that fixes a phase where RR lost runs in 2026: one short line. */
function fit(p: Player, role: Role, gaps: Gap[], targets: Set<string>) {
  const phases = p.phases.filter((ph) => ph.balls >= MIN_PHASE_BALLS && ph.rv100 != null).toSorted((a, b) => b.rv100! - a.rv100!)
  if (!phases.length) return { fills: false, text: 'Too few pressure balls in any one phase to name a role yet' }
  const key = `${role}_${phases[0].phase.toLowerCase()}`
  const g = gaps.find((x) => x.key === key)!
  const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
  if (targets.has(key)) return { fills: true, text: `${cap(SLOT[key])}: RR were ${ordinal(g.rank)} of 10 there in 2026` }
  // strongest where RR are already fine: a second strength in a phase RR need still fills a gap
  const other = phases.slice(1).find((ph) => targets.has(`${role}_${ph.phase.toLowerCase()}`) && ph.rv100! > 0)
  if (other) {
    const k2 = `${role}_${other.phase.toLowerCase()}`
    return { fills: true, text: `Can cover ${SLOT[k2]} (best in the ${PHASE_WORD[phases[0].phase]})` }
  }
  return { fills: false, text: `${cap(SLOT[key])}: RR were already ${ordinal(g.rank)} of 10 there` }
}

export default function PicksPage() {
  const rr = getRR()
  const targets = new Set(rr.recommendations.map((r) => r.gap.key))
  const lists = { bat: picks('bat'), bowl: picks('bowl') }
  const elig = getRole('bat').eligibility
  const fresh = (role: Role) =>
    getRole(role)
      .players.filter((p) => p.fresh_rank != null)
      .toSorted((a, b) => a.fresh_rank! - b.fresh_rank!)
      .slice(0, 8)

  return (
    <>
      <PageHead
        title="My picks"
        summary={
          <>
            The ten batters and ten bowlers RR could sign who deliver most reliably when the match is on the line, why I back each
            one and the gap they would fill, then the{' '}
            <a href="#fresh" className="font-semibold text-pink-ink hover:underline">
              fresh picks
            </a>{' '}
            among them who are new at the top level.
          </>
        }
      >
        <div className="max-w-sm">
          <Note title="Who makes the list">
            <ul className="mt-1 flex flex-col gap-1.5 pl-4 marker:text-pink" style={{ listStyle: 'disc' }}>
              <li>
                <b>Not in the auction:</b> RR’s own squad,{' '}
                {rr.pool.known || rr.pool.announced.length ? 'players retained by other teams, ' : ''}retired or banned players
                (Harry Brook can’t play in 2027) and Pakistani players.
              </li>
              <li>
                <b>Not recommended:</b> anyone worse under pressure than usual.
              </li>
              <li>
                <b>Indian players:</b> each one above average under pressure gets a place
                {rr.slots ? `, because RR have only ${rr.slots.open_overseas} overseas places left` : ''}.
              </li>
              <li>
                <b>Bangladeshi players:</b> at most one per list, because their board often limits IPL release.
              </li>
            </ul>
            {rr.pool.known && <p className="mt-1.5">Every name here can be bought at the auction.</p>}
          </Note>
        </div>
      </PageHead>

      <RetainedSquad />

      <section className="panel grid gap-6 p-5 sm:p-6 md:grid-cols-2" aria-label="The twenty picks at a glance">
        {(['bat', 'bowl'] as const).map((role) => (
          <div key={role}>
            <h2 className="display mb-3 text-[1.6rem]">{role === 'bat' ? 'Batters' : 'Bowlers'} <span className="text-[13px] font-normal text-ink-3">in ranking order</span></h2>
            <ol className="grid gap-1.5">
              {lists[role].map(({ p }) => (
                <li key={p.id} className="flex items-center gap-3 text-[14.5px]">
                  <span className="display num w-6 text-right text-[1.3rem] text-pink">{p.rank}</span>
                  <a href={`#${role}-${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </a>
                  <Flag country={p.country} size={18} />
                  {p.indian ? <Tag tone="pink">Indian</Tag> : <OverseasMark country={p.country} size={13} />}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {(['bat', 'bowl'] as const).map((role) => {
        // auction priority: players who fix a 2026 weak spot first, then those who add depth; each group keeps ranking order
        const withFit = lists[role].map((pk) => ({ pk, f: fit(pk.p, role, rr.gaps, targets) }))
        const groups = [
          { key: 'fills', title: 'Fill a gap first', note: 'Strongest in a phase where RR lost runs in 2026.', items: withFit.filter((x) => x.f.fills) },
          { key: 'depth', title: 'Then add depth', note: 'Best in a phase RR already handle well.', items: withFit.filter((x) => !x.f.fills) },
        ].filter((g) => g.items.length)
        return (
        <div key={role}>
          <SectionHead title={role === 'bat' ? 'The ten batters' : 'The ten bowlers'}>
            Players who fix one of RR’s weak spots come first, then those who add depth. The big number is the rank; hover any
            underlined term for what it means.
          </SectionHead>
          {groups.map((g) => (
          <div key={g.key} className="mb-6">
          <h3 className="mb-3 flex flex-wrap items-baseline gap-x-3 text-[15px] font-semibold">
            <Tag tone={g.key === 'fills' ? 'pink' : 'neutral'}>{g.items.length}</Tag> {g.title}
            <span className="text-[13px] font-normal text-ink-3">{g.note}</span>
          </h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {g.items.map(({ pk, f }) => {
              const { p } = pk
              return (
                <article key={p.id} id={`${role}-${p.id}`} className="panel flex scroll-mt-24 flex-col gap-4 p-5">
                  <header className="flex items-start gap-4">
                    <span className="display num text-[2.6rem] leading-none text-pink">{p.rank}</span>
                    <PlayerAvatar name={p.name} size={46} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/players/${role}/${p.id}/`} className="display text-[1.7rem] hover:underline">
                        {p.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
                        <Flag country={p.country} size={18} />
                        <span>{p.country}</span>
                        {p.ipl_team && <TeamBadge team={p.ipl_team} size={20} />}
                        <span>{role === 'bat' ? (p.hand === 'LHB' ? 'Left-handed' : 'Right-handed') : p.bowl_type}</span>
                      </div>
                    </div>
                  </header>

                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      [<Term key="u" k="underPressure" role={role} />, signed(p.p_rv100)],
                      [<Term key="l" k="lift" />, signed(p.delta100)],
                      [<Term key="w" k="winImpact" />, winPts(p.wpa100)],
                      [<Term key="t" k="confidence" />, fmt.pct(p.boot?.p_top10)],
                    ].map(([k, v], i) => (
                      <div key={i} className="rounded-lg bg-panel-2 px-3 py-2">
                        <dt className="text-[12px] text-ink-3">{k}</dt>
                        <dd className="display num text-[1.5rem]">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px] leading-snug">
                    <dt className="text-ink-3">Evidence</dt>
                    <dd className="text-ink-2">{evidence(p, role)}</dd>
                    {moment(p, role) && (
                      <>
                        <dt className="text-ink-3">Best moment</dt>
                        <dd className="text-ink-2">{moment(p, role)}</dd>
                      </>
                    )}
                    <dt className="text-ink-3">For RR</dt>
                    <dd className="flex flex-wrap items-center gap-2 text-ink-2">
                      <Tag tone={f.fills ? 'pink' : 'neutral'}>{f.fills ? 'Fills a gap' : 'Adds depth'}</Tag>
                      <span>{f.text}</span>
                    </dd>
                  </dl>
                </article>
              )
            })}
          </div>
          </div>
          ))}
        </div>
        )
      })}

      <IndianSection />

      <SectionHead id="fresh" title="Fresh picks: new at the top level">
        Players whose first IPL or T20I match in the data is {elig.fresh_from} or later, the kind of find an auction can be won on. The
        data starts in 2022 and holds no ages, so a few are new to this level rather than young. They clear the same bar and are ranked
        on exactly the same scale as the top 10; this list just pulls the newcomers out. Shorter records, so their ratings lean more
        on their usual level: treat them as scouting leads rather than sure things.
      </SectionHead>
      <div className="mb-10 grid gap-4 xl:grid-cols-2">
        {(['bat', 'bowl'] as const).map((role) => (
          <section key={role} className="panel overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-[15px] font-semibold">{role === 'bat' ? 'Batters' : 'Bowlers'}</h3>
            <ol className="divide-y divide-line">
              {fresh(role).map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-[13.5px]">
                  <span className="display num w-5 text-right text-[1.2rem] text-pink">{p.fresh_rank}</span>
                  <PlayerAvatar name={p.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/players/${role}/${p.id}/`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-[12px] text-ink-3">
                      {p.country ?? 'Uncapped'} · first seen {p.debut} · {p.p_balls} pressure balls
                      {p.ipl_team ? ` · last IPL squad ${iplCode(p.ipl_team)}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num block font-semibold">{signed(p.p_rv100)}</span>
                    <span className="block text-[11.5px] text-ink-3">recent {signed(p.recent100)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

    </>
  )
}

/** RR's retained players for 2027, by role: the squad the auction builds on. */
function RetainedSquad() {
  const rr = getRR()
  const squad = rr.retained_squad
  if (!squad?.length) return null
  const sl = rr.slots
  const has = (role: Role, id: number) => getRole(role).players.some((p) => p.id === id)
  const groups = [
    { key: 'batter', title: 'Batters' },
    { key: 'keeper', title: 'Wicket-keepers' },
    { key: 'allrounder', title: 'All-rounders' },
    { key: 'bowler', title: 'Bowlers' },
  ] as const
  const unseen = squad.filter((p) => p.role == null)
  const deathBat = rr.phases.find((p) => p.phase === 'Death')?.bat_rank ?? 0
  const ppBat = rr.phases.find((p) => p.phase === 'Powerplay')?.bat_rank ?? 0
  const need = rr.squad_need
  return (
    <section className="panel mb-6 p-5 sm:p-6" aria-labelledby="retained-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="retained-title" className="display text-[1.6rem]">
          RR’s retained squad for 2027
        </h2>
        <span className="text-[13px] text-ink-3">
          {squad.length} players, {squad.filter((p) => p.overseas).length} from overseas
          {sl ? ` · ${sl.open} places open, up to ${sl.open_overseas} overseas` : ''}
        </span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => {
          const items = squad.filter((p) => p.role === g.key)
          return (
            <div key={g.key}>
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-pink-ink">
                {g.title} <span className="font-normal text-ink-3">{items.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {items.map((p) => {
                  const prof = has('bat', p.id) && (g.key !== 'bowler' || !has('bowl', p.id)) ? 'bat' : has('bowl', p.id) ? 'bowl' : has('bat', p.id) ? 'bat' : null
                  // the stats that match his role: batting for batters and keepers, bowling for bowlers, both for all-rounders
                  const bat = g.key !== 'bowler' && p.bat26 && `${p.bat26.runs} runs, SR ${p.bat26.sr.toFixed(0)}`
                  const bowl = (g.key === 'bowler' || g.key === 'allrounder') && p.bowl26 && `${p.bowl26.wkts} wkt${p.bowl26.wkts === 1 ? '' : 's'}, econ ${p.bowl26.econ.toFixed(2)}`
                  const stats = [bat, bowl].filter(Boolean)
                  return (
                    <li key={p.id} className="text-[14px]">
                      <span className="flex items-center gap-1.5">
                        {prof ? (
                          <Link href={`/players/${prof}/${p.id}/`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{p.name}</span>
                        )}
                        {p.overseas && <OverseasMark size={12} />}
                        {p.role_source === 'public record' && <span className="text-[11px] text-ink-3">(role from public record)</span>}
                      </span>
                      <span className="block text-[12px] text-ink-3">
                        {stats.length ? `IPL 2026: ${stats.join(' · ')}` : `${p.matches} matches since 2024, little in 2026`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-4 rounded-lg bg-pink-soft/50 px-4 py-3 text-[14px] leading-relaxed text-ink">
        <b>What RR need:</b> batting is the thin side. RR kept {need.batter + need.keeper} batters against {need.bowler} bowlers, and
        were {ordinal(deathBat)} of 10 batting at the death in 2026 while the powerplay (Jaiswal and Sooryavanshi) was{' '}
        {ordinal(ppBat)}. So the batters in the top 10 who are strong from number 3 down and at the death are the ones to look at
        first.
      </p>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
        Roles come from what each player did in his matches since 2024 (the data has no role field): wicket-keeper if he kept
        wicket in at least a quarter of them, all-rounder if he bowled and batted regularly, otherwise batter or bowler. Lhuan-dre
        Pretorius keeps wicket for South Africa but never did for RR (Jurel kept), so his role comes from the public record.
        {unseen.length ? ` Not yet seen at this level: ${unseen.map((p) => p.name).join(', ')}.` : ''}
      </p>
    </section>
  )
}

/** The player's biggest pressure game of 2025-26, if it added 15+ points of win chance. */
function bigGame(p: Player, role: Role) {
  const m = p.matches.filter((x) => x.date >= '2025').toSorted((a, b) => b.wpa - a.wpa)[0]
  return m && Math.round(m.wpa * 100) >= 15 ? `${winPts(m.wpa)} v ${m.opp}, ${fmt.date(m.date)} (${role === 'bat' ? `${m.r} off ${m.balls} pressure balls` : `${m.out}/${m.r} in ${m.balls} pressure balls`})` : null
}

/** RR's squad maths, the Indian rule, and the Indian options beyond the top 10. */
function IndianSection() {
  const rr = getRR()
  const ni = getSummary().new_indians
  const sl = rr.slots
  const lists = (['bat', 'bowl'] as const).map((role) => {
    const ps = getRole(role).players
    return {
      role,
      inTop: ps.filter((p) => p.rank != null && p.rank <= 10 && p.indian).toSorted((a, b) => a.rank! - b.rank!),
      options: ps.filter((p) => p.india_rank != null).toSorted((a, b) => a.india_rank! - b.india_rank!).slice(0, 8),
      overseas: ps.filter((p) => p.rank != null && p.rank <= 10 && !p.indian).length,
    }
  })
  return (
    <>
      <SectionHead id="indian" title="Indian players, and RR’s overseas places">
        {sl
          ? `RR have kept ${sl.retained} players, ${sl.retained_overseas} of them from overseas. With at most ${sl.squad_max} in a squad and ${sl.overseas_max} from overseas, that leaves ${sl.open} places, no more than ${sl.open_overseas} of them for overseas players. `
          : ''}
        So every Indian player who is above average under pressure and does not dip is guaranteed a place in the top 10s (up to five
        per list), with a third of the evidence bar, because the data pack has no domestic cricket: an Indian player’s only top-level cricket
        here is the IPL. No below-average player is promoted.
      </SectionHead>
      <div className="grid gap-4 xl:grid-cols-2">
        {lists.map(({ role, inTop, options, overseas }) => (
          <section key={role} className="panel flex flex-col gap-3 p-5">
            <h3 className="text-[15px] font-semibold">{role === 'bat' ? 'Batters' : 'Bowlers'}</h3>
            <p className="text-[13.5px] leading-relaxed text-ink-2">
              In the top 10:{' '}
              {inTop.length
                ? inTop.map((p) => `${p.name} (#${p.rank}, ${signed(p.p_rv100)})`).join(', ')
                : 'no Indian player clears the bar'}
              . The other {overseas} are overseas: RR would pick the best {sl ? sl.open_overseas : 3} of them for the overseas places left.
            </p>
            <div>
              <h4 className="mb-1.5 text-[13px] font-semibold">Indian options beyond the top 10</h4>
              {options.length ? (
                <ol className="divide-y divide-line rounded-lg border border-line">
                  {options.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <Link href={`/players/${role}/${p.id}/`} className="min-w-0 flex-1 font-medium hover:underline">
                        {p.name}
                        <span className="block text-[12px] font-normal text-ink-3">
                          {p.p_balls} pressure balls, {p.r_balls} in 2025–26{p.ipl_team ? ` · last IPL squad ${iplCode(p.ipl_team)}` : ''}
                        </span>
                        {bigGame(p, role) && <span className="block text-[12px] font-normal text-pink-ink">Big game: {bigGame(p, role)}</span>}
                      </Link>
                      <span className="num text-right font-semibold">{signed(p.p_rv100)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] text-ink-3">None: no other signable Indian in a 2026 squad is above average without dipping.</p>
              )}
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
                In a 2026 IPL squad, and either above average under pressure without dipping, or a match-winner under pressure in 2025–26
                (+15 points of win chance in one game). The number is the overall rating: one big game can sit beside a below-average
                record, so these are options to weigh, not proven picks.
              </p>
            </div>
          </section>
        ))}
      </div>
      <p className="panel mt-4 p-4 text-[14px] leading-relaxed text-ink-2 [&_b]:text-ink">
        <b>Why so few young Indian players?</b> Of the {ni.total} Indian players first seen in {ni.from} or later with 60+ balls in the data,
        franchises retained <b>{ni.kept}</b>; only <b>{ni.available}</b> reached the auction. The young Indian talent that has shown
        something is already taken. The data pack has no ages and no domestic cricket, so it cannot find the next one: for those
        places RR should scout domestic T20 cricket, and use the proven Indian players above.
      </p>
    </>
  )
}
