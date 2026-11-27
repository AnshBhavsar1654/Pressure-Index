import type { Metadata } from 'next'
import { Source_Sans_3, Source_Serif_4 } from 'next/font/google'
import Link from 'next/link'
import Script from 'next/script'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import './globals.css'

const body = Source_Sans_3({ subsets: ['latin'], variable: '--font-body' })
const display = Source_Serif_4({ subsets: ['latin'], variable: '--font-headline' })

export const metadata: Metadata = {
  title: { default: 'Pressure Index', template: '%s | Pressure Index' },
  description:
    'Who performs when the match is on the line? Win-probability and run-expectancy models over 600k+ IPL and T20I deliveries, pressure-adjusted player ratings, and an interactive analytics dashboard.',
}

const themeScript = `var systemDark=matchMedia('(prefers-color-scheme: dark)').matches;try{var q=new URLSearchParams(location.search).get('theme');if(q==='light'||q==='dark')localStorage.setItem('theme',q);var theme=localStorage.getItem('theme');document.documentElement.classList.toggle('dark',theme?theme==='dark':systemDark)}catch(e){document.documentElement.classList.toggle('dark',systemDark)}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(body.variable, display.variable)} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <TooltipProvider delayDuration={150}>
          <a
            href="#main"
            className="sr-only z-50 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
          >
            Skip to content
          </a>
          <div className="mx-auto flex min-h-dvh max-w-[1600px]">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-8 lg:py-8">
                {children}
              </main>
              <footer className="mx-4 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pb-6 pt-5 text-[13px] text-ink-3 sm:mx-7 lg:mx-8">
                <div className="flex flex-col gap-1">
                  <span>
                    Built by <b className="font-semibold text-ink-2">Ansh Bhavsar</b> ·{' '}
                    <a href="https://github.com/AnshBhavsar1654" className="hover:text-foreground hover:underline">
                      GitHub
                    </a>
                  </span>
                  <span>
                    Ball-by-ball data from{' '}
                    <a href="https://cricsheet.org" className="hover:text-foreground hover:underline">
                      Cricsheet
                    </a>{' '}
                    (Open Data Commons Attribution). An independent project, not affiliated with the IPL, the ICC or any team.
                  </span>
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
