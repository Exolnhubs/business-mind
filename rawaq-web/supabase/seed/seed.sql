-- ============================================================
-- SEED DATA  (development / testing only)
-- Run AFTER migrations with the service-role key.
-- ============================================================

-- NOTE: Auth users must be created via Supabase Auth API or dashboard.
-- The UUIDs below are fixed so seed data is repeatable.

-- ----------------------------------------------------------
-- EVENT CATEGORIES
-- ----------------------------------------------------------
INSERT INTO event_categories (id, name_en, name_ar, icon, sort_order) VALUES
  ('cat-0001-0000-0000-000000000001', 'Sports & Fitness',    'رياضة ولياقة',        '🏋️', 1),
  ('cat-0001-0000-0000-000000000002', 'Arts & Culture',      'فنون وثقافة',          '🎨', 2),
  ('cat-0001-0000-0000-000000000003', 'Food & Drinks',       'طعام ومشروبات',        '🍽️', 3),
  ('cat-0001-0000-0000-000000000004', 'Business & Networking','أعمال وتواصل',        '💼', 4),
  ('cat-0001-0000-0000-000000000005', 'Music & Entertainment','موسيقى وترفيه',       '🎵', 5),
  ('cat-0001-0000-0000-000000000006', 'Education & Workshops','تعليم وورش عمل',      '📚', 6),
  ('cat-0001-0000-0000-000000000007', 'Family & Kids',       'عائلة وأطفال',         '👨‍👩‍👧', 7),
  ('cat-0001-0000-0000-000000000008', 'Outdoor & Adventure', 'رياضات خارجية ومغامرة','🏕️', 8),
  ('cat-0001-0000-0000-000000000009', 'Technology',          'تكنولوجيا',            '💻', 9),
  ('cat-0001-0000-0000-000000000010', 'Health & Wellness',   'صحة وعافية',           '🧘', 10)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- DEMO USER PROFILES
-- (Assumes auth users with these IDs already exist)
-- ----------------------------------------------------------
INSERT INTO profiles (id, display_name, avatar_url, role, gender, city, bio) VALUES
  (
    'usr-admin-0000-0000-000000000001',
    'Admin Rawaq',
    NULL,
    'admin',
    NULL,
    'Riyadh',
    'Platform administrator'
  ),
  (
    'usr-organ-0000-0000-000000000002',
    'Fit Zone Gym',
    NULL,
    'organizer',
    NULL,
    'Riyadh',
    'Premium fitness center in Riyadh'
  ),
  (
    'usr-organ-0000-0000-000000000003',
    'The Cafe Hub',
    NULL,
    'organizer',
    NULL,
    'Jeddah',
    'Community café hosting weekly events'
  ),
  (
    'usr-user1-0000-0000-000000000004',
    'Sara Al-Harbi',
    NULL,
    'user',
    'female',
    'Riyadh',
    'Yoga enthusiast and book lover'
  ),
  (
    'usr-user2-0000-0000-000000000005',
    'Khalid Al-Otaibi',
    NULL,
    'user',
    'male',
    'Jeddah',
    'Coffee addict and tech geek'
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- ORGANIZER PROFILES
-- ----------------------------------------------------------
INSERT INTO organizer_profiles
  (user_id, business_name, business_name_ar, description, description_ar, status, verified)
VALUES
  (
    'usr-organ-0000-0000-000000000002',
    'Fit Zone Gym',
    'جيم فيت زون',
    'Riyadh''s leading fitness gym with professional coaches.',
    'صالة لياقة رائدة في الرياض مع مدربين محترفين.',
    'approved',
    TRUE
  ),
  (
    'usr-organ-0000-0000-000000000003',
    'The Cafe Hub',
    'كافيه هاب',
    'A community café in Jeddah hosting weekly cultural and social events.',
    'مقهى مجتمعي في جدة يستضيف فعاليات ثقافية واجتماعية أسبوعية.',
    'approved',
    TRUE
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
  capacity, is_free,
  gender_restriction, is_family_friendly,
  is_published, is_cancelled
) VALUES
  (
    'evt-00001-000-0000-000000000001',
    'usr-organ-0000-0000-000000000002',
    'cat-0001-0000-0000-000000000001',
    'Morning Yoga Session',
    'جلسة يوغا صباحية',
    'Start your day with an energizing yoga class led by certified instructors.',
    'ابدأ يومك بحصة يوغا منشطة بإشراف مدربين معتمدين.',
    NOW() + INTERVAL '3 days',
    NOW() + INTERVAL '3 days' + INTERVAL '1 hour',
    'Fit Zone Gym - Hall A',
    'جيم فيت زون - القاعة أ',
    'Riyadh', 'SA', 24.7136, 46.6753,
    20, TRUE,
    'female', FALSE,
    TRUE, FALSE
  ),
  (
    'evt-00001-000-0000-000000000002',
    'usr-organ-0000-0000-000000000002',
    'cat-0001-0000-0000-000000000001',
    'Strength Training Workshop',
    'ورشة تدريب القوة',
    'Intensive 2-hour strength training workshop for all fitness levels.',
    'ورشة تدريب قوة مكثفة لمدة ساعتين لجميع مستويات اللياقة.',
    NOW() + INTERVAL '5 days',
    NOW() + INTERVAL '5 days' + INTERVAL '2 hours',
    'Fit Zone Gym - Main Hall',
    'جيم فيت زون - القاعة الرئيسية',
    'Riyadh', 'SA', 24.7136, 46.6753,
    30, FALSE,
    'male', FALSE,
    TRUE, FALSE
  ),
  (
    'evt-00001-000-0000-000000000003',
    'usr-organ-0000-0000-000000000003',
    'cat-0001-0000-0000-000000000003',
    'Arabic Coffee & Conversation',
    'قهوة عربية وحوارات',
    'Join us for a relaxed evening of Arabic coffee, dates, and stimulating conversation.',
    'انضم إلينا لأمسية هادئة من القهوة العربية والتمور والحوارات الممتعة.',
    NOW() + INTERVAL '7 days',
    NOW() + INTERVAL '7 days' + INTERVAL '2 hours',
    'The Cafe Hub',
    'كافيه هاب',
    'Jeddah', 'SA', 21.5433, 39.1728,
    50, TRUE,
    'mixed', TRUE,
    TRUE, FALSE
  ),
  (
    'evt-00001-000-0000-000000000004',
    'usr-organ-0000-0000-000000000003',
    'cat-0001-0000-0000-000000000006',
    'Tech Talk: AI in Saudi Arabia',
    'حديث تقني: الذكاء الاصطناعي في المملكة',
    'Monthly tech meetup discussing AI advancements and opportunities in the region.',
    'لقاء تقني شهري لمناقشة تطورات الذكاء الاصطناعي والفرص في المنطقة.',
    NOW() + INTERVAL '10 days',
    NOW() + INTERVAL '10 days' + INTERVAL '3 hours',
    'The Cafe Hub - Conference Room',
    'كافيه هاب - غرفة المؤتمرات',
    'Jeddah', 'SA', 21.5433, 39.1728,
    NULL, TRUE,
    'mixed', FALSE,
    TRUE, FALSE
  )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------
-- SAMPLE BOOKINGS
-- ----------------------------------------------------------
INSERT INTO bookings (user_id, event_id, status) VALUES
  ('usr-user1-0000-0000-000000000004', 'evt-00001-000-0000-000000000001', 'confirmed'),
  ('usr-user2-0000-0000-000000000005', 'evt-00001-000-0000-000000000003', 'confirmed'),
  ('usr-user2-0000-0000-000000000005', 'evt-00001-000-0000-000000000004', 'confirmed')
ON CONFLICT (user_id, event_id) DO NOTHING;

-- ----------------------------------------------------------
-- SAMPLE COMMENTS
-- ----------------------------------------------------------
INSERT INTO comments (id, user_id, event_id, content) VALUES
  (
    'cmt-00001-000-0000-000000000001',
    'usr-user1-0000-0000-000000000004',
    'evt-00001-000-0000-000000000001',
    'Looking forward to this session! Will there be mats provided?'
  ),
  (
    'cmt-00001-000-0000-000000000002',
    'usr-organ-0000-0000-000000000002',
    'evt-00001-000-0000-000000000001',
    'Yes, all equipment is provided. Just bring comfortable clothes!'
  ),
  (
    'cmt-00001-000-0000-000000000003',
    'usr-user2-0000-0000-000000000005',
    'evt-00001-000-0000-000000000003',
    'هل ستكون هناك قهوة خاصة من المزارع السعودية؟ 😊'
  )
ON CONFLICT (id) DO NOTHING;

-- Reply to first comment
INSERT INTO comments (user_id, event_id, parent_id, content, mentions) VALUES
  (
    'usr-user2-0000-0000-000000000005',
    'evt-00001-000-0000-000000000001',
    'cmt-00001-000-0000-000000000001',
    '@Sara Al-Harbi I heard they also provide towels!',
    ARRAY['usr-user1-0000-0000-000000000004']::UUID[]
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- SAMPLE TIP
-- ----------------------------------------------------------
INSERT INTO tips (user_id, event_id, organizer_id, amount, message, is_simulated) VALUES
  (
    'usr-user2-0000-0000-000000000005',
    'evt-00001-000-0000-000000000003',
    'usr-organ-0000-0000-000000000003',
    25.00,
    'Great event, keep it up! 🙏',
    TRUE
  )
ON CONFLICT DO NOTHING;
