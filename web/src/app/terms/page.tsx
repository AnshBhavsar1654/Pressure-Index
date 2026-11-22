import type { Metadata } from 'next'
import { PageHead } from '@/components/kit'

export const metadata: Metadata = { title: 'Terms of use' }

export default function TermsPage() {
  return (
    <article className="max-w-[70ch]">
      <PageHead title="Terms of use" summary="Short and plain: what this site is, what it is not, and how the numbers may be used." />
      <div className="panel flex flex-col gap-4 p-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-foreground">
        <h2>What this site is</h2>
        <p>
          An independent machine-learning and data-analytics project. It is not an official product of the IPL, the ICC, the BCCI
          or any team, and is not endorsed by them.
        </p>
        <h2>The numbers</h2>
        <p>
          Ratings and rankings are the result of statistical analysis of open ball-by-ball data from Cricsheet. They are
          provided as they are, may contain errors, and are opinions about past performance rather than guarantees about the
          future. They are not betting or financial advice.
        </p>
        <h2>Names and marks</h2>
        <p>
          Team and player names belong to their owners and are used only to identify them. Team chips are plain text codes, not
          official logos.
        </p>
        <h2>Using this work</h2>
        <p>
          You are welcome to view, share and cite these pages. If you quote figures, please credit Pressure Index and
          Cricsheet (cricsheet.org), and link to the methodology.
        </p>
        <p className="text-[13.5px] text-ink-3">Last updated 22 November 2026.</p>
      </div>
    </article>
  )
}
