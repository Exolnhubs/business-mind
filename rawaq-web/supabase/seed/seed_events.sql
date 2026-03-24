-- ============================================================
-- DEMO EVENTS SEED  (development / testing only)
-- Covers 10 Arab countries with diverse categories.
--
-- PREREQUISITES:
--   1. Run seed.sql first (event_categories must exist).
--   2. Create at least one organizer user through the app or
--      Supabase Dashboard → Authentication → Users → Add user,
--      then set their profile role to 'organizer'.
--
-- Run with the service-role key:
--   supabase db reset   OR
--   psql $DATABASE_URL -f seed_events.sql
-- ============================================================

DO $$
DECLARE
  org1  uuid;
  org2  uuid;

  -- Category UUIDs from seed.sql
  cat_sports    uuid := 'c0000001-0000-0000-0000-000000000001';
  cat_arts      uuid := 'c0000001-0000-0000-0000-000000000002';
  cat_food      uuid := 'c0000001-0000-0000-0000-000000000003';
  cat_business  uuid := 'c0000001-0000-0000-0000-000000000004';
  cat_music     uuid := 'c0000001-0000-0000-0000-000000000005';
  cat_education uuid := 'c0000001-0000-0000-0000-000000000006';
  cat_family    uuid := 'c0000001-0000-0000-0000-000000000007';
  cat_outdoor   uuid := 'c0000001-0000-0000-0000-000000000008';
  cat_tech      uuid := 'c0000001-0000-0000-0000-000000000009';
  cat_health    uuid := 'c0000001-0000-0000-0000-000000000010';
BEGIN
  -- Pick up to two organizers from the profiles table
  SELECT id INTO org1 FROM profiles WHERE role = 'organizer' ORDER BY created_at LIMIT 1;
  SELECT id INTO org2 FROM profiles WHERE role = 'organizer' ORDER BY created_at OFFSET 1 LIMIT 1;

  IF org1 IS NULL THEN
    RAISE EXCEPTION
      'No organizer profiles found. '
      'Create at least one organizer through the app first.';
  END IF;

  -- If only one organizer exists, both variables point to them
  IF org2 IS NULL THEN org2 := org1; END IF;

  -- ----------------------------------------------------------
  -- SAUDI ARABIA
  -- ----------------------------------------------------------
  INSERT INTO events (
    id, organizer_id, category_id,
    title, title_ar,
    description, description_ar,
    venue_name, city, country,
    start_at, end_at,
    capacity, is_free, price, currency,
    gender_restriction, is_family_friendly, is_published
  ) VALUES

  -- Riyadh
  (gen_random_uuid(), org1, cat_tech,
   'Saudi Tech Summit 2026', 'قمة التقنية السعودية 2026',
   'A premier gathering of tech leaders, startups, and investors across the Kingdom.',
   'تجمع رائد لقادة التقنية والشركات الناشئة والمستثمرين في المملكة.',
   'King Abdullah Financial District', 'Riyadh', 'SA',
   '2026-05-10 09:00:00+03', '2026-05-10 18:00:00+03',
   800, false, 350, 'SAR', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_music,
   'Riyadh Jazz Night', 'ليلة الجاز في الرياض',
   'Live jazz performances by local and regional artists in an open-air venue.',
   'عروض جاز حية لفنانين محليين وإقليميين في مكان مفتوح.',
   'Boulevard Riyadh City', 'Riyadh', 'SA',
   '2026-06-05 20:00:00+03', '2026-06-05 23:30:00+03',
   500, false, 120, 'SAR', 'mixed', true, true),

  -- Jeddah
  (gen_random_uuid(), org1, cat_food,
   'Jeddah Food Festival', 'مهرجان جدة للطعام',
   'Celebrating the best flavors of the Red Sea coast with local chefs and street food.',
   'احتفاء بأفضل نكهات ساحل البحر الأحمر مع الطهاة المحليين والأطعمة الشعبية.',
   'Al-Hamra Corniche', 'Jeddah', 'SA',
   '2026-04-18 16:00:00+03', '2026-04-18 22:00:00+03',
   2000, true, null, 'SAR', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_sports,
   'Jeddah Marathon 2026', 'ماراثون جدة 2026',
   'Annual half-marathon along the iconic Jeddah waterfront.',
   'ماراثون نصفي سنوي على طول كورنيش جدة الشهير.',
   'King Fahd Fountain Area', 'Jeddah', 'SA',
   '2026-04-25 06:00:00+03', '2026-04-25 11:00:00+03',
   1500, true, null, 'SAR', 'mixed', true, true),

  -- Dammam
  (gen_random_uuid(), org1, cat_business,
   'Eastern Province Business Forum', 'منتدى أعمال المنطقة الشرقية',
   'Connecting entrepreneurs and corporations across the Gulf oil and industrial hub.',
   'ربط رجال الأعمال والشركات عبر مركز النفط والصناعة في الخليج.',
   'Dhahran Expo', 'Dammam', 'SA',
   '2026-05-20 08:30:00+03', '2026-05-20 17:00:00+03',
   600, false, 500, 'SAR', 'mixed', false, true),

  -- ----------------------------------------------------------
  -- UNITED ARAB EMIRATES
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_arts,
   'Dubai Art Week', 'أسبوع دبي للفنون',
   'Contemporary art showcases, gallery tours, and live painting across Dubai.',
   'معارض فن معاصر وجولات في الغاليريهات ورسم حي في أنحاء دبي.',
   'Dubai Design District', 'Dubai', 'AE',
   '2026-04-20 10:00:00+04', '2026-04-20 21:00:00+04',
   null, true, null, 'AED', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_tech,
   'Abu Dhabi AI Conference', 'مؤتمر أبوظبي للذكاء الاصطناعي',
   'Deep dives into AI policy, ethics, and applications shaping the region.',
   'نقاشات معمّقة حول سياسات الذكاء الاصطناعي وأخلاقياته وتطبيقاته في المنطقة.',
   'ADNEC', 'Abu Dhabi', 'AE',
   '2026-06-14 09:00:00+04', '2026-06-15 17:00:00+04',
   1200, false, 800, 'AED', 'mixed', false, true),

  (gen_random_uuid(), org1, cat_outdoor,
   'Dubai Desert Adventure Camp', 'مخيم مغامرات صحراء دبي',
   'Two-day desert camping experience with dune bashing, star-gazing, and falconry.',
   'تجربة تخييم في الصحراء لمدة يومين مع ركوب الكثبان الرملية ومشاهدة النجوم والصقارة.',
   'Al Qudra Desert', 'Dubai', 'AE',
   '2026-05-01 15:00:00+04', '2026-05-03 10:00:00+04',
   80, false, 950, 'AED', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- EGYPT
  -- ----------------------------------------------------------
  (gen_random_uuid(), org2, cat_arts,
   'Cairo International Film Showcase', 'عرض القاهرة الدولي للأفلام',
   'Independent films from across the Arab world screened at historic venues.',
   'أفلام مستقلة من أنحاء العالم العربي تُعرض في أماكن تاريخية.',
   'Cairo Opera House', 'Cairo', 'EG',
   '2026-05-08 18:00:00+02', '2026-05-08 22:00:00+02',
   400, false, 150, 'EGP', 'mixed', true, true),

  (gen_random_uuid(), org1, cat_education,
   'Alexandria Science Fair 2026', 'معرض الإسكندرية للعلوم 2026',
   'Student-led science projects and workshops at the iconic Bibliotheca Alexandrina.',
   'مشاريع علمية وورش عمل بقيادة الطلاب في مكتبة الإسكندرية الشهيرة.',
   'Bibliotheca Alexandrina', 'Alexandria', 'EG',
   '2026-06-20 09:00:00+02', '2026-06-20 17:00:00+02',
   2000, true, null, 'EGP', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_music,
   'Sahara Beats Festival', 'مهرجان نبضات الصحراء',
   'Fusion of traditional Egyptian music and modern beats under the stars.',
   'مزيج من الموسيقى المصرية التقليدية والإيقاعات الحديثة تحت النجوم.',
   'Giza Plateau', 'Giza', 'EG',
   '2026-07-03 20:00:00+02', '2026-07-03 02:00:00+02',
   3000, false, 200, 'EGP', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- JORDAN
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_outdoor,
   'Petra Trail Run', 'سباق تريل بيترا',
   'Scenic trail run through Wadi Rum and the ancient Nabataean city of Petra.',
   'سباق ترايل خلاب عبر وادي رم ومدينة البتراء النبطية الأثرية.',
   'Petra Visitor Centre', 'Aqaba', 'JO',
   '2026-04-30 07:00:00+03', '2026-04-30 14:00:00+03',
   300, false, 35, 'JOD', 'mixed', false, true),

  (gen_random_uuid(), org2, cat_business,
   'Amman Startup Pitch Night', 'ليلة عروض الشركات الناشئة في عمّان',
   'Early-stage startups pitch to investors in one of the region''s fastest-growing tech hubs.',
   'شركات ناشئة في مراحلها المبكرة تعرض أفكارها على المستثمرين في أحد أسرع مراكز التقنية نمواً.',
   'King Hussein Business Park', 'Amman', 'JO',
   '2026-05-27 17:00:00+03', '2026-05-27 21:00:00+03',
   200, true, null, 'JOD', 'mixed', false, true),

  -- ----------------------------------------------------------
  -- KUWAIT
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_family,
   'Kuwait Family Fun Weekend', 'عطلة نهاية الأسبوع العائلية الكويتية',
   'Games, rides, workshops, and cultural performances for all ages.',
   'ألعاب وورش عمل وعروض ثقافية لجميع الأعمار.',
   'Al Shaheed Park', 'Kuwait City', 'KW',
   '2026-04-11 10:00:00+03', '2026-04-11 20:00:00+03',
   5000, true, null, 'KWD', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_health,
   'Kuwait Wellness Expo', 'معرض الكويت للصحة والعافية',
   'Nutrition, fitness, and mental wellness exhibitions with expert talks.',
   'معارض التغذية واللياقة والصحة النفسية مع محاضرات الخبراء.',
   'Kuwait International Fairground', 'Kuwait City', 'KW',
   '2026-06-06 09:00:00+03', '2026-06-07 18:00:00+03',
   1000, false, 15, 'KWD', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- QATAR
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_sports,
   'Doha Sports Fest', 'مهرجان الدوحة الرياضي',
   'Multi-sport event featuring football, padel, swimming, and cycling competitions.',
   'فعالية متعددة الرياضات تتضمن كرة القدم والبادل والسباحة وسباقات الدراجات.',
   'Aspire Zone', 'Doha', 'QA',
   '2026-05-15 08:00:00+03', '2026-05-15 18:00:00+03',
   2500, true, null, 'QAR', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_education,
   'Qatar Learning Summit', 'قمة قطر للتعلم',
   'Innovative education models and EdTech presentations from global leaders.',
   'نماذج تعليمية مبتكرة وعروض تقنيات التعليم من قادة عالميين.',
   'Qatar National Convention Centre', 'Doha', 'QA',
   '2026-07-22 09:00:00+03', '2026-07-23 17:00:00+03',
   700, false, 250, 'QAR', 'mixed', false, true),

  -- ----------------------------------------------------------
  -- BAHRAIN
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_music,
   'Manama Music Nights', 'ليالي موسيقى المنامة',
   'Three-night live music festival spanning classical, jazz, and contemporary genres.',
   'مهرجان موسيقي حي لثلاث ليالٍ يمتد من الكلاسيكية إلى الجاز والمعاصر.',
   'Bahrain Bay Waterfront', 'Manama', 'BH',
   '2026-04-24 19:00:00+03', '2026-04-26 23:00:00+03',
   800, false, 25, 'BHD', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_food,
   'Bahrain Street Food Tour', 'جولة المأكولات الشعبية في البحرين',
   'Guided walking food tour through the heritage heart of Manama souk.',
   'جولة مشي غذائية مرشودة عبر قلب سوق المنامة التراثي.',
   'Bab Al Bahrain', 'Manama', 'BH',
   '2026-05-09 17:00:00+03', '2026-05-09 21:00:00+03',
   60, false, 12, 'BHD', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- OMAN
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_outdoor,
   'Muscat Mountain Hike', 'رحلة تسلق جبال مسقط',
   'Half-day guided hike through the Al Hajar mountain range with stunning views.',
   'رحلة تسلق نصف يوم بقيادة مرشد عبر سلسلة جبال الحجر مع مناظر خلابة.',
   'Al Amerat Park', 'Muscat', 'OM',
   '2026-05-02 06:00:00+04', '2026-05-02 12:00:00+04',
   50, false, 8, 'OMR', 'mixed', false, true),

  (gen_random_uuid(), org2, cat_arts,
   'Oman Craft & Heritage Fair', 'معرض الحرف والتراث العُماني',
   'Traditional Omani craftsmanship, silver jewelry, and textile artisans.',
   'الحرف اليدوية العُمانية التقليدية والمجوهرات الفضية وفنانو النسيج.',
   'Royal Opera House Muscat', 'Muscat', 'OM',
   '2026-06-12 10:00:00+04', '2026-06-13 20:00:00+04',
   null, true, null, 'OMR', 'mixed', true, true),

  (gen_random_uuid(), org1, cat_health,
   'Salalah Wellness Retreat', 'ملتقى الصحة والعافية في صلالة',
   'Yoga, meditation, and holistic health sessions during the khareef monsoon season.',
   'جلسات يوغا وتأمل وصحة شاملة خلال موسم الخريف الموسمي.',
   'Salalah Hilton Resort', 'Salalah', 'OM',
   '2026-08-14 07:00:00+04', '2026-08-14 17:00:00+04',
   100, false, 18, 'OMR', 'female', true, true),

  -- ----------------------------------------------------------
  -- LEBANON
  -- ----------------------------------------------------------
  (gen_random_uuid(), org2, cat_arts,
   'Beirut Art & Culture Night', 'ليلة الفن والثقافة في بيروت',
   'Gallery openings, live art, and cultural discussions across Gemmayzeh.',
   'افتتاحيات غاليريهات وفن حي ونقاشات ثقافية عبر الجميزة.',
   'Gemmayzeh Cultural Quarter', 'Beirut', 'LB',
   '2026-05-22 18:00:00+03', '2026-05-22 23:00:00+03',
   null, true, null, 'USD', 'mixed', true, true),

  (gen_random_uuid(), org1, cat_food,
   'Beirut Gourmet Week', 'أسبوع بيروت للطهي الراقي',
   'Top Beirut chefs collaborate on exclusive tasting menus celebrating Levantine cuisine.',
   'كبار طهاة بيروت يتعاونون على قوائم تذوق حصرية تحتفي بالمطبخ الشامي.',
   'Downtown Beirut', 'Beirut', 'LB',
   '2026-06-02 19:00:00+03', '2026-06-02 22:30:00+03',
   120, false, 75, 'USD', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- MOROCCO
  -- ----------------------------------------------------------
  (gen_random_uuid(), org2, cat_music,
   'Casablanca Music Festival', 'مهرجان الدار البيضاء للموسيقى',
   'Multi-day outdoor music festival celebrating Moroccan and North African artists.',
   'مهرجان موسيقي متعدد الأيام في الهواء الطلق يحتفي بالفنانين المغاربة وشمال أفريقيا.',
   'Anfa Park', 'Casablanca', 'MA',
   '2026-07-10 17:00:00+01', '2026-07-12 23:00:00+01',
   4000, false, 180, 'MAD', 'mixed', true, true),

  (gen_random_uuid(), org1, cat_outdoor,
   'Marrakech Sunset Trek', 'رحلة غروب الشمس في مراكش',
   'Guided sunset hike through the Atlas Mountain foothills with traditional dinner.',
   'رحلة مشي مرشدة عند الغروب عبر سفوح جبال الأطلس مع عشاء تقليدي.',
   'Ourika Valley', 'Marrakech', 'MA',
   '2026-05-03 14:00:00+01', '2026-05-03 21:00:00+01',
   40, false, 380, 'MAD', 'mixed', true, true),

  (gen_random_uuid(), org2, cat_education,
   'Marrakech Entrepreneur Summit', 'قمة مراكش لرواد الأعمال',
   'French-Arabic bilingual startup summit connecting the Maghreb ecosystem.',
   'قمة ثنائية اللغة للشركات الناشئة تربط منظومة المغرب العربي.',
   'Palais des Congrès Marrakech', 'Marrakech', 'MA',
   '2026-09-18 09:00:00+01', '2026-09-19 18:00:00+01',
   500, false, 600, 'MAD', 'mixed', false, true),

  -- ----------------------------------------------------------
  -- TUNISIA
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_tech,
   'Tunis Digital Week', 'أسبوع تونس الرقمي',
   'Hackathons, product demos, and panels on North Africa''s digital transformation.',
   'هاكاثونات وعروض منتجات وجلسات حول التحول الرقمي في شمال أفريقيا.',
   'Cité des Sciences de Tunis', 'Tunis', 'TN',
   '2026-10-05 09:00:00+01', '2026-10-07 18:00:00+01',
   600, false, 90, 'TND', 'mixed', false, true),

  -- ----------------------------------------------------------
  -- IRAQ
  -- ----------------------------------------------------------
  (gen_random_uuid(), org2, cat_education,
   'Baghdad Knowledge Forum', 'منتدى بغداد للمعرفة',
   'Academic and cultural talks celebrating the heritage of the City of Peace.',
   'محاضرات أكاديمية وثقافية تحتفي بتراث مدينة السلام.',
   'Iraqi Museum', 'Baghdad', 'IQ',
   '2026-11-08 10:00:00+03', '2026-11-08 17:00:00+03',
   300, true, null, 'IQD', 'mixed', true, true),

  -- ----------------------------------------------------------
  -- PALESTINE
  -- ----------------------------------------------------------
  (gen_random_uuid(), org1, cat_arts,
   'Ramallah Cultural Festival', 'مهرجان رام الله الثقافي',
   'Theater, poetry, visual arts, and film celebrating Palestinian creative voices.',
   'مسرح وشعر وفنون بصرية وسينما تحتفي بالأصوات الإبداعية الفلسطينية.',
   'Al-Kasaba Theatre', 'Ramallah', 'PS',
   '2026-09-25 17:00:00+03', '2026-09-25 22:00:00+03',
   250, true, null, 'USD', 'mixed', true, true)

  ON CONFLICT DO NOTHING;

END $$;
