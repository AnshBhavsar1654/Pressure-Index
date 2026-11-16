import type { Metadata } from 'next'
import { PageHead } from '@/components/kit'

export const metadata: Metadata = { title: 'Privacy' }

export default function PrivacyPage() {
  return (
    <article className="max-w-[70ch]">
      <PageHead title="Privacy" summary="Pressure Index does not collect any information about you." />
      <div className="panel flex flex-col gap-4 p-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-foreground">
        <h2>What I collect</h2>
        <p>Nothing. There are no accounts, sign-ups, forms, cookies, analytics or advertising trackers on this site.</p>
        <h2>What is stored on your device</h2>
        <p>
          If you switch between the light and dark theme, that choice is saved in your browser’s local storage so the site
          remembers it next time. It never leaves your device. Clearing your browser data removes it.
        </p>
        <h2>Third parties</h2>
        <p>
          Fonts and all data are served with the site itself, so your browser does not contact any other service while you use
          it. The company hosting the site may keep standard server logs, such as IP addresses and pages requested, under its
          own privacy policy.
        </p>
        <h2>The data shown</h2>
        <p>
          Player statistics come from public match records supplied in the SupeRR Selector Season 2 data pack. They describe
          on-field performance only.
        </p>
        <p className="text-[13.5px] text-ink-3">Last updated 16 November 2026.</p>
      </div>
    </article>
  )
}
