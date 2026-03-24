'use client'

import Link from 'next/link'
import { useLocale } from '@/contexts/locale-context'

const LAST_UPDATED = 'March 2026'
const LAST_UPDATED_AR = 'مارس 2026'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl font-bold text-gray-900 pt-4 border-t border-gray-100">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-3">{children}</div>
    </section>
  )
}

function EnglishPrivacy() {
  return (
    <>
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Rawaq is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose,
          and safeguard your information when you use our platform. By using Rawaq you consent to the practices described here.
        </p>
      </div>

      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">Contents</p>
        {[
          ['#information','1. Information We Collect'],['#use','2. How We Use Your Information'],
          ['#sharing','3. Sharing Your Information'],['#storage','4. Data Storage & Security'],
          ['#retention','5. Data Retention'],['#rights','6. Your Rights'],
          ['#cookies','7. Cookies & Analytics'],['#children','8. Children\'s Privacy'],
          ['#international','9. International Transfers'],['#changes','10. Changes to This Policy'],
          ['#contact','11. Contact Us'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">
        <Section id="information" title="1. Information We Collect">
          <p><strong>Account information:</strong> email address, display name, city, and role (attendee or organiser).</p>
          <p><strong>Profile data:</strong> optional profile photo, bio, and gender.</p>
          <p><strong>Event & booking data:</strong> events you create or book, comments, and tips.</p>
          <p><strong>Location data:</strong> used only for &quot;Near Me&quot; searches; not stored persistently.</p>
          <p><strong>Usage data:</strong> IP address, browser type, pages visited, and timestamps — collected automatically.</p>
          <p><strong>Communications:</strong> records of any correspondence with our team.</p>
        </Section>
        <Section id="use" title="2. How We Use Your Information">
          <p>We use your information to: provide and improve the platform; create and manage your account; process bookings; send transactional and push notifications; enable location-based search; enforce our Terms; and respond to support requests. We do not sell your personal data.</p>
        </Section>
        <Section id="sharing" title="3. Sharing Your Information">
          <p><strong>Organizers:</strong> see your display name when you book their event.</p>
          <p><strong>Service providers:</strong> Supabase (database & auth) and infrastructure providers, bound by confidentiality obligations.</p>
          <p><strong>Legal requirements:</strong> if required by law or to protect the safety of Rawaq or others.</p>
          <p>Your public profile (display name, comments) is visible to other users.</p>
        </Section>
        <Section id="storage" title="4. Data Storage & Security">
          <p>Data is stored on Supabase servers and may be located outside your country. We implement TLS encryption in transit, encryption at rest, access controls, and regular security reviews. No method of transmission is 100% secure.</p>
        </Section>
        <Section id="retention" title="5. Data Retention">
          <p>We retain your data while your account is active. You may delete your account at any time; personal data is removed from active databases within 30 days, subject to legal obligations. Anonymised data may be retained indefinitely.</p>
        </Section>
        <Section id="rights" title="6. Your Rights">
          <p>Depending on your jurisdiction, you may have the right to: access, rectify, erase, restrict, or port your data; object to processing; and withdraw consent. Contact <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a> — we respond within 30 days.</p>
        </Section>
        <Section id="cookies" title="7. Cookies & Analytics">
          <p>We use essential session cookies and privacy-respecting analytics tools to understand aggregate usage. Disabling cookies may affect platform functionality.</p>
        </Section>
        <Section id="children" title="8. Children&apos;s Privacy">
          <p>Rawaq is not directed at children under 13. If you believe a child under 13 has provided personal data, contact us and we will delete it promptly.</p>
        </Section>
        <Section id="international" title="9. International Transfers">
          <p>By using Rawaq you acknowledge that your data may be transferred internationally. We ensure appropriate safeguards are in place.</p>
        </Section>
        <Section id="changes" title="10. Changes to This Policy">
          <p>We may update this policy and will notify registered users of material changes by email or in-app notification. Continued use after changes constitutes acceptance.</p>
        </Section>
        <Section id="contact" title="11. Contact Us">
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">Rawaq — Privacy Team</p>
            <p>Email: <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a></p>
          </div>
        </Section>
      </div>
    </>
  )
}

function ArabicPrivacy() {
  return (
    <>
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">سياسة الخصوصية</h1>
        <p className="text-sm text-gray-400">آخر تحديث: {LAST_UPDATED_AR}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          يلتزم رواق بحماية خصوصيتك. توضح سياسة الخصوصية هذه كيفية جمع معلوماتك واستخدامها والإفصاح عنها وحمايتها عند استخدام منصتنا. باستخدام رواق، توافق على الممارسات الموضحة هنا.
        </p>
      </div>

      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">المحتويات</p>
        {[
          ['#information','١. المعلومات التي نجمعها'],['#use','٢. كيفية استخدام معلوماتك'],
          ['#sharing','٣. مشاركة معلوماتك'],['#storage','٤. تخزين البيانات وأمانها'],
          ['#retention','٥. الاحتفاظ بالبيانات'],['#rights','٦. حقوقك'],
          ['#cookies','٧. ملفات تعريف الارتباط والتحليلات'],['#children','٨. خصوصية الأطفال'],
          ['#international','٩. النقل الدولي'],['#changes','١٠. التغييرات على هذه السياسة'],
          ['#contact','١١. تواصل معنا'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">
        <Section id="information" title="١. المعلومات التي نجمعها">
          <p><strong>معلومات الحساب:</strong> البريد الإلكتروني واسم العرض والمدينة والدور (حضور أو منظم).</p>
          <p><strong>بيانات الملف الشخصي:</strong> صورة الملف الشخصي الاختيارية ونبذة عنك والجنس.</p>
          <p><strong>بيانات الفعاليات والحجوزات:</strong> الفعاليات التي تنشئها أو تحجزها والتعليقات والدعم المالي.</p>
          <p><strong>بيانات الموقع:</strong> تُستخدم فقط لميزة &quot;قريب مني&quot;؛ لا تُخزَّن بشكل دائم.</p>
          <p><strong>بيانات الاستخدام:</strong> عنوان IP ونوع المتصفح والصفحات المزارة والتوقيتات — تُجمع تلقائيًا.</p>
          <p><strong>المراسلات:</strong> سجلات أي مراسلات مع فريقنا.</p>
        </Section>
        <Section id="use" title="٢. كيفية استخدام معلوماتك">
          <p>نستخدم معلوماتك لـ: تقديم المنصة وتحسينها؛ إنشاء حسابك وإدارته؛ معالجة الحجوزات؛ إرسال الإشعارات المعاملاتية والدفعية؛ تمكين البحث الجغرافي؛ تطبيق شروطنا؛ والرد على طلبات الدعم. نحن لا نبيع بياناتك الشخصية.</p>
        </Section>
        <Section id="sharing" title="٣. مشاركة معلوماتك">
          <p><strong>المنظمون:</strong> يرون اسم العرض عند حجزك لفعالياتهم.</p>
          <p><strong>مزودو الخدمة:</strong> Supabase (قاعدة البيانات والمصادقة) ومزودو البنية التحتية، الملتزمون بالسرية.</p>
          <p><strong>المتطلبات القانونية:</strong> عند الاقتضاء القانوني أو لحماية سلامة رواق أو الآخرين.</p>
          <p>ملفك الشخصي العام (اسم العرض، التعليقات) مرئي للمستخدمين الآخرين.</p>
        </Section>
        <Section id="storage" title="٤. تخزين البيانات وأمانها">
          <p>تُخزَّن البيانات على خوادم Supabase وقد تكون خارج بلدك. نطبق تشفير TLS أثناء النقل والتشفير في حالة الثبات وضوابط الوصول ومراجعات أمنية دورية. لا توجد طريقة نقل آمنة 100%.</p>
        </Section>
        <Section id="retention" title="٥. الاحتفاظ بالبيانات">
          <p>نحتفظ ببياناتك طالما حسابك نشط. يمكنك حذف حسابك في أي وقت؛ تُزال البيانات الشخصية من قواعد البيانات النشطة خلال 30 يومًا، مع مراعاة الالتزامات القانونية. قد تُحتفظ بالبيانات المجهولة إلى أجل غير مسمى.</p>
        </Section>
        <Section id="rights" title="٦. حقوقك">
          <p>قد يحق لك الوصول إلى بياناتك أو تصحيحها أو حذفها أو تقييد معالجتها أو نقلها والاعتراض على معالجتها وسحب موافقتك. تواصل عبر <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a> — نرد خلال 30 يومًا.</p>
        </Section>
        <Section id="cookies" title="٧. ملفات تعريف الارتباط والتحليلات">
          <p>نستخدم ملفات تعريف ارتباط الجلسة الأساسية وأدوات تحليل مراعية للخصوصية لفهم أنماط الاستخدام. قد يؤثر تعطيل ملفات تعريف الارتباط على وظائف المنصة.</p>
        </Section>
        <Section id="children" title="٨. خصوصية الأطفال">
          <p>لا يستهدف رواق الأطفال دون سن 13. إذا اعتقدت أن طفلًا دون 13 عامًا قدّم بيانات شخصية، تواصل معنا وسنحذفها فورًا.</p>
        </Section>
        <Section id="international" title="٩. النقل الدولي">
          <p>باستخدام رواق، تقر بأن بياناتك قد تُنقل دوليًا. نضمن وجود ضمانات مناسبة.</p>
        </Section>
        <Section id="changes" title="١٠. التغييرات على هذه السياسة">
          <p>قد نحدّث هذه السياسة وسنُخطر المستخدمين المسجلين بالتغييرات الجوهرية عبر البريد الإلكتروني أو إشعار داخل التطبيق. استمرار الاستخدام بعد التغييرات يُعد قبولًا لها.</p>
        </Section>
        <Section id="contact" title="١١. تواصل معنا">
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-gray-800">رواق — فريق الخصوصية</p>
            <p>البريد الإلكتروني: <a href="mailto:privacy@rawaq.app" className="text-brand-600 hover:underline">privacy@rawaq.app</a></p>
          </div>
        </Section>
      </div>
    </>
  )
}

export default function PrivacyPage() {
  const { locale } = useLocale()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      {locale === 'ar' ? <ArabicPrivacy /> : <EnglishPrivacy />}
      <div className="mt-12 pt-6 border-t border-gray-100 text-center text-sm text-gray-400 space-y-2">
        <p>
          <Link href="/terms" className="hover:text-gray-600">{locale === 'ar' ? 'شروط الخدمة' : 'Terms of Service'}</Link>
          {' · '}
          <Link href="/about" className="hover:text-gray-600">{locale === 'ar' ? 'عن رواق' : 'About Rawaq'}</Link>
          {' · '}
          <Link href="/events" className="hover:text-gray-600">{locale === 'ar' ? 'الفعاليات' : 'Browse Events'}</Link>
        </p>
        <p>© {new Date().getFullYear()} Rawaq. {locale === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</p>
      </div>
    </div>
  )
}
