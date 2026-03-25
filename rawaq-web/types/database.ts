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
  | 'organizer_rejected'
  | 'organizer_suspended'
  | 'event_cancelled'
  | 'tip_received'
  | 'waitlist_promoted'
  | 'new_follower'
export type ReactionType = 'like' | 'interested'
export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'misinformation' | 'other'
export type OrganizerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type PaymentType = 'ticket' | 'tip' | 'refund' | 'payout'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type PaymentGateway = 'simulated' | 'moyasar' | 'stripe' | 'hyperpay'
export type WalletLedgerReason = 'tip' | 'ticket_sale' | 'refund_deducted' | 'payout' | 'adjustment'
export type WaitlistStatus = 'waiting' | 'promoted' | 'expired' | 'cancelled'
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'completed'

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
  plan_id: string
  phone: string | null
  signup_lat: number | null
  signup_lng: number | null
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
  plan_id: string
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
  is_premium_only: boolean
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
  ticket_type_id: string | null
  status: BookingStatus
  notes: string | null
  ticket_id: string | null
  seat: string | null
  scanned_at: string | null
  platform_fee_pct: number
  platform_fee_amount: number
  created_at: string
  updated_at: string
}

export interface TicketType {
  id: string
  event_id: string
  name: string
  name_ar: string | null
  description: string | null
  price: number
  currency: string
  capacity: number | null
  sold_count: number
  is_free: boolean
  sale_starts_at: string | null
  sale_ends_at: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Waitlist {
  id: string
  event_id: string
  user_id: string
  position: number
  notified_at: string | null
  expires_at: string | null
  status: WaitlistStatus
  created_at: string
}

export interface PaymentTransaction {
  id: string
  user_id: string
  organizer_id: string
  event_id: string | null
  booking_id: string | null
  tip_id: string | null
  type: PaymentType
  status: PaymentStatus
  amount: number
  platform_fee: number
  organizer_net: number
  currency: string
  gateway: PaymentGateway
  gateway_ref: string | null
  gateway_payload: Record<string, unknown> | null
  is_simulated: boolean
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface OrganizerWallet {
  organizer_id: string
  balance: number
  total_earned: number
  total_withdrawn: number
  currency: string
  updated_at: string
}

export interface WalletLedgerEntry {
  id: string
  organizer_id: string
  payment_transaction_id: string | null
  type: 'credit' | 'debit'
  reason: WalletLedgerReason
  amount: number
  balance_before: number
  balance_after: number
  note: string | null
  created_at: string
}

export interface Refund {
  id: string
  payment_transaction_id: string
  booking_id: string | null
  requested_by: string
  amount: number
  reason: string | null
  status: RefundStatus
  processed_by: string | null
  processed_at: string | null
  gateway_ref: string | null
  is_simulated: boolean
  created_at: string
  updated_at: string
}

export interface Payout {
  id: string
  organizer_id: string
  amount: number
  currency: string
  status: PayoutStatus
  bank_name: string | null
  iban: string | null
  requested_at: string
  processed_by: string | null
  processed_at: string | null
  gateway_ref: string | null
  failure_reason: string | null
  is_simulated: boolean
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
  platform_fee_pct: number
  platform_fee_amount: number
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

export interface OrganizerFollow {
  id: string
  follower_id: string
  organizer_id: string
  created_at: string
}

export interface EventReaction {
  id: string
  user_id: string
  event_id: string
  type: ReactionType
  created_at: string
}

export interface UserBlock {
  id: string
  blocker_id: string
  blocked_id: string
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
