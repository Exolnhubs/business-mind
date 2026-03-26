-- ============================================================
-- SEED DATA  (development / testing only)
-- Run AFTER all migrations with the service-role key.
-- ============================================================

-- ----------------------------------------------------------
-- EVENT CATEGORIES
-- Valid UUIDs: 8-4-4-4-12 hex chars
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

-- ----------------------------------------------------------
-- AUTH USERS
-- Insert directly into auth.users so profiles FK is satisfied.
-- Passwords are all: Rawaq@1234
-- These accounts are for development only — change before production.
-- ----------------------------------------------------------
INSERT INTO auth.users (
  id, aud, role,
  email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES
  (
    'a0000002-0000-0000-0000-000000000001',
    'authenticated', 'authenticated',
    'admin@rawaq.dev',
    crypt('Rawaq@1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Admin Rawaq","role":"admin","city":"Riyadh"}',
    NOW(), NOW()
  ),
  (
    'a0000002-0000-0000-0000-000000000002',
    'authenticated', 'authenticated',
    'fitz@rawaq.dev',
    crypt('Rawaq@1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Fit Zone Gym","role":"organizer","city":"Riyadh"}',
    NOW(), NOW()
  ),
  (
    'a0000002-0000-0000-0000-000000000003',
    'authenticated', 'authenticated',
    'cafe@rawaq.dev',
    crypt('Rawaq@1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"The Cafe Hub","role":"organizer","city":"Jeddah"}',
    NOW(), NOW()
  ),
  (
    'a0000002-0000-0000-0000-000000000004',
    'authenticated', 'authenticated',
    'sara@rawaq.dev',
    crypt('Rawaq@1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sara Al-Harbi","role":"user","city":"Riyadh"}',
    NOW(), NOW()
  ),
  (
    'a0000002-0000-0000-0000-000000000005',
    'authenticated', 'authenticated',
    'khalid@rawaq.dev',
    crypt('Rawaq@1234', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Khalid Al-Otaibi","role":"user","city":"Jeddah"}',
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- PROFILES
-- The trigger on auth.users may auto-create these; we upsert
-- to ensure the correct role/city/bio values are set.
-- ----------------------------------------------------------
INSERT INTO profiles (id, display_name, avatar_url, role, gender, city, bio) VALUES
  (
    'a0000002-0000-0000-0000-000000000001',
    'Admin Rawaq', NULL, 'admin', NULL, 'Riyadh',
    'Platform administrator'
  ),
  (
    'a0000002-0000-0000-0000-000000000002',
    'Fit Zone Gym', NULL, 'organizer', NULL, 'Riyadh',
    'Premium fitness center in Riyadh'
  ),
  (
    'a0000002-0000-0000-0000-000000000003',
    'The Cafe Hub', NULL, 'organizer', NULL, 'Jeddah',
    'Community café hosting weekly events'
  ),
  (
    'a0000002-0000-0000-0000-000000000004',
    'Sara Al-Harbi', NULL, 'user', 'female', 'Riyadh',
    'Yoga enthusiast and book lover'
  ),
  (
    'a0000002-0000-0000-0000-000000000005',
    'Khalid Al-Otaibi', NULL, 'user', 'male', 'Jeddah',
    'Coffee addict and tech geek'
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role         = EXCLUDED.role,
  gender       = EXCLUDED.gender,
  city         = EXCLUDED.city,
  bio          = EXCLUDED.bio;

-- ----------------------------------------------------------
-- ORGANIZER PROFILES
-- ----------------------------------------------------------
INSERT INTO organizer_profiles
  (user_id, business_name, business_name_ar, description, description_ar, status, verified)
VALUES
  (
    'a0000002-0000-0000-0000-000000000002',
    'Fit Zone Gym', 'جيم فيت زون',
    'Riyadh''s leading fitness gym with professional coaches.',
    'صالة لياقة رائدة في الرياض مع مدربين محترفين.',
    'approved', TRUE
  ),
  (
    'a0000002-0000-0000-0000-000000000003',
    'The Cafe Hub', 'كافيه هاب',
    'A community café in Jeddah hosting weekly cultural and social events.',
    'مقهى مجتمعي في جدة يستضيف فعاليات ثقافية واجتماعية أسبوعية.',
    'approved', TRUE
  )
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------
-- EVENTS
-- ----------------------------------------------------------
INSERT INTO events (
  id, organizer_id, category_id,
  title, title_ar,
  description, description_ar,
  start_at, end_at,
  venue_name, venue_name_ar,
  city, country, lat, lng,
  capacity, is_free, price,
  gender_restriction, is_family_friendly,
  is_published, is_cancelled
) VALUES
  (
    'e0000003-0000-0000-0000-000000000001',
    'a0000002-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000001',
    'Morning Yoga Session', 'جلسة يوغا صباحية',
    'Start your day with an energizing yoga class led by certified instructors.',
    'ابدأ يومك بحصة يوغا منشطة بإشراف مدربين معتمدين.',
    NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days' + INTERVAL '1 hour',
    'Fit Zone Gym - Hall A', 'جيم فيت زون - القاعة أ',
    'Riyadh', 'SA', 24.7136, 46.6753,
    20, TRUE, NULL,
    'female', FALSE, TRUE, FALSE
  ),
  (
    'e0000003-0000-0000-0000-000000000002',
    'a0000002-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000001',
    'Strength Training Workshop', 'ورشة تدريب القوة',
    'Intensive 2-hour strength training workshop for all fitness levels.',
    'ورشة تدريب قوة مكثفة لمدة ساعتين لجميع مستويات اللياقة.',
    NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days' + INTERVAL '2 hours',
    'Fit Zone Gym - Main Hall', 'جيم فيت زون - القاعة الرئيسية',
    'Riyadh', 'SA', 24.7136, 46.6753,
    30, FALSE, 75,
    'male', FALSE, TRUE, FALSE
  ),
  (
    'e0000003-0000-0000-0000-000000000003',
    'a0000002-0000-0000-0000-000000000003',
    'c0000001-0000-0000-0000-000000000003',
    'Arabic Coffee & Conversation', 'قهوة عربية وحوارات',
    'Join us for a relaxed evening of Arabic coffee, dates, and stimulating conversation.',
    'انضم إلينا لأمسية هادئة من القهوة العربية والتمور والحوارات الممتعة.',
    NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days' + INTERVAL '2 hours',
    'The Cafe Hub', 'كافيه هاب',
    'Jeddah', 'SA', 21.5433, 39.1728,
    50, TRUE, NULL,
    'mixed', TRUE, TRUE, FALSE
  ),
  (
    'e0000003-0000-0000-0000-000000000004',
    'a0000002-0000-0000-0000-000000000003',
    'c0000001-0000-0000-0000-000000000006',
    'Tech Talk: AI in Saudi Arabia', 'حديث تقني: الذكاء الاصطناعي في المملكة',
    'Monthly tech meetup discussing AI advancements and opportunities in the region.',
    'لقاء تقني شهري لمناقشة تطورات الذكاء الاصطناعي والفرص في المنطقة.',
    NOW() + INTERVAL '10 days', NOW() + INTERVAL '10 days' + INTERVAL '3 hours',
    'The Cafe Hub - Conference Room', 'كافيه هاب - غرفة المؤتمرات',
    'Jeddah', 'SA', 21.5433, 39.1728,
    NULL, TRUE, NULL,
    'mixed', FALSE, TRUE, FALSE
  ),
  (
    'e0000003-0000-0000-0000-000000000005',
    'a0000002-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000009',
    'Riyadh Dev Meetup', 'لقاء مطوري الرياض',
    'Quarterly developer meetup — bring your side project and share it!',
    'لقاء ربعي للمطورين — أحضر مشروعك الجانبي وشاركه!',
    NOW() + INTERVAL '14 days', NOW() + INTERVAL '14 days' + INTERVAL '3 hours',
    'Hub71 Riyadh', 'هاب71 الرياض',
    'Riyadh', 'SA', 24.7741, 46.7383,
    60, TRUE, NULL,
    'mixed', FALSE, TRUE, FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- BOOKINGS
-- ----------------------------------------------------------
INSERT INTO bookings (user_id, event_id, status) VALUES
  ('a0000002-0000-0000-0000-000000000004', 'e0000003-0000-0000-0000-000000000001', 'confirmed'),
  ('a0000002-0000-0000-0000-000000000005', 'e0000003-0000-0000-0000-000000000003', 'confirmed'),
  ('a0000002-0000-0000-0000-000000000005', 'e0000003-0000-0000-0000-000000000004', 'confirmed'),
  ('a0000002-0000-0000-0000-000000000004', 'e0000003-0000-0000-0000-000000000005', 'confirmed')
ON CONFLICT (user_id, event_id) DO NOTHING;

-- ----------------------------------------------------------
-- COMMENTS
-- ----------------------------------------------------------
INSERT INTO comments (id, user_id, event_id, content, mentions) VALUES
  (
    'f0000004-0000-0000-0000-000000000001',
    'a0000002-0000-0000-0000-000000000004',
    'e0000003-0000-0000-0000-000000000001',
    'Looking forward to this session! Will there be mats provided?',
    '{}'
  ),
  (
    'f0000004-0000-0000-0000-000000000002',
    'a0000002-0000-0000-0000-000000000002',
    'e0000003-0000-0000-0000-000000000001',
    'Yes, all equipment is provided. Just bring comfortable clothes! 🧘',
    '{}'
  ),
  (
    'f0000004-0000-0000-0000-000000000003',
    'a0000002-0000-0000-0000-000000000005',
    'e0000003-0000-0000-0000-000000000003',
    'هل ستكون هناك قهوة خاصة من المزارع السعودية؟ 😊',
    '{}'
  )
ON CONFLICT (id) DO NOTHING;

-- Reply to first comment (no fixed id — auto-generated)
INSERT INTO comments (user_id, event_id, parent_id, content, mentions)
SELECT
  'a0000002-0000-0000-0000-000000000005',
  'e0000003-0000-0000-0000-000000000001',
  'f0000004-0000-0000-0000-000000000001',
  '@Sara Al-Harbi I heard they also provide towels!',
  ARRAY['a0000002-0000-0000-0000-000000000004']::UUID[]
WHERE NOT EXISTS (
  SELECT 1 FROM comments
  WHERE parent_id = 'f0000004-0000-0000-0000-000000000001'
    AND user_id   = 'a0000002-0000-0000-0000-000000000005'
);

-- ----------------------------------------------------------
-- TIPS
-- ----------------------------------------------------------
INSERT INTO tips (user_id, event_id, organizer_id, amount, currency, message, is_simulated)
SELECT
  'a0000002-0000-0000-0000-000000000005',
  'e0000003-0000-0000-0000-000000000003',
  'a0000002-0000-0000-0000-000000000003',
  25.00, 'SAR',
  'Great event, keep it up! 🙏',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM tips
  WHERE user_id       = 'a0000002-0000-0000-0000-000000000005'
    AND event_id      = 'e0000003-0000-0000-0000-000000000003'
    AND organizer_id  = 'a0000002-0000-0000-0000-000000000003'
);

-- ----------------------------------------------------------
-- GLOBAL CHAT (sample messages)
-- ----------------------------------------------------------
INSERT INTO global_chat (user_id, content, mentions) VALUES
  ('a0000002-0000-0000-0000-000000000004', 'Anyone going to the yoga session this week? 🧘‍♀️', '{}'),
  ('a0000002-0000-0000-0000-000000000005', 'The AI talk at Cafe Hub looks great!', '{}'),
  ('a0000002-0000-0000-0000-000000000002', 'New events dropping every week — stay tuned! 🎉', '{}');