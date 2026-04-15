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

function EnglishTerms() {
  return (
    <>
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-400">Last updated: {LAST_UPDATED}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Welcome to Rawaq. By accessing or using our platform, you agree to be bound by these Terms of Service
          (&quot;Terms&quot;). Please read them carefully. If you do not agree, do not use Rawaq.
        </p>
      </div>

      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">Contents</p>
        {[
          ['#eligibility', '1. Eligibility'], ['#accounts', '2. Accounts'], ['#events', '3. Events & Bookings'],
          ['#organizers', '4. Organizers'], ['#content', '5. User Content'], ['#payments', '6. Payments & Tips'],
          ['#conduct', '7. Prohibited Conduct'], ['#ip', '8. Intellectual Property'], ['#privacy', '9. Privacy'],
          ['#disclaimers', '10. Disclaimers'], ['#liability', '11. Limitation of Liability'],
          ['#termination', '12. Termination'], ['#governing', '13. Governing Law'],
          ['#changes', '14. Changes to These Terms'], ['#contact', '15. Contact'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">
        <Section id="eligibility" title="1. Eligibility">
          <p>Rawaq is available to individuals aged 13 and over. Users aged 13-17 must have parental consent. By creating an account, you confirm you meet the eligibility criteria and that the information you provide is accurate.</p>
        </Section>
        <Section id="accounts" title="2. Accounts">
          <p>You are responsible for keeping your account credentials confidential. Notify us immediately at <a href="mailto:hello@rawaq.app" className="text-brand-600 hover:underline">hello@rawaq.app</a> of any unauthorized use. We may suspend or terminate accounts that violate these Terms.</p>
        </Section>
        <Section id="events" title="3. Events & Bookings">
          <p>Events are published directly by organizers. Rawaq reviews listings for compliance with our content standards but does not verify the accuracy of event descriptions. Bookings are binding subject to the organizer&apos;s cancellation policy.</p>
          <p>We reserve the right to remove any event that violates these Terms or applicable law.</p>
        </Section>
        <Section id="organizers" title="4. Organizers">
          <p>Organizer accounts require admin approval before events can be published. By applying as an organizer, you confirm that you have the authority to host the events you publish and that all event information is accurate.</p>
          <p>Organizers are responsible for fulfilling their events as described. If an organizer cancels an event, they must notify attendees promptly through the platform.</p>
        </Section>
        <Section id="content" title="5. User Content">
          <p>You retain ownership of content you post (comments, event descriptions, profile information). By posting, you grant Rawaq a non-exclusive, royalty-free license to display and distribute that content on the platform.</p>
          <p>You must not post content that is illegal, defamatory, hateful, or that infringes third-party rights. We may remove content that violates these Terms.</p>
        </Section>
        <Section id="payments" title="6. Payments & Tips">
          <p>Paid event bookings are processed through our payment partners. Tips sent to organizers are voluntary and non-refundable. Rawaq may charge a service fee on transactions, which will be disclosed at checkout.</p>
        </Section>
        <Section id="conduct" title="7. Prohibited Conduct">
          <p>You agree not to: (a) impersonate others; (b) spam or send unsolicited messages; (c) scrape or harvest platform data; (d) attempt to gain unauthorized access to accounts or systems; (e) post misleading event information; or (f) engage in any conduct that disrupts or harms the platform or other users.</p>
        </Section>
        <Section id="ip" title="8. Intellectual Property">
          <p>The Rawaq name, logo, and platform design are protected by copyright and trademark law. You may not use them without our prior written consent. You are responsible for ensuring any content you post does not infringe third-party intellectual property rights.</p>
        </Section>
        <Section id="privacy" title="9. Privacy">
          <p>Your use of Rawaq is governed by our <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>, which is incorporated into these Terms by reference.</p>
        </Section>
        <Section id="disclaimers" title="10. Disclaimers">
          <p>Rawaq is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that the platform will be uninterrupted, error-free, or that events will occur as described. Attendance at events is at your own risk.</p>
        </Section>
        <Section id="liability" title="11. Limitation of Liability">
          <p>To the maximum extent permitted by applicable law, Rawaq and its affiliates will not be liable for indirect, incidental, special, or consequential damages arising from your use of the platform. Our total aggregate liability shall not exceed the amount you paid to Rawaq in the 12 months preceding the claim.</p>
        </Section>
        <Section id="termination" title="12. Termination">
          <p>We may suspend or terminate your access at any time for violation of these Terms. You may delete your account at any time through your profile settings. Upon termination, your right to use the platform ceases immediately.</p>
        </Section>
        <Section id="governing" title="13. Governing Law">
          <p>These Terms are governed by the laws of the Kingdom of Saudi Arabia. Any disputes shall be subject to the exclusive jurisdiction of the courts of the Kingdom of Saudi Arabia.</p>
        </Section>
        <Section id="changes" title="14. Changes to These Terms">
          <p>We may update these Terms from time to time. Material changes will be notified via email or in-app notice. Continued use of Rawaq after changes take effect constitutes acceptance.</p>
        </Section>
        <Section id="contact" title="15. Contact">
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            <p className="font-semibold text-gray-800">Rawaq</p>
            <p>Email: <a href="mailto:hello@rawaq.app" className="text-brand-600 hover:underline">hello@rawaq.app</a></p>
          </div>
        </Section>
      </div>
    </>
  )
}

function ArabicTerms() {
  return (
    <>
      <div className="mb-10 space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">شروط الخدمة</h1>
        <p className="text-sm text-gray-400">آخر تحديث: {LAST_UPDATED_AR}</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          مرحباً بك في رواق. باستخدامك للمنصة أو الوصول إليها، فإنك توافق على الالتزام بشروط الخدمة هذه. يُرجى قراءتها بعناية. إن كنت لا توافق عليها، يُرجى عدم استخدام رواق.
        </p>
      </div>

      <nav className="bg-gray-50 rounded-xl p-5 mb-10 text-sm space-y-1">
        <p className="font-semibold text-gray-700 mb-3">المحتويات</p>
        {[
          ['#eligibility', '١. الأهلية'], ['#accounts', '٢. الحسابات'], ['#events', '٣. الفعاليات والحجوزات'],
          ['#organizers', '٤. المنظمون'], ['#content', '٥. محتوى المستخدم'], ['#payments', '٦. المدفوعات والدعم المالي'],
          ['#conduct', '٧. السلوك المحظور'], ['#ip', '٨. الملكية الفكرية'], ['#privacy', '٩. الخصوصية'],
          ['#disclaimers', '١٠. إخلاء المسؤولية'], ['#liability', '١١. تحديد المسؤولية'],
          ['#termination', '١٢. إنهاء الخدمة'], ['#governing', '١٣. القانون الحاكم'],
          ['#changes', '١٤. التغييرات على هذه الشروط'], ['#contact', '١٥. التواصل'],
        ].map(([href, label]) => (
          <a key={href} href={href} className="block text-brand-600 hover:underline">{label}</a>
        ))}
      </nav>

      <div className="space-y-8">
        <Section id="eligibility" title="١. الأهلية">
          <p>يُتاح رواق للأشخاص الذين تجاوزوا سن 13 عامًا. يجب على من تتراوح أعمارهم بين 13 و17 عامًا الحصول على موافقة ولي الأمر. بإنشاء حساب، تؤكد استيفاءك لمعايير الأهلية وأن المعلومات التي تقدمها دقيقة وصحيحة.</p>
        </Section>
        <Section id="accounts" title="٢. الحسابات">
          <p>أنت مسؤول عن الحفاظ على سرية بيانات حسابك. أبلغنا فورًا على <a href="mailto:hello@rawaq.app" className="text-brand-600 hover:underline">hello@rawaq.app</a> عن أي استخدام غير مصرح به. نحتفظ بالحق في تعليق أو إلغاء الحسابات التي تنتهك هذه الشروط.</p>
        </Section>
        <Section id="events" title="٣. الفعاليات والحجوزات">
          <p>تُنشر الفعاليات مباشرةً من قِبل المنظمين. يراجع رواق القوائم للتحقق من الامتثال لمعايير المحتوى، لكنه لا يتحقق من دقة أوصاف الفعاليات. تعد الحجوزات ملزمة وفقًا لسياسة الإلغاء الخاصة بالمنظم.</p>
          <p>نحتفظ بالحق في إزالة أي فعالية تنتهك هذه الشروط أو القانون المعمول به.</p>
        </Section>
        <Section id="organizers" title="٤. المنظمون">
          <p>تتطلب حسابات المنظمين موافقة المشرف قبل نشر الفعاليات. بالتقدم كمنظم، تؤكد امتلاكك الصلاحية لاستضافة الفعاليات التي تنشرها وأن جميع المعلومات دقيقة.</p>
          <p>المنظمون مسؤولون عن تنفيذ فعالياتهم كما هو موصوف. في حال إلغاء المنظم لفعالية، يجب إخطار الحضور فورًا عبر المنصة.</p>
        </Section>
        <Section id="content" title="٥. محتوى المستخدم">
          <p>تحتفظ بملكية المحتوى الذي تنشره (التعليقات، أوصاف الفعاليات، معلومات الملف الشخصي). بالنشر، تمنح رواق ترخيصًا غير حصري وبدون رسوم لعرض ذلك المحتوى وتوزيعه على المنصة.</p>
          <p>يُحظر نشر محتوى غير قانوني أو تشهيري أو يحض على الكراهية أو ينتهك حقوق أطراف ثالثة. قد نزيل المحتوى الذي ينتهك هذه الشروط.</p>
        </Section>
        <Section id="payments" title="٦. المدفوعات والدعم المالي">
          <p>تُعالج حجوزات الفعاليات المدفوعة عبر شركاء الدفع لدينا. الدعم المالي المرسل للمنظمين طوعي وغير قابل للاسترداد. قد يفرض رواق رسوم خدمة على المعاملات يُكشف عنها عند الدفع.</p>
        </Section>
        <Section id="conduct" title="٧. السلوك المحظور">
          <p>توافق على عدم: (أ) انتحال هوية الآخرين؛ (ب) إرسال رسائل غير مرغوب فيها؛ (ج) جمع بيانات المنصة آليًا؛ (د) محاولة الوصول غير المصرح به للحسابات أو الأنظمة؛ (هـ) نشر معلومات فعاليات مضللة؛ أو (و) أي سلوك يُخل بالمنصة أو يُضر بالمستخدمين الآخرين.</p>
        </Section>
        <Section id="ip" title="٨. الملكية الفكرية">
          <p>اسم رواق وشعاره وتصميم المنصة محمية بموجب قوانين حقوق النشر والعلامات التجارية. لا يجوز استخدامها دون موافقتنا الخطية المسبقة. أنت مسؤول عن التأكد من أن المحتوى الذي تنشره لا ينتهك حقوق الملكية الفكرية لأطراف ثالثة.</p>
        </Section>
        <Section id="privacy" title="٩. الخصوصية">
          <p>يخضع استخدامك لرواق لـ<Link href="/privacy" className="text-brand-600 hover:underline">سياسة الخصوصية</Link> الخاصة بنا، المدمجة في هذه الشروط بالإشارة.</p>
        </Section>
        <Section id="disclaimers" title="١٠. إخلاء المسؤولية">
          <p>يُقدَّم رواق &quot;كما هو&quot; دون ضمانات من أي نوع. لا نضمن أن المنصة ستكون بلا انقطاع أو أخطاء، أو أن الفعاليات ستجري كما هو موصوف. الحضور إلى الفعاليات على مسؤوليتك الشخصية.</p>
        </Section>
        <Section id="liability" title="١١. تحديد المسؤولية">
          <p>إلى أقصى حد يسمح به القانون المعمول به، لن يكون رواق وشركاته التابعة مسؤولين عن الأضرار غير المباشرة أو العرضية أو الخاصة أو التبعية الناشئة عن استخدامك للمنصة. لن تتجاوز مسؤوليتنا الإجمالية المبلغ الذي دفعته لرواق في 12 شهرًا سابقة للمطالبة.</p>
        </Section>
        <Section id="termination" title="١٢. إنهاء الخدمة">
          <p>يجوز لنا تعليق وصولك أو إنهاؤه في أي وقت لانتهاك هذه الشروط. يمكنك حذف حسابك في أي وقت من خلال إعدادات ملفك الشخصي. عند إنهاء الخدمة، تنتهي حقوقك في استخدام المنصة فورًا.</p>
        </Section>
        <Section id="governing" title="١٣. القانون الحاكم">
          <p>تخضع هذه الشروط لقوانين المملكة العربية السعودية. تخضع أي نزاعات للاختصاص القضائي الحصري لمحاكم المملكة العربية السعودية.</p>
        </Section>
        <Section id="changes" title="١٤. التغييرات على هذه الشروط">
          <p>قد نقوم بتحديث هذه الشروط من وقت لآخر. سيتم إخطارك بالتغييرات الجوهرية عبر البريد الإلكتروني أو إشعار داخل التطبيق. استمرار استخدام رواق بعد سريان التغييرات يُعد قبولًا لها.</p>
        </Section>
        <Section id="contact" title="١٥. التواصل">
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            <p className="font-semibold text-gray-800">رواق</p>
            <p>البريد الإلكتروني: <a href="mailto:hello@rawaq.app" className="text-brand-600 hover:underline">hello@rawaq.app</a></p>
          </div>
        </Section>
      </div>
    </>
  )
}

export default function TermsPage() {
  const { locale } = useLocale()
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      {locale === 'ar' ? <ArabicTerms /> : <EnglishTerms />}
      <div className="mt-12 pt-6 border-t border-gray-100 text-center text-sm text-gray-400 space-y-2">
        <p>
          <Link href="/privacy" className="hover:text-gray-600">{locale === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link>
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
