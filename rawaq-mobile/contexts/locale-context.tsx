import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { I18nManager } from 'react-native'

type Locale = 'en' | 'ar'

interface LocaleContextValue {
  locale: Locale
  isRTL: boolean
  t: (key: string) => string
  toggleLocale: () => void
}

const translations: Record<Locale, Record<string, string>> = {
  en: {
    'tab.events':    'Events',
    'tab.bookings':  'Bookings',
    'tab.chat':      'Chat',
    'tab.profile':   'Profile',
    'events.title':  'Discover Events',
    'events.search': 'Search events…',
    'events.empty':  'No events found',
    'events.free':   'Free',
    'events.full':   'Full',
    'events.join':   'Join',
    'events.joined': 'Cancel',
    'events.filter': 'Filter',
    'event.about':   'About',
    'event.location':'Location',
    'event.when':    'When',
    'event.organizer':'Organizer',
    'event.book':    'Join Event — Free',
    'event.book_paid':'Book — SAR {price}',
    'event.booked':  'Cancel Booking',
    'event.tip':     'Tip Organizer',
    'event.comments':'Comments',
    'comments.placeholder': 'Write a comment…',
    'comments.post':   'Post',
    'comments.reply':  'Reply',
    'comments.delete': 'Delete',
    'comments.empty':  'No comments yet',
    'chat.title':      'Global Chat',
    'chat.placeholder':'Message everyone…',
    'chat.send':       'Send',
    'auth.login':      'Sign In',
    'auth.register':   'Sign Up',
    'auth.email':      'Email',
    'auth.password':   'Password',
    'auth.name':       'Display Name',
    'auth.city':       'City',
    'auth.role_user':  'Regular User',
    'auth.role_org':   'Organizer',
    'auth.no_account': "Don't have an account?",
    'auth.has_account':'Already have an account?',
    'bookings.title':  'My Bookings',
    'bookings.empty':  'No bookings yet',
    'profile.title':   'Profile',
    'profile.logout':  'Sign Out',
    'common.loading':  'Loading…',
    'common.error':    'Something went wrong',
    'common.retry':    'Try again',
    'common.save':     'Save',
    'common.cancel':   'Cancel',
    'common.back':     'Back',
  },
  ar: {
    'tab.events':    'الفعاليات',
    'tab.bookings':  'حجوزاتي',
    'tab.chat':      'الدردشة',
    'tab.profile':   'الملف الشخصي',
    'events.title':  'اكتشف الفعاليات',
    'events.search': 'ابحث عن فعاليات…',
    'events.empty':  'لا توجد فعاليات',
    'events.free':   'مجاني',
    'events.full':   'اكتمل',
    'events.join':   'انضم',
    'events.joined': 'إلغاء',
    'events.filter': 'تصفية',
    'event.about':   'عن الفعالية',
    'event.location':'الموقع',
    'event.when':    'التاريخ والوقت',
    'event.organizer':'المنظم',
    'event.book':    'انضم مجاناً',
    'event.book_paid':'احجز — {price} ريال',
    'event.booked':  'إلغاء الحجز',
    'event.tip':     'دعم المنظم',
    'event.comments':'التعليقات',
    'comments.placeholder': 'اكتب تعليقاً…',
    'comments.post':   'نشر',
    'comments.reply':  'رد',
    'comments.delete': 'حذف',
    'comments.empty':  'لا توجد تعليقات',
    'chat.title':      'الدردشة العامة',
    'chat.placeholder':'أرسل رسالة للجميع…',
    'chat.send':       'إرسال',
    'auth.login':      'تسجيل الدخول',
    'auth.register':   'إنشاء حساب',
    'auth.email':      'البريد الإلكتروني',
    'auth.password':   'كلمة المرور',
    'auth.name':       'اسم العرض',
    'auth.city':       'المدينة',
    'auth.role_user':  'مستخدم عادي',
    'auth.role_org':   'منظم',
    'auth.no_account': 'ليس لديك حساب؟',
    'auth.has_account':'لديك حساب بالفعل؟',
    'bookings.title':  'حجوزاتي',
    'bookings.empty':  'لا توجد حجوزات',
    'profile.title':   'الملف الشخصي',
    'profile.logout':  'تسجيل الخروج',
    'common.loading':  'جارٍ التحميل…',
    'common.error':    'حدث خطأ',
    'common.retry':    'حاول مجدداً',
    'common.save':     'حفظ',
    'common.cancel':   'إلغاء',
    'common.back':     'رجوع',
  },
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en')

  useEffect(() => {
    AsyncStorage.getItem('rawaq_locale').then((v) => {
      if (v === 'ar' || v === 'en') setLocale(v)
    })
  }, [])

  async function toggleLocale() {
    const next: Locale = locale === 'en' ? 'ar' : 'en'
    setLocale(next)
    await AsyncStorage.setItem('rawaq_locale', next)
    // RTL note: full RTL requires app restart in RN; we handle layout direction via WritingDirection
    I18nManager.forceRTL(next === 'ar')
  }

  const t = (key: string) => translations[locale][key] ?? key

  return (
    <LocaleContext.Provider value={{ locale, isRTL: locale === 'ar', t, toggleLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be inside LocaleProvider')
  return ctx
}
