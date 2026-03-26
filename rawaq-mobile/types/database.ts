// Auto-maintained DB types — keep in sync with migrations.
// In production use: `supabase gen types typescript --linked > types/database.ts`

export type UserRole = 'user' | 'organizer' | 'admin'
export type GenderType = 'male' | 'female' | 'mixed'
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'waitlisted'
export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'event_reminder'
  | 'comment_reply'
  | 'mention'
  | 'organizer_approved'
  | 'event_cancelled'
  | 'tip_received'
export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'misinformation' | 'other'
export type OrganizerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  role: UserRole
  gender: GenderType | null
  city: string | null
  bio: string | null
  preferences: Record<string, unknown>
  is_banned: boolean
  created_at: string
  updated_at: string
}

export interface OrganizerProfile {
  id: string
  user_id: string
  business_name: string
  business_name_ar: string | null
  description: string | null
  description_ar: string | null
  logo_url: string | null
  website: string | null
  phone: string | null
  status: OrganizerStatus
  verified: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface EventCategory {
  id: string
  name_en: string
  name_ar: string
  icon: string | null
  sort_order: number
  is_active: boolean
}

export interface Event {
  id: string
  organizer_id: string
  category_id: string | null
  title: string
  title_ar: string | null
  description: string | null
  description_ar: string | null
  cover_image_url: string | null
  start_at: string
  end_at: string | null
  venue_name: string | null
  venue_name_ar: string | null
  address: string | null
  city: string
  country: string
  lat: number | null
  lng: number | null
  capacity: number | null
  is_free: boolean
  price: number | null
  currency: string
  gender_restriction: GenderType
  is_family_friendly: boolean
  is_private: boolean
  is_published: boolean
  is_cancelled: boolean
  cancelled_reason: string | null
  bookings_count: number
  views_count: number
  tips_total: number
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  user_id: string
  event_id: string
  status: BookingStatus
  notes: string | null
  ticket_id: string | null
  seat: string | null
  scanned_at: string | null
  created_at: string
  updated_at: string
}

export interface Tip {
  id: string
  user_id: string
  event_id: string
  organizer_id: string
  amount: number
  currency: string
  payment_ref: string | null
  is_simulated: boolean
  message: string | null
  created_at: string
}

export interface Comment {
  id: string
  user_id: string
  event_id: string
  parent_id: string | null
  content: string
  content_html: string | null
  mentions: string[]
  media_url: string | null
  is_deleted: boolean
  deleted_at: string | null
  is_flagged: boolean
  created_at: string
  updated_at: string
}

export interface CommentReport {
  id: string
  comment_id: string
  reporter_id: string
  reason: ReportReason
  details: string | null
  resolved: boolean
  created_at: string
}

export interface GlobalChat {
  id: string
  user_id: string
  content: string
  mentions: string[]
  is_deleted: boolean
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  payload: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface DeviceToken {
  id: string
  user_id: string
  token: string
  platform: 'ios' | 'android' | 'web'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EventView {
  id: string
  event_id: string
  user_id: string | null
  ip_hash: string | null
  created_at: string
}

export interface SavedEvent {
  user_id: string
  event_id: string
  created_at: string
}

// ── Join shapes used in API responses ──────────────────────
export interface EventWithOrganizer extends Event {
  organizer: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & {
    organizer_profile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'logo_url' | 'verified'> | null
  }
  category: Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'> | null
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  replies?: CommentWithAuthor[]
}

export interface BookingWithEvent extends Booking {
  event: Pick<Event, 'id' | 'title' | 'title_ar' | 'start_at' | 'cover_image_url' | 'city'>
}

// ── Supabase Database type (for createClient generic) ──────
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      organizer_profiles: { Row: OrganizerProfile; Insert: Omit<OrganizerProfile, 'id' | 'created_at' | 'updated_at'>; Update: Partial<OrganizerProfile> }
      event_categories: { Row: EventCategory; Insert: Omit<EventCategory, 'id'>; Update: Partial<EventCategory> }
      events: { Row: Event; Insert: Omit<Event, 'id' | 'bookings_count' | 'views_count' | 'tips_total' | 'created_at' | 'updated_at'>; Update: Partial<Event> }
      bookings: { Row: Booking; Insert: Omit<Booking, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Booking> }
      tips: { Row: Tip; Insert: Omit<Tip, 'id' | 'created_at'>; Update: Partial<Tip> }
      comments: { Row: Comment; Insert: Omit<Comment, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Comment> }
      comment_reports: { Row: CommentReport; Insert: Omit<CommentReport, 'id' | 'created_at'>; Update: Partial<CommentReport> }
      global_chat: { Row: GlobalChat; Insert: Omit<GlobalChat, 'id' | 'created_at'>; Update: Partial<GlobalChat> }
      notifications: { Row: Notification; Insert: Omit<Notification, 'id' | 'created_at'>; Update: Partial<Notification> }
      device_tokens: { Row: DeviceToken; Insert: Omit<DeviceToken, 'id' | 'created_at' | 'updated_at'>; Update: Partial<DeviceToken> }
      event_views: { Row: EventView; Insert: Omit<EventView, 'id' | 'created_at'>; Update: never }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      get_my_role: { Args: Record<string, never>; Returns: UserRole }
    }
    Enums: {
      user_role: UserRole
      gender_type: GenderType
      booking_status: BookingStatus
      notification_type: NotificationType
      report_reason: ReportReason
      organizer_status: OrganizerStatus
    }
  }
}
