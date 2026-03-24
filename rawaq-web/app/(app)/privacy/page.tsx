import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Rawaq Privacy Policy — how we collect, use, and protect your personal data.',
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

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">

      {/* Header */}
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Rawaq (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy
          explains how we collect, use, disclose, and safeguard your information when you use our platform.
          Please read it carefully. By using Rawaq you consent to the practices described here.
        </p>
      </div>

      {/* Quick nav */}
      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">Contents</p>
        {[
          ['#information',  '1. Information We Collect'],
          ['#use',          '2. How We Use Your Information'],
          ['#sharing',      '3. Sharing Your Information'],
          ['#storage',      '4. Data Storage & Security'],
          ['#retention',    '5. Data Retention'],
          ['#rights',       '6. Your Rights'],
          ['#cookies',      '7. Cookies & Analytics'],
          ['#children',     '8. Children\'s Privacy'],
          ['#international','9. International Transfers'],
          ['#changes',      '10. Changes to This Policy'],
          ['#contact',      '11. Contact Us'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">

        <Section id="information" title="1. Information We Collect">
          <p><strong>Account information:</strong> When you register, we collect your email address, display name, city, and chosen role (attendee or organiser).</p>
          <p><strong>Profile data:</strong> Any additional information you voluntarily add to your profile, such as a profile photo or bio.</p>
          <p><strong>Event & booking data:</strong> Events you create or book, comments you post, and tips you send.</p>
          <p><strong>Location data:</strong> If you use the &quot;Near Me&quot; feature, we request your device location to find nearby events. This data is used only for that request and is not stored persistently.</p>
          <p><strong>Usage data:</strong> Log data such as IP address, browser type, pages visited, and timestamps — collected automatically when you use the platform.</p>
          <p><strong>Communications:</strong> If you contact us directly, we keep records of that correspondence.</p>
        </Section>

        <Section id="use" title="2. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc ps-5 space-y-1">
            <li>Provide, maintain, and improve the Rawaq platform</li>
            <li>Create and manage your account</li>
            <li>Process event bookings and display your booking history</li>
            <li>Send transactional notifications (booking confirmations, event reminders)</li>
            <li>Send push notifications for activity relevant to you (new bookings, comments, tips)</li>
            <li>Enable event discovery features including location-based search</li>
            <li>Enforce our Terms of Service and prevent fraud or abuse</li>
            <li>Respond to your support requests</li>
            <li>Analyse aggregate usage trends to improve the product</li>
          </ul>
          <p>We do not sell your personal data to third parties.</p>
        </Section>

        <Section id="sharing" title="3. Sharing Your Information">
          <p>We may share your information with:</p>
          <ul className="list-disc ps-5 space-y-1">
            <li><strong>Event organisers:</strong> When you book an event, the organiser sees your display name to manage attendance.</li>
            <li><strong>Service providers:</strong> We use Supabase (database & auth) and other infrastructure providers bound by confidentiality obligations.</li>
            <li><strong>Legal requirements:</strong> If required by law, court order, or to protect the rights and safety of Rawaq or others.</li>
          </ul>
          <p>Your public profile information (display name, comments) is visible to other users on the platform.</p>
        </Section>

        <Section id="storage" title="4. Data Storage & Security">
          <p>
            Your data is stored on servers provided by Supabase, which may be located outside your country
            of residence. We implement industry-standard security measures including encryption in transit
            (TLS) and at rest, access controls, and regular security reviews.
          </p>
          <p>
            No method of transmission over the internet or electronic storage is 100% secure. While we
            strive to protect your data, we cannot guarantee absolute security.
          </p>
        </Section>

        <Section id="retention" title="5. Data Retention">
          <p>
            We retain your personal data for as long as your account is active or as needed to provide
            services. You may delete your account at any time through your profile settings, which will
            remove your personal information from our active databases within 30 days, subject to legal
            obligations to retain certain records.
          </p>
          <p>
            Anonymised or aggregated data derived from your usage may be retained indefinitely for
            analytics purposes.
          </p>
        </Section>

        <Section id="rights" title="6. Your Rights">
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc ps-5 space-y-1">
            <li><strong>Access</strong> the personal data we hold about you</li>
            <li><strong>Rectify</strong> inaccurate or incomplete data</li>
            <li><strong>Erase</strong> your data (&quot;right to be forgotten&quot;)</li>
            <li><strong>Restrict</strong> or object to our processing of your data</li>
            <li><strong>Data portability</strong> — receive a copy of your data in a machine-readable format</li>
            <li><strong>Withdraw consent</strong> at any time where processing is based on consent</li>
          </ul>
          <p>
            To exercise any of these rights, contact us at{' '}
            <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a>.
            We will respond within 30 days.
          </p>
        </Section>

        <Section id="cookies" title="7. Cookies & Analytics">
          <p>
            Rawaq uses essential cookies to maintain your session and preferences. We may use
            privacy-respecting analytics tools to understand aggregate usage patterns. These tools
            do not track you across third-party sites.
          </p>
          <p>
            You can disable cookies in your browser settings, but this may affect platform functionality.
          </p>
        </Section>

        <Section id="children" title="8. Children's Privacy">
          <p>
            Rawaq is not directed to children under 13. We do not knowingly collect personal information
            from children under 13. If you believe a child under 13 has provided us with personal data,
            please contact us and we will delete it promptly.
          </p>
          <p>
            Users aged 13–17 must have parental consent to use the platform, as described in our
            Terms of Service.
          </p>
        </Section>

        <Section id="international" title="9. International Transfers">
          <p>
            Rawaq operates across the Arab world and your data may be transferred to and processed in
            countries other than your country of residence. By using Rawaq you acknowledge this
            international transfer of data.
          </p>
          <p>
            We take steps to ensure that transfers comply with applicable data protection laws and that
            appropriate safeguards are in place.
          </p>
        </Section>

        <Section id="changes" title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify registered users of
            material changes via email or in-app notification. The &quot;Last updated&quot; date at the top of
            this page indicates when the policy was last revised. Your continued use of Rawaq after
            changes take effect constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section id="contact" title="11. Contact Us">
          <p>
            If you have questions, concerns, or requests relating to this Privacy Policy or our data
            practices, please contact our privacy team:
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">Rawaq — Privacy Team</p>
            <p>Email: <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a></p>
          </div>
        </Section>

      </div>

      <div className="mt-12 pt-6 border-t border-gray-100 text-center text-sm text-gray-400 space-y-2">
        <p>
          <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
          {' · '}
          <Link href="/about" className="hover:text-gray-600">About Rawaq</Link>
          {' · '}
          <Link href="/events" className="hover:text-gray-600">Browse Events</Link>
        </p>
        <p>© {new Date().getFullYear()} Rawaq. All rights reserved.</p>
      </div>
    </div>
  )
}
