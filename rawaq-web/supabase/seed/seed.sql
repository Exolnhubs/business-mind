-- ============================================================
-- SEED DATA  (development / testing only)
-- Run AFTER all migrations with the service-role key.
--
-- IMPORTANT: Do NOT insert auth users or profiles here.
-- Inserting into public.profiles without a matching auth.users row
-- creates orphan rows (the SQL editor bypasses FK checks via
-- session_replication_role = replica) and breaks all subsequent
-- user sign-ups.
--
-- Create test users through:
--   • Supabase Dashboard → Authentication → Users → Add user
--   • OR: supabase auth signup (CLI)
--   • OR: your app's sign-up flow
-- ============================================================

-- ----------------------------------------------------------
-- EVENT CATEGORIES
-- Safe to seed: no dependency on auth users.
-- ----------------------------------------------------------
INSERT INTO event_categories (id, name_en, name_ar, icon, sort_order) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Sports & Fitness',     'رياضة ولياقة',         '🏋️', 1),
  ('c0000001-0000-0000-0000-000000000002', 'Arts & Culture',       'فنون وثقافة',           '🎨', 2),
  ('c0000001-0000-0000-0000-000000000003', 'Food & Drinks',        'طعام ومشروبات',         '🍽️', 3),
  ('c0000001-0000-0000-0000-000000000004', 'Business & Networking','أعمال وتواصل',          '💼', 4),
  ('c0000001-0000-0000-0000-000000000005', 'Music & Entertainment','موسيقى وترفيه',         '🎵', 5),
  ('c0000001-0000-0000-0000-000000000006', 'Education & Workshops','تعليم وورش عمل',        '📚', 6),
  ('c0000001-0000-0000-0000-000000000007', 'Family & Kids',        'عائلة وأطفال',          '👨‍👩‍👧', 7),
  ('c0000001-0000-0000-0000-000000000008', 'Outdoor & Adventure',  'رياضات خارجية ومغامرة','🏕️', 8),
  ('c0000001-0000-0000-0000-000000000009', 'Technology',           'تكنولوجيا',             '💻', 9),
  ('c0000001-0000-0000-0000-000000000010', 'Health & Wellness',    'صحة وعافية',            '🧘', 10)
ON CONFLICT (id) DO NOTHING;
