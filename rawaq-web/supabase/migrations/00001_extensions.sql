-- Enable required PostgreSQL extensions
-- uuid-ossp not needed: using gen_random_uuid() (built-in since PG 13)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- accent-insensitive search
CREATE EXTENSION IF NOT EXISTS "postgis";       -- geo queries (lat/lng)
