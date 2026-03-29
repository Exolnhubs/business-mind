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
    'bookings.upcoming': 'Upcoming',
    'bookings.past':   'Past',
    'bookings.confirmed': 'Confirmed',
    'bookings.cancelled': 'Cancelled',
    'bookings.sign_in': 'Sign in to see your bookings',
    'bookings.join_hint': 'Join some events to see them here',
    'ticket.event_ticket': 'Event Ticket',
    'ticket.view_ticket':  'View Ticket',
    'ticket.not_found':    'Ticket not found',
    'ticket.date':         'Date',
    'ticket.time':         'Time',
    'ticket.venue':        'Venue',
    'ticket.address':      'Address',
    'ticket.attendee':     'Attendee',
    'ticket.seat':         'Seat',
    'ticket.present_qr':   'Present this QR code at the venue entrance',
    'ticket.share':        'Share Ticket',
    'ticket.scanned':      'Scanned',
    'ticket.scanned_at':   'Scanned at',
    'common.back':         'Back',
    'common.cancel':       'Cancel',
    'profile.title':   'Profile',
    'profile.logout':  'Sign Out',
    'profile.not_signed_in': "You're not signed in",
    'profile.edit':    '✏️ Edit Profile',
    'profile.cancel':  'Cancel',
    'profile.edit_title': 'Edit Profile',
    'profile.display_name': 'Display Name *',
    'profile.city':    'City',
    'profile.gender':  'Gender',
    'profile.gender_locked': 'Gender (locked)',
    'profile.male':    'Male',
    'profile.female':  'Female',
    'profile.gender_locked_note': "Cannot be changed after it's been set",
    'profile.bio':     'Bio',
    'profile.save':    'Save Profile',
    'profile.saved':   'Profile saved!',
    'profile.settings': 'Settings',
    'profile.language': 'Language',
    'profile.push_notifications': 'Push Notifications',
    'profile.organizer_section': 'Organizer',
    'profile.my_dashboard': 'My Dashboard',
    'profile.create_event': 'Create Event',
    'profile.admin_section': 'Admin',
    'profile.admin_dashboard': 'Admin Dashboard',
    'profile.version': 'Rawaq v1.0.0',
    'profile.organizer_badge': '🏢 Organizer',
    'profile.admin_badge': '🛡️ Admin',
    'profile.signout_confirm': 'Are you sure?',
    'tab.saved':       'Saved',
    'events.all':      'All',
    'events.all_cities': '📍 All cities',
    'events.free_filter': 'Free',
    'events.near_me':  'Near me',
    'events.near_me_active': 'Near me ✕',
    'events.try_filters': 'Try different filters',
    'auth.join':       'Join Rawaq',
    'auth.check_email': 'Check your email',
    'auth.check_email_sub': 'We sent a confirmation link. Tap it to activate your account.',
    'auth.back_to_signin': 'Back to Sign In',
    'auth.i_am_a':     'I am a',
    'auth.terms_agree': 'I agree to the Terms of Service and Privacy Policy',
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
    'bookings.upcoming': 'القادمة',
    'bookings.past':   'السابقة',
    'bookings.confirmed': 'مؤكد',
    'bookings.cancelled': 'ملغي',
    'bookings.sign_in': 'سجّل الدخول لرؤية حجوزاتك',
    'bookings.join_hint': 'انضم إلى فعاليات لرؤيتها هنا',
    'ticket.event_ticket': 'تذكرة الفعالية',
    'ticket.view_ticket':  'عرض التذكرة',
    'ticket.not_found':    'التذكرة غير موجودة',
    'ticket.date':         'التاريخ',
    'ticket.time':         'الوقت',
    'ticket.venue':        'المكان',
    'ticket.address':      'العنوان',
    'ticket.attendee':     'الحاضر',
    'ticket.seat':         'المقعد',
    'ticket.present_qr':   'أبرز رمز QR عند مدخل الفعالية',
    'ticket.share':        'مشاركة التذكرة',
    'ticket.scanned':      'تم المسح',
    'ticket.scanned_at':   'تم المسح في',
    'common.back':         'رجوع',
    'common.cancel':       'إلغاء',
    'profile.title':   'الملف الشخصي',
    'profile.logout':  'تسجيل الخروج',
    'profile.not_signed_in': 'لم تسجّل الدخول',
    'profile.edit':    '✏️ تعديل الملف الشخصي',
    'profile.cancel':  'إلغاء',
    'profile.edit_title': 'تعديل الملف الشخصي',
    'profile.display_name': 'اسم العرض *',
    'profile.city':    'المدينة',
    'profile.gender':  'الجنس',
    'profile.gender_locked': 'الجنس (مقفل)',
    'profile.male':    'ذكر',
    'profile.female':  'أنثى',
    'profile.gender_locked_note': 'لا يمكن تغييره بعد تحديده',
    'profile.bio':     'نبذة عني',
    'profile.save':    'حفظ الملف الشخصي',
    'profile.saved':   'تم حفظ الملف الشخصي!',
    'profile.settings': 'الإعدادات',
    'profile.language': 'اللغة',
    'profile.push_notifications': 'الإشعارات',
    'profile.organizer_section': 'المنظم',
    'profile.my_dashboard': 'لوحتي',
    'profile.create_event': 'إنشاء فعالية',
    'profile.admin_section': 'المشرف',
    'profile.admin_dashboard': 'لوحة الإدارة',
    'profile.version': 'رواق v1.0.0',
    'profile.organizer_badge': '🏢 منظم',
    'profile.admin_badge': '🛡️ مشرف',
    'profile.signout_confirm': 'هل أنت متأكد؟',
    'tab.saved':       'المحفوظة',
    'events.all':      'الكل',
    'events.all_cities': '📍 كل المدن',
    'events.free_filter': 'مجاني',
    'events.near_me':  'قريب مني',
    'events.near_me_active': 'قريب مني ✕',
    'events.try_filters': 'جرّب فلاتر مختلفة',
    'auth.join':       'انضم إلى رواق',
    'auth.check_email': 'تحقق من بريدك الإلكتروني',
    'auth.check_email_sub': 'أرسلنا رابط تأكيد. اضغط عليه لتفعيل حسابك.',
    'auth.back_to_signin': 'العودة لتسجيل الدخول',
    'auth.i_am_a':     'أنا',
    'auth.terms_agree': 'أوافق على شروط الخدمة وسياسة الخصوصية',
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
      if (v === 'ar' || v === 'en') {
        setLocale(v)
        // Apply RTL immediately for saved Arabic locale (takes effect after reload)
        I18nManager.forceRTL(v === 'ar')
      }
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
