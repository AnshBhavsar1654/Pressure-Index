import type { Metadata } from 'next'
import { Big_Shoulders, Outfit } from 'next/font/google'
import Link from 'next/link'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getRole } from '@/lib/data'
import { cn } from '@/lib/utils'
import './globals.css'

// Next.js ships no fallback metrics for Big Shoulders, so skip the generated
// fallback (that caused the build warning) and name a condensed system stack.
const display = Big_Shoulders({
  subsets: ['latin'],
  variable: '--font-display-face',
  weight: ['700', '800', '900'],
  adjustFontFallback: false,
  fallback: ['Arial Narrow', 'Roboto Condensed', 'sans-serif'],
})
const body = Outfit({ subsets: ['latin'], variable: '--font-body' })

export const metadata: Metadata = {
  title: { default: 'Pressure Index', template: '%s | Pressure Index' },
  description:
    'Who delivers when the match is on the line? Pressure-adjusted ratings of IPL and T20I players, and an IPL 2027 auction plan for Rajasthan Royals.',
}

// Dark is the home theme; a stored "light" choice is applied before paint.
const themeScript = `try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark')localStorage.setItem('theme',q);if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Only what the search box needs is sent to the browser.
  const index = (['bat', 'bowl'] as const).flatMap((role) =>
    getRole(role).players.map((p) => ({ id: p.id, name: p.name, role, rank: p.rank, ipl: p.ipl_team, country: p.country })),
  )
  return (
    <html lang="en" className={cn('dark', display.variable, body.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <TooltipProvider delayDuration={150}>
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          >
            Skip to content
          </a>
          <div className="mx-auto flex max-w-[1560px] gap-5 p-3 sm:p-4 lg:p-5">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <Topbar players={index} />
              <main id="main" className="min-w-0">
                {children}
              </main>
              <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pb-6 pt-5 text-[13px] text-ink-3">
                <div className="flex flex-col gap-1">
                  <span>
                    Submitted by <b className="font-semibold text-ink-2">Ansh Bhavsar</b>:{' '}
                    <a href="mailto:anshbhavsar164@gmail.com" className="hover:text-foreground hover:underline">
                      anshbhavsar164@gmail.com
                    </a>
                    ,{' '}
                    <a href="tel:+919979306408" className="hover:text-foreground hover:underline">
                      +91 99793 06408
                    </a>
                  </span>
                  <span>Independent entry to SupeRR Selector Season 2. Not affiliated with Rajasthan Royals or the IPL.</span>
                </div>
                <nav aria-label="Legal" className="flex gap-5">
                  <Link href="/method/" className="hover:text-foreground">
                    Methodology
                  </Link>
                  <Link href="/privacy/" className="hover:text-foreground">
                    Privacy
                  </Link>
                  <Link href="/terms/" className="hover:text-foreground">
                    Terms of use
                  </Link>
                </nav>
              </footer>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
