import type { Metadata } from 'next'
import { Barlow_Semi_Condensed, Mulish, Noto_Sans_Arabic } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { ErrorToastProvider } from '@/components/feedback/ErrorToast'
import { CustomCursor } from '@/components/ui/CustomCursor'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"

const displayFont = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
})

const sansFont = Mulish({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

const arabicFont = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
})

export const metadata: Metadata = {
  title: { default: 'Rawaq — Discover Local Events', template: '%s | Rawaq' },
  description: 'Find and join local events in your local area. Explore a wide range of activities and connect with your community.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${displayFont.variable} ${sansFont.variable} ${arabicFont.variable}`}>
      <head>
        {/* Lock direction to the app's locale choice — never the browser/OS language */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var l=localStorage.getItem('rawaq_locale');document.documentElement.dir=l==='ar'?'rtl':'ltr';document.documentElement.lang=l==='ar'?'ar':'en';})()` }} />
      </head>
      <body>
        <ServiceWorkerRegister />
        <CustomCursor />
        <LocaleProvider>
          <ErrorToastProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ErrorToastProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
