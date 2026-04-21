const { createClient } = require('@supabase/supabase-js');

let supabase = null;
let currentUserId = null;

/**
 * Initialize Supabase client
 */
function initDB() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key || url === 'your_supabase_url_here') {
    console.error('[DB] Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    return false;
  }

  supabase = createClient(url, key);
  console.log('[DB] Supabase client initialized');
  return true;
}

/**
 * Re-initialize Supabase client with authenticated session.
 * This makes RLS work — the JWT carries the user's uid.
 */
function setAuthSession(accessToken, refreshToken) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  supabase = createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // Decode user ID from JWT payload
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    currentUserId = payload.sub || null;
    console.log(`[DB] Auth session set for user: ${currentUserId}`);
  } catch (e) {
    console.warn('[DB] Could not decode JWT:', e.message);
  }
}

/**
 * Get the current authenticated user's ID
 */
function getUserId() {
  return currentUserId;
}

/**
 * Get the Supabase client instance
 */
function getDB() {
  return supabase;
}

/**
 * Insert a tracking event
 */
async function insertEvent(source, appName, url, category, isIdle = false) {
  const { error } = await supabase.from('events').insert({
    timestamp: Date.now(),
    source,
    app: appName,
    url: url || null,
    category: category || 'neutral',
    is_idle: isIdle,
    user_id: currentUserId,
  });
  if (error) console.error('[DB] insertEvent error:', error.message);
}

/**
 * Get events from last N seconds
 */
async function getRecentEvents(seconds = 30) {
  const since = Date.now() - seconds * 1000;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('[DB] getRecentEvents error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Insert a computed focus score
 */
async function insertScore(score) {
  const { error } = await supabase.from('scores').insert({
    timestamp: Date.now(),
    score,
    user_id: currentUserId,
  });
  if (error) console.error('[DB] insertScore error:', error.message);
}

/**
 * Get heatmap data: 365-day contribution grid (LeetCode/GitHub style).
 * Returns [{date, avg_score, count}] for the last year.
 */
async function getHeatmapData() {
  const since = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('scores')
    .select('timestamp, score')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('[DB] getHeatmapData error:', error.message);
    return [];
  }

  // Group by date string (YYYY-MM-DD)
  const buckets = {};
  (data || []).forEach((row) => {
    const dateStr = new Date(row.timestamp).toISOString().slice(0, 10);
    if (!buckets[dateStr]) buckets[dateStr] = { date: dateStr, scores: [] };
    buckets[dateStr].scores.push(row.score);
  });

  return Object.values(buckets).map((b) => ({
    date: b.date,
    avg_score: Math.round(b.scores.reduce((a, c) => a + c, 0) / b.scores.length),
    count: b.scores.length,
  }));
}

/**
 * Get detailed per-hostname tab analytics for the last N days.
 * For each hostname: total_seconds, productive_seconds, distraction_seconds, neutral_seconds, visits.
 */
async function getDetailedTabAnalytics(days = 7) {
  if (!supabase) return [];

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sinceTs = Date.now() - days * 24 * 60 * 60 * 1000;

  // Query BOTH tables and merge
  const [sessionSitesRes, tabAnalyticsRes] = await Promise.allSettled([
    supabase.from('session_sites').select('hostname, category, active_seconds, visits').gte('date', sinceDate),
    supabase.from('tab_analytics').select('hostname, category, active_seconds').gte('timestamp', sinceTs),
  ]);

  // Aggregate by hostname
  const hostMap = {};

  function addRow(hostname, category, seconds, visits) {
    if (!hostname) return;
    const h = hostname.replace(/^www\./, '');
    if (!hostMap[h]) hostMap[h] = { hostname: h, total_seconds: 0, productive_seconds: 0, distraction_seconds: 0, neutral_seconds: 0, visits: 0 };
    const sec = seconds || 0;
    hostMap[h].total_seconds += sec;
    hostMap[h].visits += visits || 0;
    const cat = (category || 'neutral').toLowerCase();
    if (cat === 'productive') hostMap[h].productive_seconds += sec;
    else if (cat === 'distraction') hostMap[h].distraction_seconds += sec;
    else hostMap[h].neutral_seconds += sec;
  }

  // Merge session_sites data
  if (sessionSitesRes.status === 'fulfilled' && sessionSitesRes.value.data) {
    sessionSitesRes.value.data.forEach(row => addRow(row.hostname, row.category, row.active_seconds, row.visits));
  }

  // Merge tab_analytics data (visits counted as 1 per row since it doesn't have a visits column)
  if (tabAnalyticsRes.status === 'fulfilled' && tabAnalyticsRes.value.data) {
    tabAnalyticsRes.value.data.forEach(row => addRow(row.hostname, row.category, row.active_seconds, 1));
  }

  return Object.values(hostMap).sort((a, b) => b.total_seconds - a.total_seconds);
}

/**
 * Get dashboard overview stats for a given range.
 * @param {'day'|'week'|'month'} range
 */
async function getDashboardStats(range = 'week') {
  if (!supabase) return {};

  const daysMap = { day: 1, week: 7, month: 30 };
  const days = daysMap[range] || 7;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Sessions in range
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, goal, avg_score, deep_work_minutes, productive_sec, distraction_sec, neutral_sec, start_time, end_time')
    .gte('start_time', since)
    .order('start_time', { ascending: true });

  const sess = sessions || [];
  const totalSessions = sess.length;
  const totalDeepWorkMin = sess.reduce((s, r) => s + (r.deep_work_minutes || 0), 0);
  const scoresArr = sess.filter(s => s.avg_score).map(s => s.avg_score);
  const avgFocusScore = scoresArr.length > 0 ? Math.round(scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length) : 0;
  const totalProductiveSec = sess.reduce((s, r) => s + (r.productive_sec || 0), 0);
  const totalDistractionSec = sess.reduce((s, r) => s + (r.distraction_sec || 0), 0);
  const totalNeutralSec = sess.reduce((s, r) => s + (r.neutral_sec || 0), 0);

  // Daily breakdown for charts
  const dailyMap = {};
  sess.forEach(s => {
    const day = new Date(s.start_time).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { date: day, sessions: 0, deepWork: 0, totalScore: 0, scoreCount: 0 };
    dailyMap[day].sessions += 1;
    dailyMap[day].deepWork += s.deep_work_minutes || 0;
    if (s.avg_score) { dailyMap[day].totalScore += s.avg_score; dailyMap[day].scoreCount += 1; }
  });
  const dailyStats = Object.values(dailyMap).map(d => ({
    date: d.date, sessions: d.sessions, deepWork: d.deepWork,
    avgScore: d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : 0,
  }));

  // Streak
  const { data: habits } = await supabase
    .from('daily_habits')
    .select('streak_count')
    .order('date', { ascending: false })
    .limit(1);
  const currentStreak = habits && habits.length > 0 ? (habits[0].streak_count || 0) : 0;

  return {
    avgFocusScore, totalSessions, totalDeepWorkMin,
    totalProductiveSec, totalDistractionSec, totalNeutralSec,
    currentStreak, dailyStats,
  };
}

/**
 * Get paginated session history.
 */
async function getSessionHistory(limit = 20, offset = 0) {
  if (!supabase) return { sessions: [], total: 0 };

  const { data, error, count } = await supabase
    .from('sessions')
    .select('id, goal, avg_score, deep_work_minutes, start_time, end_time, productive_sec, distraction_sec, neutral_sec', { count: 'exact' })
    .order('start_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[DB] getSessionHistory error:', error.message);
    return { sessions: [], total: 0 };
  }
  return { sessions: data || [], total: count || 0 };
}

/**
 * Get deep work ramp data
 */
async function getDeepWorkRamp() {
  const today = new Date().toISOString().slice(0, 10);

  // Get today's ramp
  const { data: todayRamp } = await supabase
    .from('ramp')
    .select('*')
    .eq('date', today)
    .single();

  // Get last 7 days history
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: history } = await supabase
    .from('ramp')
    .select('*')
    .gte('date', weekAgo)
    .order('date', { ascending: true });

  return {
    current_target: todayRamp?.target_minutes || 20,
    today_best: todayRamp?.achieved || 0,
    history: history || [],
  };
}

/**
 * Get focus debt in minutes
 */
async function getFocusDebt() {
  // Debt = sum of interrupted session minutes from yesterday
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startOfYesterday = new Date(yesterday).getTime();
  const endOfYesterday = startOfYesterday + 24 * 60 * 60 * 1000;

  const { data } = await supabase
    .from('sessions')
    .select('deep_work_minutes, avg_score')
    .gte('start_time', startOfYesterday)
    .lt('start_time', endOfYesterday);

  let debtMinutes = 0;
  (data || []).forEach((s) => {
    if (s.avg_score < 50) {
      debtMinutes += Math.max(0, 30 - (s.deep_work_minutes || 0));
    }
  });

  return { debt_minutes: debtMinutes };
}

/**
 * Get daily habits for a specific date
 */
async function getDailyHabits(date) {
  const { data, error } = await supabase
    .from('daily_habits')
    .select('*')
    .eq('date', date)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] getDailyHabits error:', error.message);
  }

  return data || {
    date,
    read_done: false,
    meditation_done: false,
    session_done: false,
    streak_count: 0,
  };
}

/**
 * Update a habit completion status
 */
async function updateHabit(date, habit, done) {
  const columnMap = {
    read: 'read_done',
    meditation: 'meditation_done',
    session: 'session_done',
  };
  const column = columnMap[habit];
  if (!column) return;

  // Upsert: insert if not exists, update if exists
  const existing = await getDailyHabits(date);
  const updateData = { ...existing, date, [column]: done, user_id: currentUserId };

  const { error } = await supabase
    .from('daily_habits')
    .upsert(updateData, { onConflict: 'date' });

  if (error) console.error('[DB] updateHabit error:', error.message);

  // Update streak
  await updateStreak(date);
}

/**
 * Calculate and update streak count
 */
async function updateStreak(date) {
  let streak = 0;
  let checkDate = new Date(date);

  while (true) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('daily_habits')
      .select('read_done, meditation_done, session_done')
      .eq('date', dateStr)
      .single();

    if (data && (data.read_done || data.meditation_done || data.session_done)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  await supabase
    .from('daily_habits')
    .update({ streak_count: streak })
    .eq('date', date);
}

// ═══════════════════════════════════════
//  ANALYTICS FUNCTIONS (NEW)
// ═══════════════════════════════════════

/**
 * Batch insert per-tab analytics data
 */
async function insertTabAnalytics(entries) {
  if (!supabase || !entries || entries.length === 0) return;

  const rows = entries.map(e => ({ ...e, user_id: currentUserId }));
  const { error } = await supabase.from('tab_analytics').insert(rows);
  if (error) console.error('[DB] insertTabAnalytics error:', error.message);
}

/**
 * Get content type preferences for the last N days
 */
async function getContentPreferences(days = 7) {
  if (!supabase) return { text: 0, video: 0, interactive: 0, audio: 0 };

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('tab_analytics')
    .select('content_type, active_seconds')
    .gte('timestamp', since);

  if (error) {
    console.error('[DB] getContentPreferences error:', error.message);
    return { text: 0, video: 0, interactive: 0, audio: 0 };
  }

  const prefs = { text: 0, video: 0, interactive: 0, audio: 0 };
  (data || []).forEach(row => {
    const ct = row.content_type || 'text';
    prefs[ct] = (prefs[ct] || 0) + (row.active_seconds || 0);
  });

  return prefs;
}

/**
 * Get time breakdown by category for the last N days
 */
async function getTimeBreakdownDB(days = 7) {
  if (!supabase) return { productive: 0, distraction: 0, neutral: 0 };

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const { data, error } = await supabase
    .from('tab_analytics')
    .select('category, active_seconds')
    .gte('timestamp', since);

  if (error) {
    console.error('[DB] getTimeBreakdownDB error:', error.message);
    return { productive: 0, distraction: 0, neutral: 0 };
  }

  const breakdown = { productive: 0, distraction: 0, neutral: 0 };
  (data || []).forEach(row => {
    const cat = row.category || 'neutral';
    breakdown[cat] = (breakdown[cat] || 0) + (row.active_seconds || 0);
  });

  return breakdown;
}

/**
 * Get study habit insights
 * Returns: preferred content type, peak study hours, avg session patterns
 */
async function getStudyHabits() {
  if (!supabase) return { preferredFormat: 'text', peakHours: [], avgSessionMinutes: 0 };

  // Content type preferences
  const prefs = await getContentPreferences(30); // Last 30 days
  const preferredFormat = Object.entries(prefs)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'text';

  // Peak study hours from productive tab analytics
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const { data: productiveData } = await supabase
    .from('tab_analytics')
    .select('timestamp, active_seconds')
    .eq('category', 'productive')
    .gte('timestamp', thirtyDaysAgo);

  // Group by hour
  const hourBuckets = {};
  (productiveData || []).forEach(row => {
    const hour = new Date(row.timestamp).getHours();
    hourBuckets[hour] = (hourBuckets[hour] || 0) + (row.active_seconds || 0);
  });

  const peakHours = Object.entries(hourBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, seconds]) => ({ hour: parseInt(hour), seconds }));

  // Average session duration
  const { data: sessions } = await supabase
    .from('sessions')
    .select('deep_work_minutes')
    .gte('start_time', thirtyDaysAgo);

  const totalMinutes = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const avgSessionMinutes = sessions && sessions.length > 0
    ? Math.round(totalMinutes / sessions.length) : 0;

  return {
    preferredFormat,
    contentBreakdown: prefs,
    peakHours,
    avgSessionMinutes,
    totalSessions: (sessions || []).length,
  };
}
// ═══════════════════════════════════════
//  SESSION SITES FUNCTIONS (Extension Browser Data)
// ═══════════════════════════════════════

/**
 * Batch insert per-site browser analytics linked to a session.
 * Called when a session ends, from the browserTabs accumulator.
 * @param {string} sessionId
 * @param {Array} sites - [{hostname, category, contentType, active_seconds, visits}]
 * @param {string} date - YYYY-MM-DD
 */
async function insertSessionSites(sessionId, sites, date) {
  if (!supabase || !sessionId || !sites || sites.length === 0) return;

  const rows = sites.map(site => ({
    session_id: sessionId,
    hostname: site.hostname,
    category: site.category || 'neutral',
    content_type: site.contentType || site.content_type || 'text',
    active_seconds: site.active_seconds || 0,
    visits: site.visits || 1,
    date: date || new Date().toISOString().slice(0, 10),
    timestamp: Date.now(),
    user_id: currentUserId,
  }));

  const { error } = await supabase.from('session_sites').insert(rows);
  if (error) console.error('[DB] insertSessionSites error:', error.message);
  else console.log(`[DB] Inserted ${rows.length} session_sites rows for session ${sessionId.slice(0, 8)}`);
}

/**
 * Get per-site analytics aggregated across all sessions for the last N days.
 * Returns sites sorted by total time spent (descending) — for "Top Time Sinks" chart.
 * @param {number} days
 * @param {string} [category] - optional filter: 'productive' | 'distraction' | 'neutral'
 */
async function getPerSiteAnalytics(days = 7, category = null) {
  if (!supabase) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = supabase
    .from('session_sites')
    .select('hostname, category, content_type, active_seconds, visits')
    .gte('date', since);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[DB] getPerSiteAnalytics error:', error.message);
    return [];
  }

  // Aggregate by hostname AND category
  const siteMap = {};
  (data || []).forEach(row => {
    const key = `${row.hostname}|${row.category}`;
    if (!siteMap[key]) {
      siteMap[key] = {
        hostname: row.hostname,
        category: row.category,
        content_type: row.content_type,
        total_seconds: 0,
        total_visits: 0,
      };
    }
    siteMap[key].total_seconds += row.active_seconds || 0;
    siteMap[key].total_visits += row.visits || 1;
    // Update content type to most recent
    siteMap[key].content_type = row.content_type;
  });

  return Object.values(siteMap).sort((a, b) => b.total_seconds - a.total_seconds);
}

/**
 * Get per-site breakdown for a specific session.
 * @param {string} sessionId
 */
async function getSessionSites(sessionId) {
  if (!supabase || !sessionId) return [];

  const { data, error } = await supabase
    .from('session_sites')
    .select('*')
    .eq('session_id', sessionId)
    .order('active_seconds', { ascending: false });

  if (error) {
    console.error('[DB] getSessionSites error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get analytics data for a given range (week or month)
 */
async function getAnalyticsData(range = 'week') {
  const days = range === 'month' ? 30 : 7;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Get sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('start_time', since)
    .order('start_time', { ascending: true });

  // Get scores
  const { data: scores } = await supabase
    .from('scores')
    .select('timestamp, score')
    .gte('timestamp', since)
    .order('timestamp', { ascending: true });

  // Get streaks
  const { data: habits } = await supabase
    .from('daily_habits')
    .select('*')
    .order('date', { ascending: false })
    .limit(days);

  // Aggregate daily stats
  const dailyMap = {};
  (sessions || []).forEach((s) => {
    const day = new Date(s.start_time).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { deepWork: 0, sessions: 0, totalScore: 0, scoreCount: 0 };
    dailyMap[day].deepWork += s.deep_work_minutes || 0;
    dailyMap[day].sessions += 1;
    if (s.avg_score) {
      dailyMap[day].totalScore += s.avg_score;
      dailyMap[day].scoreCount += 1;
    }
  });

  const dailyStats = Object.entries(dailyMap).map(([date, d]) => ({
    date,
    deepWork: d.deepWork,
    sessions: d.sessions,
    avgScore: d.scoreCount > 0 ? Math.round(d.totalScore / d.scoreCount) : 0,
  }));

  // Hourly productivity (from scores)
  const hourlyMap = {};
  (scores || []).forEach((s) => {
    const hour = new Date(s.timestamp).getHours();
    if (!hourlyMap[hour]) hourlyMap[hour] = { total: 0, count: 0 };
    hourlyMap[hour].total += s.score;
    hourlyMap[hour].count += 1;
  });

  const bestHours = Object.entries(hourlyMap)
    .map(([hour, d]) => ({ hour: parseInt(hour), avgScore: Math.round(d.total / d.count) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Overall stats
  const totalDeepWork = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const allScores = (sessions || []).filter(s => s.avg_score).map(s => s.avg_score);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
  const currentStreak = habits && habits.length > 0 ? (habits[0].streak_count || 0) : 0;

  // Best day
  let bestDay = null;
  dailyStats.forEach(d => {
    if (!bestDay || d.deepWork > bestDay.deepWork) bestDay = d;
  });

  return {
    dailyStats,
    bestHours,
    totalDeepWork,
    avgScore,
    totalSessions: (sessions || []).length,
    currentStreak,
    bestDay: bestDay ? bestDay.date : null,
  };
}

/**
 * Get today's summary
 */
async function getTodaySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  // Today's sessions
  const { data: sessions } = await supabase
    .from('sessions')
    .select('*')
    .gte('start_time', startOfDay)
    .lt('start_time', endOfDay);

  // Today's habits
  const habits = await getDailyHabits(today);

  const totalSessions = (sessions || []).length;
  const totalDeepWork = (sessions || []).reduce((sum, s) => sum + (s.deep_work_minutes || 0), 0);
  const allScores = (sessions || []).filter(s => s.avg_score).map(s => s.avg_score);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  const habitsCompleted = [habits.read_done, habits.meditation_done, habits.session_done].filter(Boolean).length;

  return {
    totalSessions,
    totalDeepWork,
    avgScore,
    habitsCompleted,
    habitsTotal: 3,
    streak: habits.streak_count || 0,
  };
}

/**
 * Get the most frequent session goal from today
 */
async function getTopGoal() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  if (!supabase) return null;

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('goal')
    .gte('start_time', startOfDay)
    .lt('start_time', endOfDay);

  if (error || !sessions || sessions.length === 0) return null;

  const counts = {};
  sessions.forEach(s => {
    if (s.goal && s.goal !== 'Focus Session') {
      counts[s.goal] = (counts[s.goal] || 0) + 1;
    }
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  const [topGoal, count] = sorted[0];
  return { goal: topGoal, count };
}

// ═══════════════════════════════════════
//  SUBJECT TAGS & STREAKS FUNCTIONS
// ═══════════════════════════════════════

/**
 * Helper to get the start of the current week (Monday)
 */
function getStartOfWeek(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Helper to check if a date string is before yesterday (for daily)
 * or before last week (for weekly)
 */
function isStreakBroken(lastStreakDate, targetType, todayStr) {
  if (!lastStreakDate) return false;

  const today = new Date(todayStr);
  today.setHours(0, 0, 0, 0);

  const last = new Date(lastStreakDate);
  last.setHours(0, 0, 0, 0);

  const daysDiff = Math.floor((today - last) / (1000 * 60 * 60 * 24));

  if (targetType === 'daily') {
    return daysDiff > 1; // missed yesterday
  } else if (targetType === 'weekly') {
    // Check if the start of last streak's week is more than 1 week ago from today's week
    const lastWeekStart = new Date(getStartOfWeek(lastStreakDate));
    const thisWeekStart = new Date(getStartOfWeek(todayStr));
    const weekDiff = Math.floor((thisWeekStart - lastWeekStart) / (1000 * 60 * 60 * 24 * 7));
    return weekDiff > 1; // missed last week
  }
  return false;
}

/**
 * Creates a new subject tag
 */
async function createTag(name, color, targetMinutes, targetType) {
  if (!supabase || !currentUserId) return { error: 'DB not ready' };

  const { data, error } = await supabase.from('tags').insert({
    user_id: currentUserId,
    name,
    color: color || '#22c55e',
    target_minutes: targetMinutes,
    target_type: targetType // 'daily' or 'weekly'
  }).select().single();

  if (error) {
    console.error('[DB] createTag error:', error.message);
    return { error: error.message };
  }
  return { data };
}

/**
 * Get all tags for the current user, updating streaks if broken
 */
async function getTags() {
  if (!supabase || !currentUserId) return [];

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] getTags error:', error.message);
    return [];
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const updatedTags = [];

  // Check for broken streaks and update
  for (const tag of data || []) {
    let modified = false;
    let newStreak = tag.current_streak;

    if (tag.current_streak > 0 && isStreakBroken(tag.last_streak_date, tag.target_type, todayStr)) {
      newStreak = 0;
      modified = true;
    }

    if (modified) {
      await supabase.from('tags').update({ current_streak: newStreak }).eq('id', tag.id);
      tag.current_streak = newStreak;
    }

    // Fetch today's / this week's logged minutes
    let rangeStart = todayStr;
    if (tag.target_type === 'weekly') {
      rangeStart = getStartOfWeek(todayStr);
    }

    const { data: logs } = await supabase
      .from('tag_sessions')
      .select('minutes_logged')
      .eq('tag_id', tag.id)
      .gte('date', rangeStart);

    const loggedMinutes = (logs || []).reduce((sum, row) => sum + (row.minutes_logged || 0), 0);
    tag.logged_minutes = loggedMinutes;

    updatedTags.push(tag);
  }

  return updatedTags;
}

/**
 * Get all session logs for a tag (for 30 day contribution grid)
 */
async function getTagSessions(tagId, days = 30) {
  if (!supabase || !currentUserId) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('tag_sessions')
    .select('date, minutes_logged')
    .eq('tag_id', tagId)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) {
    console.error('[DB] getTagSessions error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Log a session to a tag and update streaks
 */
async function logTagSession(tagId, sessionId, minutesLogged, date) {
  if (!supabase || !currentUserId || !tagId || minutesLogged === undefined || minutesLogged === null) return;

  // Insert session log
  const { error: insertErr } = await supabase.from('tag_sessions').insert({
    tag_id: tagId,
    user_id: currentUserId,
    session_id: sessionId,
    minutes_logged: minutesLogged,
    date: date
  });

  if (insertErr) {
    console.error('[DB] logTagSession insert error:', insertErr.message);
    return;
  }

  // Update streaks logic
  const { data: tag, error: tagErr } = await supabase.from('tags').select('*').eq('id', tagId).single();
  if (tagErr || !tag) return;

  const todayStr = date;

  // Calculate total logged in the target window (today or this week)
  let rangeStart = todayStr;
  if (tag.target_type === 'weekly') rangeStart = getStartOfWeek(todayStr);

  const { data: logs } = await supabase
    .from('tag_sessions')
    .select('minutes_logged')
    .eq('tag_id', tagId)
    .gte('date', rangeStart);

  const totalLogged = (logs || []).reduce((sum, row) => sum + (row.minutes_logged || 0), 0);

  // If target is met
  if (totalLogged >= tag.target_minutes) {
    // Avoid double counting streak for the same target window
    let periodIdentified = tag.target_type === 'daily' ? todayStr : getStartOfWeek(todayStr);
    let lastPeriodIdentified = tag.last_streak_date
      ? (tag.target_type === 'daily' ? tag.last_streak_date : getStartOfWeek(tag.last_streak_date))
      : null;

    if (periodIdentified !== lastPeriodIdentified) {
      // Streak increments!
      let newStreak = tag.current_streak + 1;

      // But wait! Was it already broken?
      if (isStreakBroken(tag.last_streak_date, tag.target_type, todayStr)) {
        newStreak = 1;
      }

      const longestStreak = Math.max(tag.longest_streak, newStreak);

      await supabase.from('tags').update({
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_streak_date: todayStr
      }).eq('id', tag.id);
    }
  }
}

// ═══════════════════════════════════════
//  FOCUS ROOM FUNCTIONS
// ═══════════════════════════════════════

/**
 * Create a focus room
 */
async function createRoom(roomId, name) {
  if (!supabase) return { error: 'DB not ready' };

  const { data, error } = await supabase.from('focus_rooms').insert({
    id: roomId,
    name,
    created_by: currentUserId,
    created_at: Date.now(),
  }).select().single();

  if (error) {
    console.error('[DB] createRoom error:', error.message);
    return { error: error.message };
  }
  return { data };
}

/**
 * Get room by code
 */
async function getRoomByCode(code) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('focus_rooms')
    .select('*')
    .eq('id', code)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('[DB] getRoomByCode error:', error.message);
    return null;
  }
  return data;
}

/**
 * Join a room
 */
async function joinRoom(roomId, displayName) {
  if (!supabase) return { error: 'DB not ready' };

  const { data, error } = await supabase.from('focus_room_members').upsert({
    room_id: roomId,
    user_id: currentUserId,
    display_name: displayName,
    status: 'focused',
    score: 0,
    joined_at: Date.now(),
  }, { onConflict: 'room_id,user_id' }).select().single();

  if (error) {
    console.error('[DB] joinRoom error:', error.message);
    return { error: error.message };
  }
  return { data };
}

/**
 * Leave a room
 */
async function leaveRoom(roomId) {
  if (!supabase) return { error: 'DB not ready' };

  const { error } = await supabase
    .from('focus_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', currentUserId);

  if (error) {
    console.error('[DB] leaveRoom error:', error.message);
    return { error: error.message };
  }
  return { ok: true };
}

/**
 * Get all members of a room
 */
async function getRoomMembers(roomId) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('focus_room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('[DB] getRoomMembers error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Update a member's focus status and score
 */
async function updateMemberStatus(roomId, status, score) {
  if (!supabase || !currentUserId) return;

  const { error } = await supabase
    .from('focus_room_members')
    .update({ status, score })
    .eq('room_id', roomId)
    .eq('user_id', currentUserId);

  if (error) {
    console.error('[DB] updateMemberStatus error:', error.message);
  }
}

/**
 * Get the room the current user is in (if any)
 */
async function getUserActiveRoom() {
  if (!supabase || !currentUserId) return null;

  const { data, error } = await supabase
    .from('focus_room_members')
    .select('room_id')
    .eq('user_id', currentUserId)
    .limit(1)
    .single();

  if (error) return null;
  return data?.room_id || null;
}

// ═══════════════════════════════════════
//  EISENHOWER MATRIX FUNCTIONS
// ═══════════════════════════════════════

async function getMatrixTasks() {
  if (!supabase || !currentUserId) return [];
  const { data, error } = await supabase.from('eisenhower_tasks')
    .select('*').eq('user_id', currentUserId).order('created_at', { ascending: false });
  if (error) { console.error('[DB] getMatrixTasks error:', error.message); return []; }
  return data || [];
}

async function createMatrixTask(title, quadrant = 'inbox', googleEventId = null, dueDate = null) {
  if (!supabase || !currentUserId) return { error: 'DB not ready' };
  const row = { user_id: currentUserId, title, quadrant, google_event_id: googleEventId };
  if (dueDate) row.due_date = dueDate;
  const { data, error } = await supabase.from('eisenhower_tasks').insert(row).select().single();
  if (error) return { error: error.message };
  return { data };
}

async function updateMatrixTask(id, updates) {
  if (!supabase || !currentUserId) return { error: 'DB not ready' };
  const { data, error } = await supabase.from('eisenhower_tasks').update(updates)
    .eq('id', id).eq('user_id', currentUserId).select().single();
  if (error) return { error: error.message };
  return { data };
}

async function deleteMatrixTask(id) {
  if (!supabase || !currentUserId) return { error: 'DB not ready' };
  const { error } = await supabase.from('eisenhower_tasks')
    .delete().eq('id', id).eq('user_id', currentUserId);
  if (error) return { error: error.message };
  return { ok: true };
}

async function completeMatrixTask(id) {
  return updateMatrixTask(id, { completed: true });
}

module.exports = {
  initDB,
  getDB,
  setAuthSession,
  getUserId,
  insertEvent,
  getRecentEvents,
  insertScore,
  getHeatmapData,
  getDeepWorkRamp,
  getFocusDebt,
  getDailyHabits,
  updateHabit,
  insertTabAnalytics,
  getContentPreferences,
  getTimeBreakdownDB,
  getStudyHabits,
  getAnalyticsData,
  getTodaySummary,
  insertSessionSites,
  getPerSiteAnalytics,
  getSessionSites,
  getDetailedTabAnalytics,
  getDashboardStats,
  getSessionHistory,
  // Focus Rooms
  createRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  getRoomMembers,
  updateMemberStatus,
  getUserActiveRoom,
  // Tags
  createTag,
  getTags,
  getTagSessions,
  logTagSession,
  getTopGoal,
  getMatrixTasks,
  createMatrixTask,
  updateMatrixTask,
  deleteMatrixTask,
  completeMatrixTask,
};
