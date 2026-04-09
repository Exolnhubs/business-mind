'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLocale } from '@/contexts/locale-context'

export function Footer() {
  const { t } = useLocale()

  return (
    <footer className="footer-dark mt-auto">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 py-14 sm:py-16">

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8 mb-12">

          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="footer-logo inline-flex items-center gap-2.5">
              <span className="footer-wand leading-none"><Image src="/icon.png" alt="" width={28} height={28} /></span>
              <span className="footer-brand-name">Rawaq</span>
            </Link>
            <p
              className="text-sm leading-relaxed max-w-xs"
              style={{ color: 'oklch(0.55 0.015 74)' }}
            >
              {t('footer.tagline')}
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="footer-section-label">{t('footer.platform')}</p>
            <div className="flex flex-col gap-2">
              <FooterLink href="/events">{t('footer.browse_events')}</FooterLink>
              <FooterLink href="/register">{t('footer.sign_up_free')}</FooterLink>
              <FooterLink href="/login">{t('nav.login')}</FooterLink>
            </div>
          </div>

          {/* Company */}
          <div>
            <p className="footer-section-label">{t('footer.company')}</p>
            <div className="flex flex-col gap-2">
              <FooterLink href="/about">{t('footer.about')}</FooterLink>
              <FooterLink href="/terms">{t('footer.terms')}</FooterLink>
              <FooterLink href="/privacy">{t('footer.privacy')}</FooterLink>
              <FooterLinkExternal href="mailto:hello@rawaq.app">{t('footer.contact')}</FooterLinkExternal>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="footer-divider border-t pt-7 flex flex-col sm:flex-row items-center justify-between gap-3"
        >
          <p className="text-xs" style={{ color: 'oklch(0.42 0.012 74)' }}>
            © {new Date().getFullYear()} {t('footer.rights')}
          </p>
          <p className="text-xs flex items-center gap-1.5" style={{ color: 'oklch(0.42 0.012 74)' }}>
            <span className="footer-globe">🌍</span>
            {t('footer.connecting')}
          </p>
        </div>

      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="footer-link">
      {children}
      <span className="footer-link-arrow" aria-hidden>→</span>
    </Link>
  )
}

function FooterLinkExternal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="footer-link">
      {children}
      <span className="footer-link-arrow" aria-hidden>→</span>
    </a>
  )
}
