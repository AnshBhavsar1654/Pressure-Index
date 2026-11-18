import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Bullets, PageHead, SectionHead, Stat, Tag } from '@/components/kit'
import { getInputs, getRR, getSummary } from '@/lib/data'
import { fmt } from '@/lib/format'

export const metadata: Metadata = { title: 'Data used' }

type Row = { name: ReactNode; what: ReactNode; use: ReactNode }

function SourceTable({ head, rows }: { head: [string, string, string]; rows: Row[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead className="text-[12.5px] text-ink-3">
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top last:border-0">
              <td className="w-[24%] px-4 py-3 font-semibold">{r.name}</td>
              <td className="w-[34%] px-4 py-3 text-ink-2">{r.what}</td>
              <td className="px-4 py-3 text-ink-2">{r.use}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const file = (f: string) => <span className="font-mono text-[12.5px]">{f}</span>

export default function SourcesPage() {
  const s = getSummary()
  const rr = getRR()
  const inp = getInputs()
  const pv = rr.provenance
  const pub = s.public
  const packBalls = s.n_balls - (pub?.balls ?? 0)
  const packMatches = s.n_matches - (pub?.matches ?? 0)

  return (
    <>
      <PageHead
        title="Data used"
        summary="Every dataset behind the rankings, in one place: what was taken as is, what was blended in from public sources, and what was checked and left out."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Official data pack" value={fmt.int(packBalls)} tone="pink" note={`deliveries in ${fmt.int(packMatches)} IPL and T20I matches, 2022–26`} />
        <Stat label="Blended in (public)" value={pub ? fmt.int(pub.balls) : '0'} tone="blue" note={pub ? `deliveries from the ${pub.matches} matches of the 2026 T20 World Cup` : 'none'} />
        <Stat label="Used for ratings" value={fmt.int(s.n_top_level_matches)} note="top-level matches: IPL, and T20Is between two full members" />
        <Stat label="RR figures checked" value={`${pv.checks_passed}/${pv.checks.length}`} note="against the public record, all exact" />
      </div>

      <SectionHead title="1. Taken as is: the official data pack" id="pack">
        Read straight from the SupeRR Selector Season 2 files. No row is edited by hand.
      </SectionHead>
      <SourceTable
        head={['File', 'What it holds', 'How it is used']}
        rows={[
          {
            name: file('ball_by_ball.csv'),
            what: 'Every delivery: runs, extras, wickets, batter, bowler, over and ball',
            use: <Bullets items={['Match state before every ball', 'Win chance, stakes and pressure balls', 'Runs added per ball, so every rating']} />,
          },
          {
            name: file('matches.csv'),
            what: 'Fixture, stage, knockout flag, revised overs and target, venue country, result',
            use: <Bullets items={['Knockouts (every ball is a pressure ball)', 'Rain-reduced targets', 'Host-country adjustment for T20Is', 'Win / loss labels for the win-chance model']} />,
          },
          {
            name: file('competitions.csv'),
            what: 'Competition name and season',
            use: <Bullets items={['IPL or T20I, and the season', 'Which matches count as top level']} />,
          },
          {
            name: file('competition_team_player_mapping.csv'),
            what: 'Squad lists for each competition',
            use: <Bullets items={['Nationality and latest IPL team', 'RR’s 2026 squad', 'Matching retention names to player ids']} />,
          },
          {
            name: file('playing_eleven.csv'),
            what: 'Who played each match, and who kept wicket',
            use: <Bullets items={['Roles of RR’s retained players (batter, keeper, all-rounder, bowler)']} />,
          },
          {
            name: file('teams.csv'),
            what: 'Team names and ids',
            use: <span className="text-ink-3">Not needed: team names are already in the files above.</span>,
          },
        ]}
      />

      <SectionHead title="2. Blended in: public ball-by-ball data" id="blended">
        The pack has no World Cup cricket. The brief allows public data alongside it, so one tournament is added.
      </SectionHead>
      {pub && (
        <SourceTable
          head={['Source', 'What was added', 'How it was blended']}
          rows={[
            {
              name: (
                <>
                  {pub.name}
                  <span className="mt-1 block text-[12.5px] font-normal text-ink-3">
                    <a href="https://cricsheet.org" target="_blank" rel="noreferrer" className="text-pink-ink hover:underline">
                      Cricsheet
                    </a>{' '}
                    (CC BY licence)
                  </span>
                </>
              ),
              what: (
                <Bullets
                  items={[
                    `${pub.matches} of 55 matches, ${fmt.int(pub.balls)} deliveries`,
                    'Both semi-finals and the final (counted as knockouts)',
                    'Missing: 2 washouts, and Afghanistan’s 4 group games (not in the public files we could reach)',
                  ]}
                />
              ),
              use: (
                <Bullets
                  items={[
                    <>Converted into the pack’s own file format ({file('public_data/t20wc2026/')})</>,
                    <>
                      Players matched to pack ids: <b>{inp.mapped.ballByBall}</b> by lining up shared matches ball by ball,{' '}
                      <b>{inp.mapped.byName}</b> by surname and initial within the same country (only when one player fits),{' '}
                      <b>{inp.mapped.added}</b> new (mostly associate players)
                    </>,
                    <>Every match decision listed in {file('player_map.csv')}</>,
                    'Then treated exactly like any other T20I',
                  ]}
                />
              ),
            },
          ]}
        />
      )}

      <SectionHead title="3. Public facts behind the selection rules" id="facts">
        These never change a rating. They decide who RR can buy, and label players.
      </SectionHead>
      <SourceTable
        head={['Fact', 'Source', 'Effect']}
        rows={[
          {
            name: 'IPL 2027 retention lists',
            what: `Official announcements, ${inp.retentionDate ?? '17 November 2026'}: ${inp.retainedPlayers} players across ${inp.retainedTeams} franchises`,
            use: <Bullets items={['Retained players leave the top 10s', 'RR’s own list sets their open places and overseas slots']} />,
          },
          {
            name: 'Retired or unavailable',
            what: `${inp.retired} players retired from the IPL; ${inp.unavailable.join(', ') || 'none'} banned for 2027`,
            use: 'Never recommended (nor is anyone with no top-level cricket in 2026, read from the pack)',
          },
          {
            name: 'Auction eligibility',
            what: 'Pakistani players cannot enter the IPL auction; the Bangladesh board often limits IPL release (NOC)',
            use: <Bullets items={['Pakistani players left out', 'At most one Bangladeshi player per top 10']} />,
          },
          {
            name: 'Birth dates',
            what: `${inp.birthDates} players, from public profiles`,
            use: <Bullets items={['The “Emerging” label (under 26 for IPL 2027)', 'The emerging picks list', 'Never used by the ranking']} />,
          },
          {
            name: 'Nationality fixes',
            what: `${inp.nationality} players with no T20I in 2022–26 (e.g. Sunil Narine)`,
            use: 'Correct overseas labels (otherwise they would read as uncapped Indians)',
          },
          {
            name: 'Role fix',
            what: `${inp.roles.join(', ')}: keeps wicket for his country, never did for RR`,
            use: 'Listed as a keeper in RR’s retained squad',
          },
        ]}
      />

      <SectionHead title="4. Used only to check" id="checks">
        Not an input. RR’s 2026 numbers, rebuilt from the pack, against the public record.
      </SectionHead>
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
          <h3 className="text-[14.5px] font-semibold">
            <a href={pv.reference.url} className="text-pink-ink hover:underline" target="_blank" rel="noreferrer">
              {pv.reference.name}
            </a>
            <span className="font-normal text-ink-3">, accessed {fmt.date(pv.reference.accessed)}</span>
          </h3>
          <Tag tone={pv.checks_passed === pv.checks.length ? 'pink' : 'blue'}>
            {pv.checks_passed} of {pv.checks.length} match exactly
          </Tag>
        </div>
        <div className="grid sm:grid-cols-2">
          {[pv.checks.slice(0, Math.ceil(pv.checks.length / 2)), pv.checks.slice(Math.ceil(pv.checks.length / 2))].map((half, i) => (
            <table key={i} className="w-full text-[13px] sm:[&:first-child]:border-r sm:[&:first-child]:border-line">
              <thead className="text-[12px] text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 text-left font-medium">Figure</th>
                  <th className="px-2 py-2 text-right font-medium">Public</th>
                  <th className="px-2 py-2 text-right font-medium">Mine</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">Match</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {half.map((c) => (
                  <tr key={c.item} className="border-b border-line last:border-0">
                    <td className="px-5 py-1.5 text-ink-2">{c.item}</td>
                    <td className="num px-2 py-1.5 text-right">{c.public}</td>
                    <td className="num px-2 py-1.5 text-right font-semibold">{c.ours}</td>
                    <td className="px-4 py-1.5 text-right">
                      {c.match ? (
                        <CheckCircle size={17} weight="fill" className="ml-auto text-pink" aria-label="matches" />
                      ) : (
                        <XCircle size={17} weight="fill" className="ml-auto text-blue" aria-label="differs" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>

      <SectionHead title="5. Checked and left out" id="left-out" />
      <div className="grid gap-3 md:grid-cols-3">
        {[
          {
            t: 'Domestic T20 (Syed Mushtaq Ali Trophy)',
            b: [
              'Cricsheet has only 91 SMAT matches since 2022',
              'About a third of each season, mostly televised and knockout games',
              '8 from 2024–25, none from 2025–26',
              'Too patchy to rate players fairly, so named as a limitation',
            ],
          },
          {
            t: 'Associate T20Is and A-team events',
            b: ['In the pack, but left out of ratings', 'One clear rule (top level only) instead of a made-up discount', 'Still used for nationality'],
          },
          {
            t: 'Not in any source we used',
            b: ['The 2022 and 2024 T20 World Cups', 'Fielding, ball tracking and pitch reports', 'Injuries, form outside these matches, and auction prices'],
          },
        ].map((c) => (
          <div key={c.t} className="panel p-4">
            <h3 className="mb-2 text-[14.5px] font-semibold">{c.t}</h3>
            <Bullets items={c.b} className="text-[13.5px]" />
          </div>
        ))}
      </div>

      <SectionHead title="6. Other assets" id="assets" />
      <Bullets
        items={[
          <>Country flags: the MIT-licensed {file('country-flag-icons')} package.</>,
          'Team crests: kit-colour roundels with each side’s short code. Official logos are trademarks, so none are bundled.',
          <>
            How each number is computed from these files:{' '}
            <Link href="/method/#sources" className="font-semibold text-pink-ink hover:underline">
              How it works
            </Link>
            .
          </>,
        ]}
      />
    </>
  )
}
