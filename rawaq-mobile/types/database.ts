// Auto-maintained DB types — keep in sync with migrations.
// In production use: `supabase gen types typescript --linked > types/database.ts`
import type { PlanDefinition, Subscription, OrganizerMonthlyUsage } from './plans'
export type { PlanDefinition, Subscription, OrganizerMonthlyUsage } from './plans'

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
  | 'new_review'
  | 'new_attendee'
  | 'new_comment'
  | 'event_updated'
  | 'new_event_published'
  | 'event_sold_out'
  | 'community_new_event'
export type ReactionType = 'like' | 'interested'
export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'misinformation' | 'other'
export type ReportStatus = 'pending' | 'resolved' | 'dismissed'
export type AuditAction =
  | 'ban_user' | 'unban_user' | 'warn_user' | 'delete_user'
  | 'approve_organizer' | 'reject_organizer' | 'suspend_organizer'
  | 'publish_event' | 'unpublish_event' | 'cancel_event'
  | 'resolve_report' | 'dismiss_report' | 'assign_plan'
export type WarningSeverity = 'low' | 'medium' | 'high'
export type OrganizerStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type PaymentType = 'ticket' | 'tip' | 'refund' | 'payout'
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'
export type PaymentGateway = 'simulated' | 'moyasar' | 'stripe' | 'hyperpay' | 'paymob' | 'fawry'
export type PaymentSource = 'web' | 'mobile'
export type WalletLedgerReason = 'tip' | 'ticket_sale' | 'refund_deducted' | 'payout' | 'adjustment'
export type WaitlistStatus = 'waiting' | 'promoted' | 'expired' | 'cancelled'
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type RefundStatus = 'pending' | 'approved' | 'rejected' | 'completed'
export type CommunityLevel = 'micro' | 'interest' | 'district' | 'city' | 'country'
export type CommunityType =
  | 'compound' | 'neighborhood' | 'university' | 'company' | 'coworking'
  | 'tech' | 'sports' | 'gaming' | 'book_club' | 'entrepreneur' | 'arts' | 'other'
  | 'district' | 'city' | 'country'
export type CommunityRole = 'member' | 'moderator' | 'admin'
export type EventVisibility = 'micro' | 'interest' | 'city' | 'national'

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
  followers_count: number
  suspend_reason: string | null
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
  visibility_type: EventVisibility
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
  promo_code_id: string | null
  discount_amount: number
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

export interface PromoCode {
  id: string
  code: string
  event_id: string | null
  created_by: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_uses: number | null
  used_count: number
  min_order_amount: number
  expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PromoValidationResult {
  valid: boolean
  reason?: string
  promo_code_id?: string
  code?: string
  discount_type?: 'percent' | 'fixed'
  discount_value?: number
  discount_amount?: number
  final_amount?: number
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
  source: PaymentSource
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
  is_simulated: boolean
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

export interface EventReport {
  id: string
  event_id: string
  reporter_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  resolved_by: string | null
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  admin_id: string
  action: AuditAction
  target_type: string
  target_id: string
  meta: Record<string, unknown>
  created_at: string
}

export interface UserWarning {
  id: string
  user_id: string
  issued_by: string
  severity: WarningSeverity
  reason: string
  internal_note: string | null
  acknowledged: boolean
  acknowledged_at: string | null
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

export interface UserReview {
  id: string
  reviewer_id: string
  reviewed_id: string
  rating: number          // 1–5
  content: string | null
  created_at: string
  updated_at: string
}

export interface UserReviewWithReviewer extends UserReview {
  reviewer: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
}

export interface Community {
  id: string
  name: string
  name_ar: string | null
  slug: string
  description: string | null
  description_ar: string | null
  level: CommunityLevel
  type: CommunityType
  city: string | null
  country: string
  cover_url: string | null
  member_count: number
  is_verified: boolean
  is_private: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CommunityMembership {
  id: string
  community_id: string
  user_id: string
  role: CommunityRole
  joined_at: string
}

export interface CommunityHierarchy {
  parent_id: string
  child_id: string
  depth: number
}

export interface EventCommunity {
  event_id: string
  community_id: string
}

export interface CommunityWithMembership extends Community {
  is_member?: boolean
  ancestors?: Pick<Community, 'id' | 'name' | 'name_ar' | 'slug' | 'level'>[]
}

export type HappeningType = 'open_invite' | 'info' | 'question' | 'alert'

export interface Happening {
  id:             string
  community_id:   string
  author_id:      string
  type:           HappeningType
  body:           string
  lat:            number | null
  lng:            number | null
  location_label: string | null
  expires_at:     string
  rsvp_count:     number
  reaction_count: number
  is_pinned:      boolean
  created_at:     string
}

export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  user_has_rsvp?:    boolean
  user_has_reacted?: boolean
}

// ── Join shapes used in API responses ──────────────────────
export interface EventWithOrganizer extends Event {
  organizer: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> & {
    organizer_profile: Pick<OrganizerProfile, 'business_name' | 'business_name_ar' | 'logo_url' | 'verified'> | null
  }
  category: Pick<EventCategory, 'id' | 'name_en' | 'name_ar' | 'icon'> | null
  ticket_types?: Array<Pick<TicketType, 'id' | 'price' | 'is_free' | 'is_active'>>
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  replies?: CommentWithAuthor[]
}

export interface BookingWithEvent extends Booking {
  event: Pick<Event, 'id' | 'title' | 'title_ar' | 'start_at' | 'cover_image_url' | 'city'>
}

// ── Extra table shapes not in types/plans.ts ───────────────
export interface OrganizerWalletRow {
  organizer_id: string
  balance: number
  total_earned: number
  total_withdrawn: number
  currency: string
  is_simulated: boolean
  updated_at: string
}

// ── Supabase Database type (for createClient generic) ──────
// postgrest-js GenericTable requires Row/Insert/Update to extend Record<string, unknown>.
// TypeScript interfaces do NOT satisfy this — only mapped/object types do.
// R<T> converts any interface/type to a mapped object type that passes the check.
type R<T> = { [K in keyof T]: T[K] }

export type Database = {
  public: {
    Tables: {
      profiles: { Row: R<Profile>; Insert: R<Omit<Profile, 'created_at' | 'updated_at'>>; Update: R<Partial<Profile>>; Relationships: [] }
      organizer_profiles: { Row: R<OrganizerProfile>; Insert: R<Omit<OrganizerProfile, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<OrganizerProfile>>; Relationships: [] }
      event_categories: { Row: R<EventCategory>; Insert: R<Omit<EventCategory, 'id'>>; Update: R<Partial<EventCategory>>; Relationships: [] }
      events: { Row: R<Event>; Insert: R<Omit<Event, 'id' | 'bookings_count' | 'views_count' | 'tips_total' | 'created_at' | 'updated_at'>>; Update: R<Partial<Event>>; Relationships: [] }
      bookings: { Row: R<Booking>; Insert: R<Omit<Booking, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<Booking>>; Relationships: [] }
      tips: { Row: R<Tip>; Insert: R<Omit<Tip, 'id' | 'created_at'>>; Update: R<Partial<Tip>>; Relationships: [] }
      comments: { Row: R<Comment>; Insert: R<Omit<Comment, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<Comment>>; Relationships: [] }
      comment_reports: { Row: R<CommentReport>; Insert: R<Omit<CommentReport, 'id' | 'created_at'>>; Update: R<Partial<CommentReport>>; Relationships: [] }
      global_chat: { Row: R<GlobalChat>; Insert: R<Omit<GlobalChat, 'id' | 'created_at'>>; Update: R<Partial<GlobalChat>>; Relationships: [] }
      notifications: { Row: R<Notification>; Insert: R<Omit<Notification, 'id' | 'created_at'>>; Update: R<Partial<Notification>>; Relationships: [] }
      device_tokens: { Row: R<DeviceToken>; Insert: R<Omit<DeviceToken, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<DeviceToken>>; Relationships: [] }
      event_views: { Row: R<EventView>; Insert: R<Omit<EventView, 'id' | 'created_at'>>; Update: R<Partial<EventView>>; Relationships: [] }
      saved_events: { Row: R<SavedEvent>; Insert: R<SavedEvent>; Update: R<Partial<SavedEvent>>; Relationships: [] }
      organizer_follows: { Row: R<OrganizerFollow>; Insert: R<OrganizerFollow>; Update: R<Partial<OrganizerFollow>>; Relationships: [] }
      user_blocks: { Row: R<UserBlock>; Insert: R<UserBlock>; Update: R<Partial<UserBlock>>; Relationships: [] }
      ticket_types: { Row: R<TicketType>; Insert: R<Omit<TicketType, 'id' | 'sold_count' | 'created_at' | 'updated_at'>>; Update: R<Partial<TicketType>>; Relationships: [] }
      user_reviews: { Row: R<UserReview>; Insert: R<Omit<UserReview, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<UserReview>>; Relationships: [] }
      waitlist: { Row: R<Waitlist>; Insert: R<Omit<Waitlist, 'id' | 'created_at'>>; Update: R<Partial<Waitlist>>; Relationships: [] }
      promo_codes: { Row: R<PromoCode>; Insert: R<Omit<PromoCode, 'id' | 'used_count' | 'created_at' | 'updated_at'>>; Update: R<Partial<PromoCode>>; Relationships: [] }
      event_reports: { Row: R<EventReport>; Insert: R<Omit<EventReport, 'id' | 'created_at'>>; Update: R<Partial<EventReport>>; Relationships: [] }
      plan_definitions: { Row: R<PlanDefinition>; Insert: R<Omit<PlanDefinition, 'created_at' | 'updated_at'>>; Update: R<Partial<PlanDefinition>>; Relationships: [] }
      organizer_monthly_usage: { Row: R<OrganizerMonthlyUsage>; Insert: R<OrganizerMonthlyUsage>; Update: R<Partial<OrganizerMonthlyUsage>>; Relationships: [] }
      organizer_wallet: { Row: R<OrganizerWalletRow>; Insert: R<OrganizerWalletRow>; Update: R<Partial<OrganizerWalletRow>>; Relationships: [] }
      subscriptions: { Row: R<Subscription>; Insert: R<Omit<Subscription, 'id' | 'created_at' | 'updated_at'>>; Update: R<Partial<Subscription>>; Relationships: [] }
      communities: { Row: R<Community>; Insert: R<Omit<Community, 'id' | 'member_count' | 'created_at' | 'updated_at'>>; Update: R<Partial<Community>>; Relationships: [] }
      community_memberships: { Row: R<CommunityMembership>; Insert: R<Omit<CommunityMembership, 'id' | 'joined_at'>>; Update: R<Partial<CommunityMembership>>; Relationships: [] }
      community_hierarchy: { Row: R<CommunityHierarchy>; Insert: R<CommunityHierarchy>; Update: R<Partial<CommunityHierarchy>>; Relationships: [] }
      event_communities: { Row: R<EventCommunity>; Insert: R<EventCommunity>; Update: R<Partial<EventCommunity>>; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      get_my_role: { Args: Record<string, never>; Returns: UserRole }
      events_within_radius: { Args: { user_lat: number; user_lng: number; radius_meters: number }; Returns: Array<{ id: string }> }
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
