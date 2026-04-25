import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/auth-context'
import { LocaleProvider } from '@/contexts/locale-context'
import { ErrorToastProvider } from '@/components/feedback/ErrorToast'
import { CustomCursor } from '@/components/ui/CustomCursor'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"



export const metadata: Metadata = {
  title: { default: 'Rawaq — Discover Local Events', template: '%s | Rawaq' },
  description: 'Find and join local events in your local area. Explore a wide range of activities and connect with your community.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Lock direction to the app's locale choice — never the browser/OS language */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var l=localStorage.getItem('rawaq_locale');document.documentElement.dir=l==='ar'?'rtl':'ltr';document.documentElement.lang=l==='ar'?'ar':'en';})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700;800;900&family=Mulish:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
