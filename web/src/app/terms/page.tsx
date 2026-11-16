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
          An independent entry to the SupeRR Selector Season 2 analytics challenge. It is not an official product of Rajasthan
          Royals, the IPL, the BCCI or any team, and is not endorsed by them.
        </p>
        <h2>The numbers</h2>
        <p>
          Ratings, rankings and recommendations are the result of statistical analysis of the supplied data pack. They are
          provided as they are, may contain errors, and are opinions about past performance rather than guarantees about the
          future. They are not betting or financial advice.
        </p>
        <h2>Names and marks</h2>
        <p>
          Team and player names belong to their owners and are used only to identify them. The round team badges are generic
          colour markers, not official logos.
        </p>
        <h2>Using this work</h2>
        <p>
          You are welcome to view, share and cite these pages. If you quote figures, please credit Pressure Index and the
          SupeRR Selector data pack, and link to the methodology.
        </p>
        <p className="text-[13.5px] text-ink-3">Last updated 16 November 2026.</p>
      </div>
    </article>
  )
}
