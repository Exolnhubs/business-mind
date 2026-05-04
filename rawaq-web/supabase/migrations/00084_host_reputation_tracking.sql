CREATE OR REPLACE FUNCTION refresh_host_avg_rating(host_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE organizer_profiles
  SET avg_rating = (
    SELECT ROUND(AVG(rating)::NUMERIC, 2)
    FROM user_reviews
    WHERE reviewed_id = host_user_id
  )
  WHERE user_id = host_user_id
    AND organizer_type = 'individual';
END;
$$;
