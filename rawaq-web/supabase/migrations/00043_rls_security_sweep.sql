-- ── Migration 00043: Security sweep — ensure RLS on all public tables ─────────
--
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.
-- This migration re-asserts RLS on every table in the public schema
-- to resolve Supabase's rls_disabled_in_public security advisory.
-- Safe to run on a DB where migrations were partially applied or
-- tables were created manually via the Supabase dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

-- Core tables (00003 + 00006)
ALTER TABLE IF EXISTS profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizer_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS bookings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tips                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS comment_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS global_chat            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS device_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_views            ENABLE ROW LEVEL SECURITY;

-- Saved events (00008)
ALTER TABLE IF EXISTS saved_events           ENABLE ROW LEVEL SECURITY;

-- Plans (00014)
ALTER TABLE IF EXISTS plan_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizer_monthly_usage ENABLE ROW LEVEL SECURITY;

-- Payments (00016)
ALTER TABLE IF EXISTS ticket_types           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS waitlist               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payment_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizer_wallet       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallet_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS refunds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payouts                ENABLE ROW LEVEL SECURITY;

-- Social (00019)
ALTER TABLE IF EXISTS organizer_follows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_reactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_blocks            ENABLE ROW LEVEL SECURITY;

-- Reviews (00020)
ALTER TABLE IF EXISTS user_reviews           ENABLE ROW LEVEL SECURITY;

-- Promo codes (00021)
ALTER TABLE IF EXISTS promo_codes            ENABLE ROW LEVEL SECURITY;

-- Admin trust (00022)
ALTER TABLE IF EXISTS event_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_warnings          ENABLE ROW LEVEL SECURITY;

-- Media uploads (00025)
ALTER TABLE IF EXISTS media_uploads          ENABLE ROW LEVEL SECURITY;

-- Support tickets (00031)
ALTER TABLE IF EXISTS support_tickets        ENABLE ROW LEVEL SECURITY;

-- Bank accounts (00036)
ALTER TABLE IF EXISTS organizer_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Referral system (00039)
ALTER TABLE IF EXISTS referral_codes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referrals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_coupons           ENABLE ROW LEVEL SECURITY;

-- Community phase 1 (00040)
ALTER TABLE IF EXISTS communities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_hierarchy    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_communities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_memberships  ENABLE ROW LEVEL SECURITY;

-- Happenings phase 3 (00042)
ALTER TABLE IF EXISTS happenings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS happening_rsvps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS happening_reactions    ENABLE ROW LEVEL SECURITY;
