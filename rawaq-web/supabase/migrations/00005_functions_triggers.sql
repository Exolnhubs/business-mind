-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- ----------------------------------------------------------
-- Auto-create profile on user sign-up
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    -- Three-level fallback: metadata → email prefix → 'User'
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(split_part(NEW.email, '@', 1), ''),
      'User'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role)
  )
  ON CONFLICT (id) DO NOTHING;   -- seed may have pre-inserted the profile
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------
-- Auto-update updated_at columns
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_organizer_profiles_updated_at
  BEFORE UPDATE ON organizer_profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_device_tokens_updated_at
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------
-- Sync location geography column from lat/lng
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_event_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::GEOGRAPHY;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_sync_location
  BEFORE INSERT OR UPDATE OF lat, lng ON events
  FOR EACH ROW EXECUTE FUNCTION sync_event_location();

-- ----------------------------------------------------------
-- Maintain bookings_count on events (denormalized counter)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_event_bookings_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' THEN
    UPDATE events SET bookings_count = bookings_count + 1 WHERE id = NEW.event_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- confirmed -> other
    IF OLD.status = 'confirmed' AND NEW.status != 'confirmed' THEN
      UPDATE events SET bookings_count = GREATEST(bookings_count - 1, 0) WHERE id = NEW.event_id;
    -- other -> confirmed
    ELSIF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
      UPDATE events SET bookings_count = bookings_count + 1 WHERE id = NEW.event_id;
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD.status = 'confirmed' THEN
    UPDATE events SET bookings_count = GREATEST(bookings_count - 1, 0) WHERE id = OLD.event_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_booking_count
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_event_bookings_count();

-- ----------------------------------------------------------
-- Maintain tips_total on events (denormalized)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_event_tips_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE events SET tips_total = tips_total + NEW.amount WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE events SET tips_total = GREATEST(tips_total - OLD.amount, 0) WHERE id = OLD.event_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_tips_total
  AFTER INSERT OR DELETE ON tips
  FOR EACH ROW EXECUTE FUNCTION update_event_tips_total();

-- ----------------------------------------------------------
-- Maintain views_count on events
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION update_event_views_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE events SET views_count = views_count + 1 WHERE id = NEW.event_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_views_count
  AFTER INSERT ON event_views
  FOR EACH ROW EXECUTE FUNCTION update_event_views_count();

-- ----------------------------------------------------------
-- Capacity guard: prevent overbooking
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION check_event_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity   INT;
  v_booked     INT;
BEGIN
  -- Only enforce on new confirmed bookings
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity FROM events WHERE id = NEW.event_id;

  -- NULL capacity = unlimited
  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT bookings_count INTO v_booked FROM events WHERE id = NEW.event_id;

  IF v_booked >= v_capacity THEN
    RAISE EXCEPTION 'Event is fully booked (capacity: %)', v_capacity
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_capacity
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_event_capacity();

-- ----------------------------------------------------------
-- Prevent duplicate active bookings
-- (UNIQUE constraint covers this, but trigger gives a
--  friendlier error and handles cancelled re-bookings)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION check_duplicate_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_status booking_status;
BEGIN
  SELECT status INTO existing_status
  FROM bookings
  WHERE user_id = NEW.user_id AND event_id = NEW.event_id;

  IF FOUND AND existing_status = 'confirmed' THEN
    RAISE EXCEPTION 'User already has an active booking for this event'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_duplicate_booking
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_booking();

-- ----------------------------------------------------------
-- Helper: get user role from auth context
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ----------------------------------------------------------
-- Helper: check if current user is admin
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
