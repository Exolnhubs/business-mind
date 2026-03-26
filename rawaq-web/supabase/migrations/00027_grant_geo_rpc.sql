-- Grant EXECUTE on the geo RPC to all Supabase client roles.
-- SQL functions created without SECURITY DEFINER run as the caller's
-- role; without an explicit GRANT the anon role (unauthenticated mobile
-- users) receives a permission-denied error that silently returns no rows.

GRANT EXECUTE ON FUNCTION events_within_radius(double precision, double precision, int)
  TO anon, authenticated;
