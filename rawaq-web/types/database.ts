// Auto-maintained DB types — keep in sync with migrations.
// In production use: `supabase gen types typescript --linked > types/database.ts`
import type {
  PlanCountryPrice,
  PlanDefinition,
  Subscription,
  OrganizerMonthlyUsage,
} from "./plans";
export type {
  PlanCountryPrice,
  PlanDefinition,
  Subscription,
  OrganizerMonthlyUsage,
} from "./plans";

export type UserRole = "user" | "organizer" | "admin" | "owner";
export type GenderType = "male" | "female" | "mixed";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "waitlisted";
export type NotificationType =
  | "booking_confirmed"
  | "booking_cancelled"
  | "event_reminder"
  | "comment_reply"
  | "mention"
  | "organizer_approved"
  | "organizer_rejected"
  | "organizer_suspended"
  | "event_cancelled"
  | "tip_received"
  | "waitlist_promoted"
  | "new_follower"
  | "new_review"
  | "new_attendee"
  | "new_comment"
  | "event_updated"
  | "new_event_published"
  | "event_sold_out"
  | "referral_signup_reward"
  | "referral_conversion_reward"
  | "community_new_event"
  | "community_happening"
  | "follow_request"
  | "follow_accepted"
  | "say_hi"
  | "happening_rsvp_request"
  | "happening_rsvp_approved";
export type ReactionType = "like" | "interested";
export type ReportReason =
  | "spam"
  | "inappropriate"
  | "harassment"
  | "misinformation"
  | "other";
export type ReportStatus = "pending" | "resolved" | "dismissed";
export type AuditAction =
  | "ban_user"
  | "unban_user"
  | "warn_user"
  | "delete_user"
  | "approve_organizer"
  | "reject_organizer"
  | "suspend_organizer"
  | "publish_event"
  | "unpublish_event"
  | "cancel_event"
  | "resolve_report"
  | "dismiss_report"
  | "assign_plan";
export type WarningSeverity = "low" | "medium" | "high";
export type CommunitySanctionType = "timeout" | "removed" | "banned";
export type CommunityAuditAction =
  | "community_created"
  | "assign_community_admin"
  | "revoke_community_admin"
  | "assign_host_role"
  | "revoke_host_role"
  | "resolve_happening_report"
  | "dismiss_happening_report"
  | "delete_happening"
  | "warn_member"
  | "timeout_member"
  | "remove_member"
  | "ban_member"
  | "unban_member"
  | "revoke_sanction";
export type OrganizerStatus = "pending" | "approved" | "rejected" | "suspended";
export type PaymentType =
  | "ticket"
  | "tip"
  | "refund"
  | "payout"
  | "subscription";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentGateway =
  | "simulated"
  | "moyasar"
  | "stripe"
  | "hyperpay"
  | "paymob"
  | "fawry";
export type PaymentSource = "web" | "mobile";
export type WalletLedgerReason =
  | "tip"
  | "ticket_sale"
  | "refund_deducted"
  | "payout"
  | "adjustment"
  | "hold_released";
export type WaitlistStatus = "waiting" | "promoted" | "expired" | "cancelled";
export type PayoutStatus = "pending" | "processing" | "completed" | "failed";
export type RefundStatus = "pending" | "approved" | "rejected" | "completed";
export type EventFrequency = "one_time" | "weekly" | "monthly";
export type EventOccurrenceStatus = "scheduled" | "cancelled" | "completed";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  gender: GenderType | null;
  city: string | null;
  bio: string | null;
  preferences: Record<string, unknown>;
  is_banned: boolean;
  plan_id: string;
  phone: string | null;
  signup_lat: number | null;
  signup_lng: number | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  clicks: number;
  created_at: string;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  code_id: string;
  signup_coupon_awarded: boolean;
  conversion_coupon_awarded: boolean;
  created_at: string;
}

export interface UserCoupon {
  id: string;
  user_id: string;
  promo_code_id: string;
  referral_id: string | null;
  reason: "referral_signup" | "referral_conversion";
  expires_at: string;
  created_at: string;
  // joined from promo_codes:
  promo?: {
    code: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    used_count: number;
    is_active: boolean;
    expires_at: string;
  };
}

export interface OrganizerProfile {
  id: string;
  user_id: string;
  organizer_type: "company" | "individual";
  business_name: string;
  business_name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  bio: string | null;
  skills_tags: string[];
  sessions_hosted_count: number;
  cancellation_count: number;
  avg_rating: number | null;
  paid_sessions_enabled: boolean;
  payout_hold_days: number;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  status: OrganizerStatus;
  verified: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  plan_id: string;
  followers_count: number;
  suspend_reason: string | null;
  host_community_id: string | null;
  host_community_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  name_en: string;
  name_ar: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Event {
  id: string;
  organizer_id: string;
  category_id: string | null;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  cover_image_url: string | null;
  start_at: string;
  end_at: string | null;
  event_frequency: EventFrequency;
  recurrence_until: string | null;
  venue_name: string | null;
  venue_name_ar: string | null;
  address: string | null;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  capacity: number | null;
  is_free: boolean;
  price: number | null;
  currency: string;
  gender_restriction: GenderType;
  is_family_friendly: boolean;
  is_private: boolean;
  is_premium_only: boolean;
  is_published: boolean;
  is_cancelled: boolean;
  max_group_size: number | null;
  cancelled_reason: string | null;
  visibility_type: EventVisibility;
  organizer_type: 'company' | 'individual';
  bookings_count: number;
  views_count: number;
  tips_total: number;
  blog_posts_count: number;
  featured_at: string | null;
  featured_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventOccurrence {
  id: string;
  event_id: string;
  series_starts_at: string;
  starts_at: string;
  ends_at: string | null;
  status: EventOccurrenceStatus;
  capacity: number | null;
  bookings_count: number;
  is_exception: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventOccurrenceTicketSale {
  occurrence_id: string;
  ticket_type_id: string;
  sold_count: number;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  user_id: string;
  event_id: string;
  occurrence_id: string;
  ticket_type_id: string | null;
  promo_code_id: string | null;
  discount_amount: number;
  status: BookingStatus;
  notes: string | null;
  ticket_id: string | null;
  seat: string | null;
  scanned_at: string | null;
  platform_fee_pct: number;
  platform_fee_amount: number;
  group_size: number;
  payment_pending_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingHolder {
  id: string;
  booking_id: string;
  full_name: string;
  date_of_birth: string; // ISO date string YYYY-MM-DD
  relation: string;
  position: number;
  created_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  event_id: string | null;
  created_by: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  min_order_amount: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromoValidationResult {
  valid: boolean;
  reason?: string;
  promo_code_id?: string;
  code?: string;
  discount_type?: "percent" | "fixed";
  discount_value?: number;
  discount_amount?: number;
  final_amount?: number;
}

export interface TicketType {
  id: string;
  event_id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  price: number;
  capacity: number | null;
  sold_count: number;
  is_free: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  sort_order: number;
  is_active: boolean;
  is_hot_offer: boolean;
  hot_offer_price: number | null;
  hot_offer_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Waitlist {
  id: string;
  event_id: string;
  occurrence_id: string;
  user_id: string;
  position: number;
  notified_at: string | null;
  expires_at: string | null;
  status: WaitlistStatus;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  user_id: string;
  organizer_id: string;
  event_id: string | null;
  occurrence_id: string | null;
  booking_id: string | null;
  tip_id: string | null;
  subscription_plan_id: string | null;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  platform_fee: number;
  organizer_net: number;
  currency: string;
  gateway: PaymentGateway;
  source: PaymentSource;
  payment_method: string | null;
  gateway_ref: string | null;
  gateway_order_id: string | null;
  fawry_reference_number: string | null;
  gateway_payload: Record<string, unknown> | null;
  is_simulated: boolean;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizerWallet {
  organizer_id: string;
  balance: number;
  held_balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  is_simulated: boolean;
  updated_at: string;
}

export interface WalletLedgerEntry {
  id: string;
  organizer_id: string;
  payment_transaction_id: string | null;
  type: "credit" | "debit";
  reason: WalletLedgerReason;
  amount: number;
  balance_before: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

export interface Refund {
  id: string;
  payment_transaction_id: string;
  booking_id: string | null;
  requested_by: string;
  amount: number;
  reason: string | null;
  user_note: string | null;
  refund_method: "original_payment" | "manual";
  status: RefundStatus;
  processed_by: string | null;
  processed_at: string | null;
  gateway_ref: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  organizer_id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  bank_name: string | null;
  iban: string | null;
  bank_account_id: string | null;
  requested_at: string;
  processed_by: string | null;
  processed_at: string | null;
  gateway_ref: string | null;
  failure_reason: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tip {
  id: string;
  user_id: string;
  event_id: string;
  organizer_id: string;
  amount: number;
  currency: string;
  payment_ref: string | null;
  is_simulated: boolean;
  message: string | null;
  platform_fee_pct: number;
  platform_fee_amount: number;
  created_at: string;
}

export interface Comment {
  id: string;
  user_id: string;
  event_id: string | null;
  happening_id: string | null;
  parent_id: string | null;
  content: string;
  content_html: string | null;
  mentions: string[];
  media_url: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  is_flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentReport {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  resolved: boolean;
  created_at: string;
}

export interface EventReport {
  id: string;
  event_id: string;
  reporter_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface FeaturedEventLog {
  id: string;
  event_id: string;
  organizer_id: string;
  featured_at: string;
  featured_until: string;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: AuditAction;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface UserWarning {
  id: string;
  user_id: string;
  issued_by: string;
  severity: WarningSeverity;
  reason: string;
  internal_note: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface HappeningReport {
  happening_id: string;
  reporter_id: string;
  community_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface CommunityMemberWarning {
  id: string;
  community_id: string;
  user_id: string;
  issued_by: string;
  severity: WarningSeverity;
  reason: string;
  internal_note: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
}

export interface CommunityMemberSanction {
  id: string;
  community_id: string;
  user_id: string;
  issued_by: string;
  sanction_type: CommunitySanctionType;
  reason: string;
  internal_note: string | null;
  starts_at: string;
  ends_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_note: string | null;
  created_at: string;
}

export interface CommunityAuditLog {
  id: string;
  community_id: string;
  actor_user_id: string;
  action: CommunityAuditAction;
  target_type: string;
  target_id: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface GlobalChat {
  id: string;
  user_id: string;
  content: string;
  mentions: string[];
  is_deleted: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: "ios" | "android" | "web";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventView {
  id: string;
  event_id: string;
  user_id: string | null;
  ip_hash: string | null;
  created_at: string;
}

export interface SavedEvent {
  user_id: string;
  event_id: string;
  created_at: string;
}

export interface OrganizerFollow {
  id: string;
  follower_id: string;
  organizer_id: string;
  created_at: string;
}

export type UserFollowStatus = "pending" | "accepted";

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  status: UserFollowStatus;
  created_at: string;
}

export interface EventReaction {
  id: string;
  user_id: string;
  event_id: string;
  type: ReactionType;
  created_at: string;
}

export interface UserBlock {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface UserReview {
  id: string;
  reviewer_id: string;
  reviewed_id: string;
  rating: number; // 1-5
  content: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserReviewWithReviewer extends UserReview {
  reviewer: Pick<Profile, "id" | "display_name" | "avatar_url">;
}

// ── Community types ────────────────────────────────────────
export type CommunityLevel =
  | "micro"
  | "interest"
  | "district"
  | "city"
  | "country";
export type CommunityType =
  | "compound"
  | "neighborhood"
  | "university"
  | "company"
  | "coworking"
  | "tech"
  | "sports"
  | "gaming"
  | "book_club"
  | "entrepreneur"
  | "arts"
  | "other"
  | "district"
  | "city"
  | "country";
export type CommunityRole = "member" | "host" | "community_admin" | "owner";
export type CommunityMembershipStatus =
  | "active"
  | "timed_out"
  | "removed"
  | "banned";
export type CommunityApprovalStatus = "approved" | "pending" | "dismissed";
export type EventVisibility = "micro" | "interest" | "city" | "national";

export type CommunityKind = 'standard' | 'host';

export interface Community {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  description: string | null;
  description_ar: string | null;
  level: CommunityLevel;
  type: CommunityType;
  city: string | null;
  country: string;
  cover_url: string | null;
  member_count: number;
  kind: CommunityKind;
  is_verified: boolean;
  approval_status: CommunityApprovalStatus;
  is_private: boolean;
  created_by: string | null;
  owner_user_id: string | null;
  parent_community_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityMembership {
  id: string;
  community_id: string;
  user_id: string;
  role: CommunityRole;
  status: CommunityMembershipStatus;
  timeout_until: string | null;
  status_updated_at: string;
  joined_at: string;
}

export interface CommunityHierarchy {
  parent_id: string;
  child_id: string;
  depth: number;
}

export interface EventCommunity {
  event_id: string;
  community_id: string;
}

export interface CommunityFollow {
  community_id: string;
  user_id: string;
  created_at: string;
}

export interface CommunityHost {
  community_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
}

export interface HappeningRsvp {
  happening_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface HappeningReaction {
  happening_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export type HappeningType = "open_invite" | "info" | "question" | "alert";

export interface Happening {
  id: string;
  community_id: string;
  author_id: string;
  type: HappeningType;
  body: string;
  lat: number | null;
  lng: number | null;
  location_label: string | null;
  expires_at: string;
  rsvp_count: number;
  capacity: number;
  requires_approval: boolean;
  reaction_count: number;
  is_pinned: boolean;
  created_at: string;
}

export interface HappeningWithAuthor extends Happening {
  author: Pick<Profile, "id" | "display_name" | "avatar_url" | "plan_id">;
  user_has_rsvp?: boolean;
  user_has_reacted?: boolean;
  user_rsvp_status?: 'pending' | 'approved' | null;
  pending_count?: number;
}

export interface CommunityWithMembership extends Community {
  is_member?: boolean;
  is_following?: boolean;
  member_role?: CommunityRole | null;
  member_status?: CommunityMembershipStatus | null;
  ancestors?: Pick<Community, "id" | "name" | "name_ar" | "slug" | "level">[];
}

// ── Join shapes used in API responses ──────────────────────
export interface EventWithOrganizer extends Event {
  organizer: Pick<Profile, "id" | "display_name" | "avatar_url"> & {
    organizer_profile: Pick<
      OrganizerProfile,
      "business_name" | "business_name_ar" | "logo_url" | "verified" | "organizer_type"
    > | null;
  };
  category: Pick<EventCategory, "id" | "name_en" | "name_ar" | "icon"> | null;
  ticket_types?: Array<
    Pick<TicketType, "id" | "price" | "is_free" | "is_active" | "is_hot_offer" | "hot_offer_price" | "hot_offer_ends_at">
  >;
}

export interface CommentWithAuthor extends Comment {
  author: Pick<Profile, "id" | "display_name" | "avatar_url" | "plan_id">;
  replies?: CommentWithAuthor[];
}

export interface BookingWithEvent extends Booking {
  event: Pick<
    Event,
    "id" | "title" | "title_ar" | "start_at" | "cover_image_url" | "city"
  >;
}

// ── Extra table shapes not in types/plans.ts ───────────────
export interface OrganizerWalletRow {
  organizer_id: string;
  balance: number;
  held_balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  updated_at: string;
}

export interface RevenueHold {
  id: string;
  organizer_id: string;
  payment_transaction_id: string;
  amount: number;
  held_until: string;
  released_at: string | null;
  created_at: string;
}

export interface OrganizerBankAccount {
  id: string;
  organizer_id: string;
  bank_name: string;
  bank_name_ar: string | null;
  account_holder_name: string;
  iban: string;
  swift_code: string | null;
  country: string;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export type SupportTicketCategory =
  | "general"
  | "refund"
  | "harassment"
  | "legal"
  | "technical";
export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Event blog types ───────────────────────────────────────
export type BlogMediaKind = 'image' | 'video' | 'link'

export interface EventBlogMediaRow {
  id: string;
  post_id: string;
  kind: BlogMediaKind;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  position: number;
  created_at: string;
}

export interface EventBlogPostRow {
  id: string;
  event_id: string;
  author_id: string;
  title: string;
  body: string | null;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// Convenience API shapes (used in API route responses)
export type EventBlogMedia = {
  id: string; post_id: string; kind: BlogMediaKind; url: string
  title: string | null; thumbnail_url: string | null; caption: string | null; position: number
}
export type EventBlogPost = {
  id: string; event_id: string; author_id: string; title: string; body: string | null
  status: 'draft' | 'published'; published_at: string | null; created_at: string; updated_at: string
  media: EventBlogMedia[]
}

// ── Host community types ───────────────────────────────────
export type SuggestedCommunity = {
  id: string
  slug: string
  name: string
  name_ar: string | null
  cover_url: string | null
  member_count: number
}

// ── Supabase Database type (for createClient generic) ──────
// postgrest-js GenericTable requires Row/Insert/Update to extend Record<string, unknown>.
// TypeScript interfaces do NOT satisfy this — only mapped/object types do.
// R<T> converts any interface/type to a mapped object type that passes the check.
type R<T> = { [K in keyof T]: T[K] };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: R<Profile>;
        Insert: R<Omit<Profile, "created_at" | "updated_at">>;
        Update: R<Partial<Profile>>;
        Relationships: [];
      };
      organizer_profiles: {
        Row: R<OrganizerProfile>;
        Insert: R<Omit<OrganizerProfile, "id" | "host_community_id" | "host_community_enabled" | "created_at" | "updated_at">>;
        Update: R<Partial<OrganizerProfile>>;
        Relationships: [];
      };
      event_categories: {
        Row: R<EventCategory>;
        Insert: R<Omit<EventCategory, "id">>;
        Update: R<Partial<EventCategory>>;
        Relationships: [];
      };
      events: {
        Row: R<Event>;
        Insert: R<
          Omit<
            Event,
            | "id"
            | "bookings_count"
            | "views_count"
            | "tips_total"
            | "blog_posts_count"
            | "created_at"
            | "updated_at"
          >
        >;
        Update: R<Partial<Event>>;
        Relationships: [];
      };
      featured_events_log: {
        Row: R<FeaturedEventLog>;
        Insert: R<Omit<FeaturedEventLog, "id">>;
        Update: R<Partial<FeaturedEventLog>>;
        Relationships: [];
      };
      event_occurrences: {
        Row: R<EventOccurrence>;
        Insert: R<
          Omit<
            EventOccurrence,
            "id" | "bookings_count" | "created_at" | "updated_at"
          >
        >;
        Update: R<Partial<EventOccurrence>>;
        Relationships: [];
      };
      event_occurrence_ticket_sales: {
        Row: R<EventOccurrenceTicketSale>;
        Insert: R<Omit<EventOccurrenceTicketSale, "created_at" | "updated_at">>;
        Update: R<Partial<EventOccurrenceTicketSale>>;
        Relationships: [];
      };
      bookings: {
        Row: R<Booking>;
        Insert: R<Omit<Booking, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<Booking>>;
        Relationships: [];
      };
      booking_holders: {
        Row: R<BookingHolder>;
        Insert: R<Omit<BookingHolder, "id" | "created_at">>;
        Update: R<Partial<BookingHolder>>;
        Relationships: [];
      };
      payment_transactions: {
        Row: R<PaymentTransaction>;
        Insert: R<Partial<PaymentTransaction>>;
        Update: R<Partial<PaymentTransaction>>;
        Relationships: [];
      };
      wallet_ledger: {
        Row: R<WalletLedgerEntry>;
        Insert: R<Omit<WalletLedgerEntry, "id" | "created_at">>;
        Update: R<Partial<WalletLedgerEntry>>;
        Relationships: [];
      };
      refunds: {
        Row: R<Refund>;
        Insert: R<Partial<Refund>>;
        Update: R<Partial<Refund>>;
        Relationships: [];
      };
      payouts: {
        Row: R<Payout>;
        Insert: R<Partial<Payout>>;
        Update: R<Partial<Payout>>;
        Relationships: [];
      };
      tips: {
        Row: R<Tip>;
        Insert: R<Omit<Tip, "id" | "created_at">>;
        Update: R<Partial<Tip>>;
        Relationships: [];
      };
      comments: {
        Row: R<Comment>;
        Insert: R<Omit<Comment, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<Comment>>;
        Relationships: [];
      };
      comment_reports: {
        Row: R<CommentReport>;
        Insert: R<Omit<CommentReport, "id" | "created_at">>;
        Update: R<Partial<CommentReport>>;
        Relationships: [];
      };
      global_chat: {
        Row: R<GlobalChat>;
        Insert: R<Omit<GlobalChat, "id" | "created_at">>;
        Update: R<Partial<GlobalChat>>;
        Relationships: [];
      };
      notifications: {
        Row: R<Notification>;
        Insert: R<Omit<Notification, "id" | "created_at">>;
        Update: R<Partial<Notification>>;
        Relationships: [];
      };
      device_tokens: {
        Row: R<DeviceToken>;
        Insert: R<Omit<DeviceToken, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<DeviceToken>>;
        Relationships: [];
      };
      event_views: {
        Row: R<EventView>;
        Insert: R<Omit<EventView, "id" | "created_at">>;
        Update: R<Partial<EventView>>;
        Relationships: [];
      };
      saved_events: {
        Row: R<SavedEvent>;
        Insert: R<SavedEvent>;
        Update: R<Partial<SavedEvent>>;
        Relationships: [];
      };
      organizer_follows: {
        Row: R<OrganizerFollow>;
        Insert: R<OrganizerFollow>;
        Update: R<Partial<OrganizerFollow>>;
        Relationships: [];
      };
      user_follows: {
        Row: R<UserFollow>;
        Insert: R<Omit<UserFollow, "id" | "created_at">>;
        Update: R<Partial<UserFollow>>;
        Relationships: [];
      };
      user_blocks: {
        Row: R<UserBlock>;
        Insert: R<UserBlock>;
        Update: R<Partial<UserBlock>>;
        Relationships: [];
      };
      ticket_types: {
        Row: R<TicketType>;
        Insert: R<
          Omit<TicketType, "id" | "sold_count" | "created_at" | "updated_at">
        >;
        Update: R<Partial<TicketType>>;
        Relationships: [];
      };
      user_reviews: {
        Row: R<UserReview>;
        Insert: R<Omit<UserReview, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<UserReview>>;
        Relationships: [];
      };
      waitlist: {
        Row: R<Waitlist>;
        Insert: R<Omit<Waitlist, "id" | "created_at">>;
        Update: R<Partial<Waitlist>>;
        Relationships: [];
      };
      support_tickets: {
        Row: R<SupportTicket>;
        Insert: R<Partial<SupportTicket>>;
        Update: R<Partial<SupportTicket>>;
        Relationships: [];
      };
      happenings: {
        Row: R<Happening>;
        Insert: R<
          Omit<
            Happening,
            "id" | "rsvp_count" | "reaction_count" | "is_pinned" | "created_at" | "capacity" | "requires_approval"
          >
        > &
          Partial<Pick<R<Happening>, "is_pinned" | "capacity" | "requires_approval">>;
        Update: R<Partial<Happening>>;
        Relationships: [];
      };
      happening_rsvps: {
        Row: R<HappeningRsvp>;
        Insert: R<Omit<HappeningRsvp, "created_at" | "status">> & Partial<Pick<R<HappeningRsvp>, "status">>;
        Update: R<Partial<HappeningRsvp>>;
        Relationships: [];
      };
      happening_reactions: {
        Row: R<HappeningReaction>;
        Insert: R<Omit<HappeningReaction, "created_at">> &
          Partial<Pick<R<HappeningReaction>, "emoji">>;
        Update: R<Partial<HappeningReaction>>;
        Relationships: [];
      };
      happening_reports: {
        Row: R<HappeningReport>;
        Insert: R<
          Omit<
            HappeningReport,
            | "community_id"
            | "status"
            | "assigned_to"
            | "resolved_by"
            | "resolved_at"
            | "resolution_note"
            | "created_at"
          >
        > &
          Partial<
            Pick<
              R<HappeningReport>,
              | "community_id"
              | "status"
              | "assigned_to"
              | "resolved_by"
              | "resolved_at"
              | "resolution_note"
            >
          >;
        Update: R<Partial<HappeningReport>>;
        Relationships: [];
      };
      promo_codes: {
        Row: R<PromoCode>;
        Insert: R<
          Omit<PromoCode, "id" | "used_count" | "created_at" | "updated_at">
        >;
        Update: R<Partial<PromoCode>>;
        Relationships: [];
      };
      event_reports: {
        Row: R<EventReport>;
        Insert: R<Omit<EventReport, "id" | "created_at">>;
        Update: R<Partial<EventReport>>;
        Relationships: [];
      };
      community_member_warnings: {
        Row: R<CommunityMemberWarning>;
        Insert: R<
          Omit<
            CommunityMemberWarning,
            "id" | "acknowledged" | "acknowledged_at" | "created_at"
          >
        > &
          Partial<
            Pick<R<CommunityMemberWarning>, "acknowledged" | "acknowledged_at">
          >;
        Update: R<Partial<CommunityMemberWarning>>;
        Relationships: [];
      };
      community_member_sanctions: {
        Row: R<CommunityMemberSanction>;
        Insert: R<
          Omit<
            CommunityMemberSanction,
            | "id"
            | "starts_at"
            | "revoked_by"
            | "revoked_at"
            | "revoke_note"
            | "created_at"
          >
        > &
          Partial<
            Pick<
              R<CommunityMemberSanction>,
              "starts_at" | "revoked_by" | "revoked_at" | "revoke_note"
            >
          >;
        Update: R<Partial<CommunityMemberSanction>>;
        Relationships: [];
      };
      community_audit_logs: {
        Row: R<CommunityAuditLog>;
        Insert: R<Omit<CommunityAuditLog, "id" | "created_at">>;
        Update: R<Partial<CommunityAuditLog>>;
        Relationships: [];
      };
      plan_definitions: {
        Row: R<PlanDefinition>;
        Insert: R<Omit<PlanDefinition, "created_at" | "updated_at">>;
        Update: R<Partial<PlanDefinition>>;
        Relationships: [];
      };
      plan_country_prices: {
        Row: R<PlanCountryPrice>;
        Insert: R<Omit<PlanCountryPrice, "created_at" | "updated_at">>;
        Update: R<Partial<PlanCountryPrice>>;
        Relationships: [];
      };
      organizer_monthly_usage: {
        Row: R<OrganizerMonthlyUsage>;
        Insert: R<OrganizerMonthlyUsage>;
        Update: R<Partial<OrganizerMonthlyUsage>>;
        Relationships: [];
      };
      organizer_wallet: {
        Row: R<OrganizerWalletRow>;
        Insert: R<OrganizerWalletRow>;
        Update: R<Partial<OrganizerWalletRow>>;
        Relationships: [];
      };
      revenue_holds: {
        Row: R<RevenueHold>;
        Insert: R<Omit<RevenueHold, "id" | "created_at">>;
        Update: R<Partial<RevenueHold>>;
        Relationships: [];
      };
      organizer_bank_accounts: {
        Row: R<OrganizerBankAccount>;
        Insert: R<Omit<OrganizerBankAccount, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<OrganizerBankAccount>>;
        Relationships: [];
      };
      subscriptions: {
        Row: R<Subscription>;
        Insert: R<Omit<Subscription, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<Subscription>>;
        Relationships: [];
      };
      communities: {
        Row: R<Community>;
        Insert: R<
          Omit<Community, "id" | "member_count" | "kind" | "created_at" | "updated_at">
        >;
        Update: R<Partial<Community>>;
        Relationships: [];
      };
      community_memberships: {
        Row: R<CommunityMembership>;
        Insert: R<Partial<CommunityMembership>>;
        Update: R<Partial<CommunityMembership>>;
        Relationships: [];
      };
      referral_codes: {
        Row: R<ReferralCode>;
        Insert: R<Partial<ReferralCode>>;
        Update: R<Partial<ReferralCode>>;
        Relationships: [];
      };
      referrals: {
        Row: R<Referral>;
        Insert: R<Partial<Referral>>;
        Update: R<Partial<Referral>>;
        Relationships: [];
      };
      user_coupons: {
        Row: R<UserCoupon>;
        Insert: R<Partial<UserCoupon>>;
        Update: R<Partial<UserCoupon>>;
        Relationships: [];
      };
      community_follows: {
        Row: R<CommunityFollow>;
        Insert: R<CommunityFollow>;
        Update: R<Partial<CommunityFollow>>;
        Relationships: [];
      };
      community_hosts: {
        Row: R<CommunityHost>;
        Insert: R<Omit<CommunityHost, "granted_at">> & Partial<Pick<R<CommunityHost>, "granted_at">>;
        Update: R<Partial<CommunityHost>>;
        Relationships: [];
      };
      community_hierarchy: {
        Row: R<CommunityHierarchy>;
        Insert: R<CommunityHierarchy>;
        Update: R<Partial<CommunityHierarchy>>;
        Relationships: [];
      };
      event_communities: {
        Row: R<EventCommunity>;
        Insert: R<EventCommunity>;
        Update: R<Partial<EventCommunity>>;
        Relationships: [];
      };
      event_blog_posts: {
        Row: R<EventBlogPostRow>;
        Insert: R<Omit<EventBlogPostRow, "id" | "created_at" | "updated_at">>;
        Update: R<Partial<EventBlogPostRow>>;
        Relationships: [];
      };
      event_blog_media: {
        Row: R<EventBlogMediaRow>;
        Insert: R<Omit<EventBlogMediaRow, "id" | "created_at">>;
        Update: R<Partial<EventBlogMediaRow>>;
        Relationships: [];
      };
      platform_settings: {
        Row: R<{ key: string; value: unknown; updated_at: string; updated_by: string | null }>;
        Insert: R<{ key: string; value: unknown; updated_at?: string; updated_by: string | null }>;
        Update: R<Partial<{ key: string; value: unknown; updated_at: string; updated_by: string | null }>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      get_my_role: { Args: Record<string, never>; Returns: UserRole };
      events_within_radius: {
        Args: { user_lat: number; user_lng: number; radius_meters: number };
        Returns: Array<{ id: string }>;
      };
      get_user_communities: {
        Args: { p_user_id: string };
        Returns: Array<{
          community_id: string;
          community_name: string;
          community_slug: string;
          community_level: CommunityLevel;
          community_type: CommunityType;
        }>;
      };
      increment_referral_clicks: {
        Args: { p_code: string };
        Returns: void;
      };
      refresh_host_avg_rating: {
        Args: { host_user_id: string };
        Returns: void;
      };
      ensure_host_community: {
        Args: { p_owner: string; p_name: string; p_name_ar: string; p_country: string };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      gender_type: GenderType;
      booking_status: BookingStatus;
      notification_type: NotificationType;
      report_reason: ReportReason;
      organizer_status: OrganizerStatus;
      community_membership_status: CommunityMembershipStatus;
    };
  };
};
