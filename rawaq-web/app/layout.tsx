import type { Metadata } from 'next'
import { Barlow_Semi_Condensed, Mulish, Noto_Sans_Arabic } from 'next/font/google'
import './globals.css'
import dynamic from 'next/dynamic'
import { AuthProvider } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { ErrorToastProvider } from '@/components/feedback/ErrorToast'
import { Analytics } from "@vercel/analytics/next"

const CustomCursor = dynamic(
  () => import('@/components/ui/CustomCursor').then(m => ({ default: m.CustomCursor })),
  { ssr: false, loading: () => null },
)
const SupportChatWidget = dynamic(
  () => import('@/components/support/SupportChatWidget').then(m => ({ default: m.SupportChatWidget })),
  { ssr: false, loading: () => null },
)
const ServiceWorkerRegister = dynamic(
  () => import('@/components/ServiceWorkerRegister').then(m => ({ default: m.ServiceWorkerRegister })),
  { ssr: false, loading: () => null },
)
const ChunkLoadRecovery = dynamic(
  () => import('@/components/ChunkLoadRecovery').then(m => ({ default: m.ChunkLoadRecovery })),
  { ssr: false, loading: () => null },
)
import { SpeedInsights } from "@vercel/speed-insights/next"

const displayFont = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

const sansFont = Mulish({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

// 'fallback' = 100 ms block window then 3 s swap window.
// Prevents FOUT on the Arabic hero headline without permanently abandoning the font.
const arabicFont = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'fallback',
})

export const metadata: Metadata = {
  title: { default: 'Rawaq — Discover Local Events', template: '%s | Rawaq' },
  description: 'Find and join local events in your local area. Explore a wide range of activities and connect with your community.',
  icons: {
    icon: '/website-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${displayFont.variable} ${sansFont.variable} ${arabicFont.variable}`}>
      <head>
        {/* Lock direction to the app's locale choice — never the browser/OS language */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var l=localStorage.getItem('rawaq_locale');document.documentElement.dir=l==='ar'?'rtl':'ltr';document.documentElement.lang=l==='ar'?'ar':'en';})()` }} />
      </head>
      <body>
        <ChunkLoadRecovery />
        <ServiceWorkerRegister />
        <CustomCursor />
        <LocaleProvider>
          <ErrorToastProvider>
            <AuthProvider>
              {children}
              <SupportChatWidget />
            </AuthProvider>
          </ErrorToastProvider>
        </LocaleProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
