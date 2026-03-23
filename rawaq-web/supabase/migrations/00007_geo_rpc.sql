-- ============================================================
-- GEO RPC: events within radius
-- Called from API: supabase.rpc('events_within_radius', {...})
-- ============================================================

CREATE OR REPLACE FUNCTION events_within_radius(
  user_lat      DOUBLE PRECISION,
  user_lng      DOUBLE PRECISION,
  radius_meters INT
)
RETURNS TABLE (id UUID, distance_meters DOUBLE PRECISION)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    ST_Distance(
      e.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::GEOGRAPHY
    ) AS distance_meters
  FROM events e
  WHERE
    e.location IS NOT NULL
    AND e.is_published = TRUE
    AND e.is_cancelled = FALSE
    AND ST_DWithin(
      e.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::GEOGRAPHY,
      radius_meters
    )
  ORDER BY distance_meters ASC;
$$;
