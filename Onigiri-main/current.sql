-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.content_preferences (
  id bigint NOT NULL DEFAULT nextval('content_preferences_id_seq'::regclass),
  date text,
  text_seconds integer DEFAULT 0,
  video_seconds integer DEFAULT 0,
  interactive_seconds integer DEFAULT 0,
  audio_seconds integer DEFAULT 0,
  total_productive_seconds integer DEFAULT 0,
  total_distraction_seconds integer DEFAULT 0,
  total_neutral_seconds integer DEFAULT 0,
  user_id uuid,
  CONSTRAINT content_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT content_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.daily_habits (
  date text NOT NULL,
  read_done boolean DEFAULT false,
  meditation_done boolean DEFAULT false,
  session_done boolean DEFAULT false,
  streak_count integer DEFAULT 0,
  user_id uuid,
  CONSTRAINT daily_habits_pkey PRIMARY KEY (date),
  CONSTRAINT daily_habits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.events (
  id bigint NOT NULL DEFAULT nextval('events_id_seq'::regclass),
  timestamp bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  source text,
  app text,
  url text,
  category text,
  is_idle boolean DEFAULT false,
  user_id uuid,
  CONSTRAINT events_pkey PRIMARY KEY (id),
  CONSTRAINT events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.focus_room_members (
  id bigint NOT NULL DEFAULT nextval('focus_room_members_id_seq'::regclass),
  room_id text NOT NULL,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  status text DEFAULT 'focused'::text,
  score integer DEFAULT 0,
  joined_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  CONSTRAINT focus_room_members_pkey PRIMARY KEY (id),
  CONSTRAINT focus_room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.focus_rooms(id),
  CONSTRAINT focus_room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.focus_rooms (
  id text NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at bigint DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  CONSTRAINT focus_rooms_pkey PRIMARY KEY (id),
  CONSTRAINT focus_rooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.ramp (
  id bigint NOT NULL DEFAULT nextval('ramp_id_seq'::regclass),
  date text,
  target_minutes integer DEFAULT 20,
  achieved integer DEFAULT 0,
  success boolean DEFAULT false,
  user_id uuid,
  CONSTRAINT ramp_pkey PRIMARY KEY (id),
  CONSTRAINT ramp_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.scores (
  id bigint NOT NULL DEFAULT nextval('scores_id_seq'::regclass),
  timestamp bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  score integer NOT NULL,
  user_id uuid,
  CONSTRAINT scores_pkey PRIMARY KEY (id),
  CONSTRAINT scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.session_sites (
  id bigint NOT NULL DEFAULT nextval('session_sites_id_seq'::regclass),
  session_id text NOT NULL,
  hostname text NOT NULL,
  category text NOT NULL DEFAULT 'neutral'::text,
  content_type text NOT NULL DEFAULT 'text'::text,
  active_seconds integer NOT NULL DEFAULT 0,
  visits integer NOT NULL DEFAULT 1,
  date text NOT NULL,
  timestamp bigint NOT NULL DEFAULT ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint,
  user_id uuid,
  CONSTRAINT session_sites_pkey PRIMARY KEY (id),
  CONSTRAINT session_sites_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT session_sites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.sessions (
  id text NOT NULL,
  start_time bigint,
  end_time bigint,
  goal text,
  avg_score integer,
  deep_work_minutes integer,
  productive_sec integer DEFAULT 0,
  distraction_sec integer DEFAULT 0,
  browser_sec integer DEFAULT 0,
  neutral_sec integer DEFAULT 0,
  idle_sec integer DEFAULT 0,
  text_sec integer DEFAULT 0,
  video_sec integer DEFAULT 0,
  interactive_sec integer DEFAULT 0,
  audio_sec integer DEFAULT 0,
  browser_productive_sec integer DEFAULT 0,
  browser_distraction_sec integer DEFAULT 0,
  user_id uuid,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tab_analytics (
  id bigint NOT NULL DEFAULT nextval('tab_analytics_id_seq'::regclass),
  session_id text,
  hostname text,
  url text,
  category text,
  content_type text,
  active_seconds integer,
  timestamp bigint,
  user_id uuid,
  CONSTRAINT tab_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT tab_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  color text,
  target_minutes integer NOT NULL,
  target_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  current_streak integer DEFAULT 0,
  longest_streak integer DEFAULT 0,
  last_streak_date text,
  CONSTRAINT tags_pkey PRIMARY KEY (id),
  CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tag_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  tag_id uuid,
  session_id text,
  minutes_logged integer,
  date text NOT NULL,
  CONSTRAINT tag_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT tag_sessions_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE,
  CONSTRAINT tag_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE,
  CONSTRAINT tag_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);