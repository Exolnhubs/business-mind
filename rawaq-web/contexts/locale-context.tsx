'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Locale = 'en' | 'ar'

interface LocaleContextValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  t: (key: string) => string
  toggleLocale: () => void
}

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Nav
    'nav.events': 'Events',
    'nav.chat': 'Chat',
    'nav.login': 'Sign In',
    'nav.register': 'Sign Up',
    'nav.dashboard': 'Dashboard',
    'nav.my_bookings': 'My Bookings',
    'nav.logout': 'Sign Out',
    // Events
    'events.title': 'Discover Events',
    'events.subtitle': 'Find local events that matter to you',
    'events.filter.all_categories': 'All Categories',
    'events.filter.all_cities': 'All Cities',
    'events.filter.free_only': 'Free Only',
    'events.filter.family_friendly': 'Family Friendly',
    'events.filter.gender.mixed': 'Mixed',
    'events.filter.gender.male': 'Men Only',
    'events.filter.gender.female': 'Women Only',
    'events.empty': 'No events found',
    'events.empty_sub': 'Try adjusting your filters',
    'events.join': 'Join Event',
    'events.joined': 'Joined ✓',
    'events.full': 'Fully Booked',
    'events.free': 'Free',
    'events.spots_left': '{n} spots left',
    'events.capacity': '{n} capacity',
    'events.by': 'By',
    // Event detail
    'event.about': 'About this event',
    'event.location': 'Location',
    'event.date_time': 'Date & Time',
    'event.organizer': 'Organizer',
    'event.attendees': 'Attendees',
    'event.tip_organizer': 'Tip Organizer',
    'event.tip_amount': 'Tip amount (SAR)',
    'event.tip_message': 'Leave a message (optional)',
    'event.tip_send': 'Send Tip',
    'event.tip_success': 'Tip sent! 🙏',
    'event.comments': 'Comments',
    // Auth
    'auth.login_title': 'Welcome back',
    'auth.login_sub': 'Sign in to your Rawaq account',
    'auth.register_title': 'Join Rawaq',
    'auth.register_sub': 'Create your account to discover events',
    'auth.email': 'Email address',
    'auth.password': 'Password',
    'auth.display_name': 'Display name',
    'auth.city': 'City',
    'auth.role': 'I am a',
    'auth.role_user': 'Regular user',
    'auth.role_organizer': 'Organizer / Business',
    'auth.login_btn': 'Sign In',
    'auth.register_btn': 'Create Account',
    'auth.no_account': "Don't have an account?",
    'auth.has_account': 'Already have an account?',
    'auth.sign_up': 'Sign up',
    'auth.sign_in': 'Sign in',
    // Organizer
    'organizer.dashboard': 'Organizer Dashboard',
    'organizer.my_events': 'My Events',
    'organizer.create_event': 'Create Event',
    'organizer.edit_event': 'Edit Event',
    'organizer.no_events': 'No events yet',
    'organizer.tips_received': 'Tips Received',
    // Admin
    'admin.dashboard': 'Admin Dashboard',
    'admin.total_users': 'Total Users',
    'admin.total_events': 'Active Events',
    'admin.pending_organizers': 'Pending Approvals',
    'admin.flagged_comments': 'Flagged Comments',
    'admin.approve': 'Approve',
    'admin.reject': 'Reject',
    'admin.ban_user': 'Ban User',
    // Comments
    'comments.placeholder': 'Write a comment...',
    'comments.reply': 'Reply',
    'comments.report': 'Report',
    'comments.delete': 'Delete',
    'comments.submit': 'Post',
    'comments.empty': 'Be the first to comment',
    // Common
    'common.loading': 'Loading...',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.search': 'Search',
    'common.filter': 'Filter',
  },
  ar: {
    // Nav
    'nav.events': 'الفعاليات',
    'nav.chat': 'الدردشة',
    'nav.login': 'تسجيل الدخول',
    'nav.register': 'إنشاء حساب',
    'nav.dashboard': 'لوحة التحكم',
    'nav.my_bookings': 'حجوزاتي',
    'nav.logout': 'تسجيل الخروج',
    // Events
    'events.title': 'اكتشف الفعاليات',
    'events.subtitle': 'ابحث عن الفعاليات المحلية التي تهمك',
    'events.filter.all_categories': 'كل التصنيفات',
    'events.filter.all_cities': 'كل المدن',
    'events.filter.free_only': 'المجانية فقط',
    'events.filter.family_friendly': 'مناسبة للعائلة',
    'events.filter.gender.mixed': 'مختلط',
    'events.filter.gender.male': 'للرجال فقط',
    'events.filter.gender.female': 'للنساء فقط',
    'events.empty': 'لا توجد فعاليات',
    'events.empty_sub': 'حاول تعديل الفلاتر',
    'events.join': 'انضم للفعالية',
    'events.joined': 'تم الانضمام ✓',
    'events.full': 'اكتملت الأماكن',
    'events.free': 'مجاني',
    'events.spots_left': '{n} مقعد متبقي',
    'events.capacity': 'السعة {n}',
    'events.by': 'بواسطة',
    // Event detail
    'event.about': 'عن الفعالية',
    'event.location': 'الموقع',
    'event.date_time': 'التاريخ والوقت',
    'event.organizer': 'المنظم',
    'event.attendees': 'الحضور',
    'event.tip_organizer': 'دعم المنظم',
    'event.tip_amount': 'مبلغ الدعم (ريال)',
    'event.tip_message': 'أضف رسالة (اختياري)',
    'event.tip_send': 'إرسال الدعم',
    'event.tip_success': 'تم الإرسال! 🙏',
    'event.comments': 'التعليقات',
    // Auth
    'auth.login_title': 'مرحباً بعودتك',
    'auth.login_sub': 'سجّل الدخول إلى حساب رواق',
    'auth.register_title': 'انضم إلى رواق',
    'auth.register_sub': 'أنشئ حسابك لاكتشاف الفعاليات',
    'auth.email': 'البريد الإلكتروني',
    'auth.password': 'كلمة المرور',
    'auth.display_name': 'اسم العرض',
    'auth.city': 'المدينة',
    'auth.role': 'أنا',
    'auth.role_user': 'مستخدم عادي',
    'auth.role_organizer': 'منظم / شركة',
    'auth.login_btn': 'تسجيل الدخول',
    'auth.register_btn': 'إنشاء الحساب',
    'auth.no_account': 'ليس لديك حساب؟',
    'auth.has_account': 'لديك حساب بالفعل؟',
    'auth.sign_up': 'سجّل',
    'auth.sign_in': 'ادخل',
    // Organizer
    'organizer.dashboard': 'لوحة تحكم المنظم',
    'organizer.my_events': 'فعالياتي',
    'organizer.create_event': 'إنشاء فعالية',
    'organizer.edit_event': 'تعديل الفعالية',
    'organizer.no_events': 'لا توجد فعاليات بعد',
    'organizer.tips_received': 'الدعم المستلم',
    // Admin
    'admin.dashboard': 'لوحة الإدارة',
    'admin.total_users': 'إجمالي المستخدمين',
    'admin.total_events': 'الفعاليات النشطة',
    'admin.pending_organizers': 'طلبات معلقة',
    'admin.flagged_comments': 'تعليقات مُبلَّغ عنها',
    'admin.approve': 'موافقة',
    'admin.reject': 'رفض',
    'admin.ban_user': 'حظر المستخدم',
    // Comments
    'comments.placeholder': 'اكتب تعليقاً...',
    'comments.reply': 'رد',
    'comments.report': 'بلّغ',
    'comments.delete': 'حذف',
    'comments.submit': 'نشر',
    'comments.empty': 'كن أول من يعلق',
    // Common
    'common.loading': 'جارٍ التحميل...',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.confirm': 'تأكيد',
    'common.back': 'رجوع',
    'common.search': 'بحث',
    'common.filter': 'تصفية',
  },
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    const stored = localStorage.getItem('rawaq_locale') as Locale | null
    if (stored === 'ar' || stored === 'en') setLocale(stored)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('rawaq_locale', locale)
  }, [locale])

  const toggleLocale = () => setLocale((l) => (l === 'en' ? 'ar' : 'en'))

  const t = (key: string) => translations[locale][key] ?? key

  return (
    <LocaleContext.Provider value={{ locale, dir: locale === 'ar' ? 'rtl' : 'ltr', t, toggleLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be inside LocaleProvider')
  return ctx
}
