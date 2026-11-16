import type { Metadata } from 'next'
import { Big_Shoulders, Public_Sans } from 'next/font/google'
import { Sidebar } from '@/components/shell/Sidebar'
import './globals.css'

const display = Big_Shoulders({ subsets: ['latin'], variable: '--font-display-face', weight: ['700', '800', '900'] })
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body' })

export const metadata: Metadata = {
  title: { default: 'Pressure Index', template: '%s | Pressure Index' },
  description:
    'Who delivers when the match is on the line? Pressure-adjusted ratings of IPL and T20I players, and an IPL 2027 auction plan for Rajasthan Royals.',
}

// Apply a stored theme before paint so the wrong palette never flashes.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-pink px-3 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <div className="lg:grid lg:grid-cols-[252px_1fr]">
          <Sidebar />
          <main id="main" className="min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-10">
            <div className="mx-auto max-w-[1280px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  )
}
