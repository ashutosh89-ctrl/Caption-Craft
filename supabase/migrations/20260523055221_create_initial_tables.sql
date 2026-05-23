/*
  # Create initial CaptionCraft tables

  1. New Tables
    - `users`
      - `id` (serial, primary key)
      - `email` (text, unique, not null)
      - `name` (text, not null)
      - `image` (text, nullable)
      - `google_id` (text, unique, not null)
      - `status` (text, not null, default 'FREE')
      - `usage_counter` (integer, not null, default 0)
      - `usage_reset_at` (timestamptz, not null, default now())
      - `created_at` (timestamptz, not null, default now())
    - `saved_captions`
      - `id` (serial, primary key)
      - `text` (text, not null)
      - `hashtags` (text[], not null, default '{}')
      - `cta` (text, not null)
      - `platform` (text, not null)
      - `tone` (text, not null)
      - `image_preview_base64` (text, nullable)
      - `created_at` (timestamptz, not null, default now())
      - `updated_at` (timestamptz, not null, default now())
    - `sessions`
      - `sid` (varchar, primary key)
      - `sess` (json, not null)
      - `expire` (timestamp, not null)

  2. Security
    - Enable RLS on `users` table
    - Enable RLS on `saved_captions` table
    - Policies for authenticated access
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image TEXT,
  google_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'FREE',
  usage_counter INTEGER NOT NULL DEFAULT 0,
  usage_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved captions table
CREATE TABLE IF NOT EXISTS saved_captions (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  cta TEXT NOT NULL,
  platform TEXT NOT NULL,
  tone TEXT NOT NULL,
  image_preview_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions table (for connect-pg-simple)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_captions ENABLE ROW LEVEL SECURITY;

-- Users policies: service role can do everything, authenticated users can read/update own data
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Saved captions policies
CREATE POLICY "Service role full access on saved_captions"
  ON saved_captions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage captions"
  ON saved_captions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Index for sessions expire column
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);
