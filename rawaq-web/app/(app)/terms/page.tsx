import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Rawaq Terms of Service — the rules and guidelines governing your use of the platform.',
}

const LAST_UPDATED = 'March 2026'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 pt-4 border-t border-gray-100">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">

      {/* Header */}
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Welcome to Rawaq. By creating an account or using our platform you agree to these Terms.
          Please read them carefully. If you do not agree, please do not use Rawaq.
        </p>
      </div>

      {/* Quick nav */}
      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">Contents</p>
        {[
          ['#eligibility',    '1. Eligibility'],
          ['#accounts',       '2. Accounts'],
          ['#events',         '3. Events & Bookings'],
          ['#organizers',     '4. Organizers'],
          ['#content',        '5. User Content'],
          ['#payments',       '6. Payments & Tips'],
          ['#prohibited',     '7. Prohibited Conduct'],
          ['#intellectual',   '8. Intellectual Property'],
          ['#privacy',        '9. Privacy'],
          ['#disclaimers',    '10. Disclaimers'],
          ['#liability',      '11. Limitation of Liability'],
          ['#termination',    '12. Termination'],
          ['#governing',      '13. Governing Law'],
          ['#changes',        '14. Changes to Terms'],
          ['#contact',        '15. Contact'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">

        <Section id="eligibility" title="1. Eligibility">
          <p>
            You must be at least 13 years of age to use Rawaq. By using the platform you represent
            that you meet this requirement. If you are under 18, you represent that your parent or
            legal guardian has reviewed and agreed to these Terms on your behalf.
          </p>
        </Section>

        <Section id="accounts" title="2. Accounts">
          <p>
            You must provide accurate, complete, and current information when registering. You are
            responsible for maintaining the confidentiality of your credentials and for all activity
            that occurs under your account.
          </p>
          <p>
            You may not share your account with others, impersonate any person, or create an account
            if you have previously been banned from the platform. Notify us immediately at
            hello@rawaq.app if you suspect unauthorised access.
          </p>
        </Section>

        <Section id="events" title="3. Events & Bookings">
          <p>
            Rawaq is a discovery and booking platform. We connect attendees with event organisers
            but do not organise events ourselves unless explicitly stated.
          </p>
          <p>
            When you book an event, you enter into an agreement directly with the organiser.
            Rawaq is not responsible for the quality, safety, legality, or cancellation of any
            event listed on the platform.
          </p>
          <p>
            Cancellation and refund policies are set by individual organisers. Check each event
            listing for specific policies before booking.
          </p>
        </Section>

        <Section id="organizers" title="4. Organizers">
          <p>
            Organiser accounts require admin approval before events can be published. By applying
            as an organiser you confirm that you have the legal right to host the event you intend
            to list and that all event details you provide are accurate.
          </p>
          <p>
            Organisers are solely responsible for their events including, without limitation,
            compliance with local laws, venue permits, health &amp; safety, and any financial
            obligations to attendees.
          </p>
          <p>
            Rawaq reserves the right to remove any event that violates these Terms or applicable law.
          </p>
        </Section>

        <Section id="content" title="5. User Content">
          <p>
            You retain ownership of content you post (comments, event descriptions, profile
            information). By posting content on Rawaq you grant us a non-exclusive, royalty-free,
            worldwide licence to display, reproduce, and distribute that content in connection
            with operating the platform.
          </p>
          <p>
            You are solely responsible for your content. You must not post content that is false,
            defamatory, obscene, infringing, harassing, or in violation of any applicable law.
          </p>
          <p>
            We may remove or moderate content at our discretion and without notice.
          </p>
        </Section>

        <Section id="payments" title="6. Payments & Tips">
          <p>
            Rawaq currently operates a <strong>simulated payment environment</strong> for MVP
            purposes. No real financial transactions are processed. All tip and booking amounts
            displayed are illustrative only.
          </p>
          <p>
            When real payment processing is introduced, additional payment terms will apply and
            users will be notified. All displayed prices are inclusive of applicable taxes unless
            otherwise stated.
          </p>
        </Section>

        <Section id="prohibited" title="7. Prohibited Conduct">
          <p>You agree not to:</p>
          <ul className="list-disc ps-5 space-y-1">
            <li>Post false, misleading, or fraudulent event listings</li>
            <li>Harass, threaten, or abuse other users or organisers</li>
            <li>Use the platform for any unlawful purpose</li>
            <li>Attempt to gain unauthorised access to our systems</li>
            <li>Scrape, crawl, or systematically collect data without permission</li>
            <li>Use automated bots to create bookings or accounts</li>
            <li>Violate any local, national, or international law or regulation</li>
          </ul>
        </Section>

        <Section id="intellectual" title="8. Intellectual Property">
          <p>
            The Rawaq name, logo, and all original platform content are the property of Rawaq and
            are protected by applicable intellectual property laws. You may not reproduce, distribute,
            or create derivative works without our express written permission.
          </p>
        </Section>

        <Section id="privacy" title="9. Privacy">
          <p>
            Our collection and use of personal data is governed by our{' '}
            <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>,
            which is incorporated by reference into these Terms. By using Rawaq you consent to the
            practices described therein.
          </p>
        </Section>

        <Section id="disclaimers" title="10. Disclaimers">
          <p>
            The platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
            whether express or implied, including but not limited to merchantability, fitness for a
            particular purpose, or non-infringement.
          </p>
          <p>
            We do not warrant that the platform will be uninterrupted, error-free, or free of
            harmful components. Use of the platform is at your own risk.
          </p>
        </Section>

        <Section id="liability" title="11. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Rawaq shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising from your use of the
            platform, including but not limited to loss of profits, data, or goodwill.
          </p>
          <p>
            In jurisdictions that do not allow the exclusion of certain warranties or limitation
            of liability, our liability is limited to the maximum extent permitted by law.
          </p>
        </Section>

        <Section id="termination" title="12. Termination">
          <p>
            We may suspend or permanently disable your account at our sole discretion, with or
            without notice, for conduct that we believe violates these Terms or is harmful to other
            users, us, or third parties.
          </p>
          <p>
            You may delete your account at any time through your profile settings. Upon termination,
            your right to use the platform ceases immediately.
          </p>
        </Section>

        <Section id="governing" title="13. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of the Kingdom
            of Saudi Arabia. Any disputes shall be subject to the exclusive jurisdiction of the
            competent courts of Riyadh, Saudi Arabia.
          </p>
        </Section>

        <Section id="changes" title="14. Changes to Terms">
          <p>
            We may update these Terms from time to time. We will notify registered users of
            material changes via email or an in-app notification. Your continued use of Rawaq
            after changes take effect constitutes acceptance of the revised Terms.
          </p>
        </Section>

        <Section id="contact" title="15. Contact">
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">Rawaq</p>
            <p>Email: <a href="mailto:legal@rawaq.app" className="text-brand-600 hover:underline">legal@rawaq.app</a></p>
          </div>
        </Section>

      </div>

      <div className="mt-12 pt-6 border-t border-gray-100 text-center text-sm text-gray-400 space-y-2">
        <p>
          <Link href="/about" className="hover:text-gray-600">About Rawaq</Link>
          {' · '}
          <Link href="/events" className="hover:text-gray-600">Browse Events</Link>
        </p>
        <p>© {new Date().getFullYear()} Rawaq. All rights reserved.</p>
      </div>
    </div>
  )
}
