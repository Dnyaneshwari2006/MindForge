-- =============================================
-- MindForge — Supabase Database Schema (Auth Ready)
-- Run this in your Supabase SQL Editor
-- =============================================

-- Step 1. Add user_id column if it doesn't exist to existing tables
ALTER TABLE IF EXISTS events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS scores ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS daily_habits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS ramp ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS session_sites ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS tab_analytics ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE IF EXISTS content_preferences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Step 2. Create tables (if starting fresh)
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  source TEXT,
  app TEXT,
  url TEXT,
  category TEXT,
  is_idle BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS scores (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  score INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  start_time BIGINT,
  end_time BIGINT,
  goal TEXT,
  avg_score INTEGER,
  deep_work_minutes INTEGER,
  productive_sec INTEGER DEFAULT 0,
  distraction_sec INTEGER DEFAULT 0,
  browser_sec INTEGER DEFAULT 0,
  neutral_sec INTEGER DEFAULT 0,
  idle_sec INTEGER DEFAULT 0,
  text_sec INTEGER DEFAULT 0,
  video_sec INTEGER DEFAULT 0,
  interactive_sec INTEGER DEFAULT 0,
  audio_sec INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_habits (
  date TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  read_done BOOLEAN DEFAULT FALSE,
  meditation_done BOOLEAN DEFAULT FALSE,
  session_done BOOLEAN DEFAULT FALSE,
  streak_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ramp (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  date TEXT,
  target_minutes INTEGER DEFAULT 20,
  achieved INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS session_sites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'neutral',
  content_type TEXT NOT NULL DEFAULT 'text',
  active_seconds INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 1,
  date TEXT NOT NULL,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS tab_analytics (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT,
  hostname TEXT,
  url TEXT,
  category TEXT,
  content_type TEXT,
  active_seconds INTEGER,
  timestamp BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS content_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  date TEXT,
  text_seconds INTEGER DEFAULT 0,
  video_seconds INTEGER DEFAULT 0,
  interactive_seconds INTEGER DEFAULT 0,
  audio_seconds INTEGER DEFAULT 0,
  total_productive_seconds INTEGER DEFAULT 0,
  total_distraction_seconds INTEGER DEFAULT 0,
  total_neutral_seconds INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  color TEXT,
  target_minutes INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_streak_date TEXT
);

CREATE TABLE IF NOT EXISTS tag_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  minutes_logged INTEGER,
  date TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
CREATE INDEX IF NOT EXISTS idx_scores_timestamp ON scores (timestamp);
CREATE INDEX IF NOT EXISTS idx_ramp_date ON ramp (date);
CREATE INDEX IF NOT EXISTS idx_session_sites_session ON session_sites (session_id);
CREATE INDEX IF NOT EXISTS idx_session_sites_hostname ON session_sites (hostname);
CREATE INDEX IF NOT EXISTS idx_session_sites_date ON session_sites (date);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_timestamp ON tab_analytics (timestamp);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_category ON tab_analytics (category);
CREATE INDEX IF NOT EXISTS idx_tab_analytics_session ON tab_analytics (session_id);
CREATE INDEX IF NOT EXISTS idx_content_preferences_date ON content_preferences (date);
CREATE INDEX IF NOT EXISTS idx_tag_sessions_date ON tag_sessions (date);
CREATE INDEX IF NOT EXISTS idx_tag_sessions_tag_id ON tag_sessions (tag_id);

-- =============================================
-- Row Level Security (RLS)
-- Secure user data by ensuring users can only read/write their own records
-- =============================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramp ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_sessions ENABLE ROW LEVEL SECURITY;

-- Drop old "allow all" policies safely if they exist
DROP POLICY IF EXISTS "Allow all on events" ON events;
DROP POLICY IF EXISTS "Allow all on scores" ON scores;
DROP POLICY IF EXISTS "Allow all on sessions" ON sessions;
DROP POLICY IF EXISTS "Allow all on daily_habits" ON daily_habits;
DROP POLICY IF EXISTS "Allow all on ramp" ON ramp;
DROP POLICY IF EXISTS "Allow all on session_sites" ON session_sites;
DROP POLICY IF EXISTS "Allow all on tab_analytics" ON tab_analytics;
DROP POLICY IF EXISTS "Allow all on content_preferences" ON content_preferences;

-- Create authenticated user policies
CREATE POLICY "Users can manage events" ON events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage scores" ON scores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage sessions" ON sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage daily_habits" ON daily_habits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage ramp" ON ramp FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage session_sites" ON session_sites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage tab_analytics" ON tab_analytics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage content_preferences" ON content_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage tags" ON tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage tag_sessions" ON tag_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Focus Rooms
-- =============================================

CREATE TABLE IF NOT EXISTS focus_rooms (
  id TEXT PRIMARY KEY,                    -- 6-char room code
  name TEXT NOT NULL,                     -- user-chosen room name
  created_by UUID REFERENCES auth.users(id),
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS focus_room_members (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES focus_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  status TEXT DEFAULT 'focused',          -- 'focused' | 'distracted' | 'break'
  score INTEGER DEFAULT 0,
  joined_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_focus_room_members_room ON focus_room_members (room_id);
CREATE INDEX IF NOT EXISTS idx_focus_room_members_user ON focus_room_members (user_id);

ALTER TABLE focus_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_room_members ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see rooms (needed to join by code)
CREATE POLICY "Authenticated users can read rooms" ON focus_rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can create rooms" ON focus_rooms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Room creators can delete rooms" ON focus_rooms FOR DELETE USING (auth.uid() = created_by);

-- Members: anyone authenticated can read (to see room members), users manage their own rows
CREATE POLICY "Authenticated users can read members" ON focus_room_members FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can join rooms" ON focus_room_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own status" ON focus_room_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON focus_room_members FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- Eisenhower Matrix Tasks
-- =============================================

CREATE TABLE IF NOT EXISTS eisenhower_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  quadrant TEXT NOT NULL DEFAULT 'inbox',
  completed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  google_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eisenhower_tasks_user ON eisenhower_tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_eisenhower_tasks_quadrant ON eisenhower_tasks (quadrant);

ALTER TABLE eisenhower_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage tasks" ON eisenhower_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================
-- Email Reports (Daily Focus Reports)
-- =============================================

CREATE TABLE IF NOT EXISTS email_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent'  -- 'sent' | 'failed'
);

CREATE INDEX IF NOT EXISTS idx_email_reports_user ON email_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_email_reports_sent_at ON email_reports (sent_at);

ALTER TABLE email_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage email_reports" ON email_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
