const express = require('express');
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');
const {
  insertEvent,
  getHeatmapData,
  getDeepWorkRamp,
  getFocusDebt,
  getDailyHabits,
  updateHabit,
  getDB,
  getUserId,
  setAuthSession,
  insertTabAnalytics,
  getContentPreferences,
  getTimeBreakdownDB,
  getStudyHabits,
  getAnalyticsData,
  getTodaySummary,
  insertSessionSites,
  getPerSiteAnalytics,
  getSessionSites,
  // Focus Rooms
  createRoom,
  getRoomByCode,
  joinRoom,
  leaveRoom,
  getRoomMembers,
  updateMemberStatus,
  getUserActiveRoom,
  getTagSessions,
  logTagSession,
  getTags,
  createTag,
  getTopGoal,
  getDetailedTabAnalytics,
  getDashboardStats,
  getSessionHistory,
  getMatrixTasks,
  createMatrixTask,
  updateMatrixTask,
  deleteMatrixTask,
  completeMatrixTask,
} = require('./db');
const { fetchDevToArticles } = require('./scraper');
const { startScorer } = require('./scorer');
const session = require('./session');
const { google } = require('googleapis');

const PORT = 39871;
let wss = null;
let currentDjangoWs = null;

/**
 * Broadcast to all WebSocket clients
 */
function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

/**
 * Bridge Django WebSocket → Express broadcast
 * When Django fires mobile_connected_notification (phone scanned QR),
 * we relay it to Electron so the QR wait page transitions to active.
 */
function startDjangoBridge(sessionId) {
  if (!sessionId) return null;
  if (currentDjangoWs) {
    try { currentDjangoWs.close(); } catch (_) {}
    currentDjangoWs = null;
  }
  try {
    const djangoWs = new (require('ws'))(`ws://127.0.0.1:8000/ws/session/${sessionId}/`);
    currentDjangoWs = djangoWs;
    djangoWs.on('open', () => {
      console.log(`[Bridge] Connected to Django WS for session ${sessionId}`);
      // Identify as desktop so Django marks it connected
      djangoWs.send(JSON.stringify({
        device: 'desktop', event: 'session_start', session_id: sessionId,
      }));
    });
    djangoWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // Relay phone connection events to Electron
        if (
          msg.type === 'mobile_connected_notification' ||
          msg.type === 'phone_connected' ||
          msg.type === 'score_update' ||
          msg.type === 'raw_mobile_signal' ||
          msg.type === 'distraction_alert' ||
          msg.type === 'device_disconnected'
        ) {
          if (msg.type === 'raw_mobile_signal') {
            console.log(`[Phone] Signal: ${msg.signal_type}`);
          } else if (msg.type === 'device_disconnected') {
            console.log(`[Phone] Disconnected`);
          }
          broadcast(msg); // forward to all Express WS clients (Electron)
        }
      } catch (_) { }   
    });
    djangoWs.on('error', (e) => console.warn('[Bridge] Django WS error:', e.message));
    djangoWs.on('close', () => {
      console.log('[Bridge] Django WS closed');
      currentDjangoWs = null;
    });
    return djangoWs;
  } catch (e) {
    console.warn('[Bridge] Could not start Django bridge:', e.message);
    return null;
  }
}

/**
 * Start Express + WebSocket server
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(express.json());

    // CORS
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // ─── Health check ───
    app.get('/ping', (req, res) => {
      res.json({ status: 'alive', version: '1.0.0' });
    });

    // ─── Auth session sync (Web frontend → Backend) ───
    app.post('/auth/set-session', (req, res) => {
      const { access_token, refresh_token } = req.body;
      if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
      setAuthSession(access_token, refresh_token);
      res.json({ ok: true });
    });

    // ─── Network info (returns PC's real LAN IPs) ───
    app.get('/network-info', (req, res) => {
      const interfaces = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          // Skip loopback and IPv6
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push({ name, address: iface.address });
          }
        }
      }
      // Prefer Wi-Fi / Ethernet - explicitly ignore Virtual, WSL, and Hotspot adapters
      const preferred = ips.find(i => {
        const lowerName = i.name.toLowerCase();
        const isVirtual = lowerName.includes('wsl') || lowerName.includes('vethernet') || lowerName.includes('virtual') || lowerName.includes('vmware');
        const isHotspot = i.address.startsWith('192.168.137');
        return !isVirtual && !isHotspot;
      }) || ips[0];
      res.json({ ips, preferred: preferred?.address || 'localhost' });
    });

    // ─── AI Validation (Groq) ───
    app.post('/ai-validate', async (req, res) => {
      const { appName } = req.body;
      if (!appName) return res.status(400).json({ error: 'AppName is required' });

      try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          console.warn('[Server] No GROQ_API_KEY found. Defaulting to true for hackathon testing.');
          return res.json({ isProductive: true, reason: 'AI disabled' });
        }

        const prompt = `You are a focus coach AI inside the MindForge app.
The user wants to add an application to their "Allowed/Productive Apps" list.
App Name: "${appName}"
Is this application genuinely productive for focused studying/working, or is it typically a distraction (like games, social media, Netflix)?
Reply strictly with a JSON object in this exact format:
{"isProductive": true, "reason": "brief 1 sentence reason"}
or
{"isProductive": false, "reason": "brief 1 sentence reason"}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API error: ${response.status} ${errText}`);
        }
        
        const data = await response.json();
        let content = data.choices[0].message.content;

        // Safely extract JSON from markdown if model wrapped it
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          content = content.substring(jsonStart, jsonEnd + 1);
        }

        const parsed = JSON.parse(content);

        console.log(`[AI] Validated "${appName}": Productive=${parsed.isProductive} — ${parsed.reason}`);
        res.json(parsed);
      } catch (err) {
        console.error('[Server] AI validation error:', err.message);
        // Fallback to allow if API fails
        res.json({ isProductive: true, reason: 'AI fallback allowed' });
      }
    });

    // ─── AI Content Classification for Extension (3-Tier) ───
    // Extension sends page content + session goal → LLM decides:
    //   GOAL_RELEVANT → directly related to session goal (e.g., "cybersecurity")
    //   STUDY_RELATED → educational but not goal-specific
    //   DISTRACTION   → block this mf
    app.post('/ai-classify-content', async (req, res) => {
      const { title, url, hostname, content, sessionGoal } = req.body;
      if (!title && !url) return res.status(400).json({ error: 'Missing title or url' });

      try {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          return res.json({ verdict: 'STUDY_RELATED', reason: 'AI disabled — fallback allow', confidence: 0.5 });
        }

        const prompt = `You are a strict focus enforcement AI inside MindForge, a productivity app for students.

The user is currently in a FOCUS SESSION with this goal: "${sessionGoal || 'General study'}"

They just navigated to this webpage:
- Title: "${title || ''}"
- URL: ${url || ''}
- Site: ${hostname || ''}
- Page content snippet: "${(content || '').substring(0, 500)}"

Classify this page into EXACTLY ONE of these 3 categories:

1. "GOAL_RELEVANT" — The page content is DIRECTLY related to the session goal "${sessionGoal}". Example: if the goal is "cybersecurity", then a page about network security, penetration testing, ethical hacking, firewall configuration = GOAL_RELEVANT.

2. "STUDY_RELATED" — The page is educational/academic/study-related but NOT directly about "${sessionGoal}". Example: a math tutorial when the goal is cybersecurity, or a coding problem when the goal is physics. It's studious but off-topic.

3. "DISTRACTION" — The page is entertainment, social media, shopping, gaming, memes, news gossip, celebrity content, or anything NOT educational/productive. This includes: YouTube entertainment videos, Reddit memes, Instagram, Twitter drama, Netflix, gaming sites, etc. BE STRICT — if it's not clearly educational, it's a DISTRACTION.

IMPORTANT RULES:
- YouTube videos about "${sessionGoal}" topics → GOAL_RELEVANT
- YouTube tutorials/lectures on OTHER academic subjects → STUDY_RELATED  
- YouTube entertainment/vlogs/memes/shorts → DISTRACTION
- Reddit posts about "${sessionGoal}" → GOAL_RELEVANT
- Reddit posts about other academic topics → STUDY_RELATED
- Reddit memes/entertainment → DISTRACTION
- News about technology/science → STUDY_RELATED
- News about celebrities/gossip/politics → DISTRACTION

Reply with ONLY a JSON object, nothing else:
{"verdict": "GOAL_RELEVANT" or "STUDY_RELATED" or "DISTRACTION", "reason": "1 sentence explanation", "confidence": 0.0-1.0}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.05,
            max_tokens: 150,
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Groq API error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        let aiContent = data.choices[0].message.content;

        // Extract JSON from possible markdown wrapping
        const jsonStart = aiContent.indexOf('{');
        const jsonEnd = aiContent.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          aiContent = aiContent.substring(jsonStart, jsonEnd + 1);
        }

        const parsed = JSON.parse(aiContent);
        const verdict = ['GOAL_RELEVANT', 'STUDY_RELATED', 'DISTRACTION'].includes(parsed.verdict)
          ? parsed.verdict : 'DISTRACTION';

        console.log(`[AI] Content: "${(title || '').substring(0, 50)}" on ${hostname} → ${verdict} (goal: "${sessionGoal}") — ${parsed.reason}`);
        res.json({ verdict, reason: parsed.reason, confidence: parsed.confidence || 0.8 });
      } catch (err) {
        console.error('[Server] AI content classify error:', err.message);
        // Fallback: allow as study-related to avoid false blocks
        res.json({ verdict: 'STUDY_RELATED', reason: 'AI error — fallback allow', confidence: 0.3 });
      }
    });

    // ─── AI Task Auto-Classification (Gemini → Groq fallback) ───
    app.post('/ai-classify-tasks', async (req, res) => {
      const { tasks } = req.body;
      if (!tasks || !tasks.length) return res.json({ classifications: [] });
      
      const prompt = `You are a productivity AI organizing tasks into the Eisenhower Matrix.
Categorize each task into EXACTLY one of these 4 quadrants:
- "do_first" → Urgent & Important (exams tomorrow, assignment due today, critical deadlines)
- "schedule" → Important but Not Urgent (deep work, gym, long-term projects, study goals)
- "delegate" → Urgent but Not Important (emails, admin tasks, quick errands)
- "eliminate" → Not Urgent & Not Important (scrolling social media, binge-watching, time-wasters)

Tasks to classify:
${tasks.map(t => `- [${t.id}] ${t.title}`).join('\n')}

Reply with ONLY a valid JSON object, nothing else:
{"classifications": [{"id": "task_id", "quadrant": "do_first", "reason": "brief reason"}]}`;

      // Helper: try Gemini
      async function tryGemini() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return null;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
          })
        });

        if (response.status === 429) {
          console.warn('[AI/Gemini] Rate limited, falling back to Groq...');
          return null;
        }
        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[AI/Gemini] Error ${response.status}, falling back to Groq...`);
          return null;
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
      }

      // Helper: try Groq
      async function tryGroq() {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return null;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          })
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data.choices?.[0]?.message?.content || null;
      }

      try {
        // Try Gemini first, fallback to Groq
        let content = await tryGemini();
        let source = 'Gemini';
        if (!content) {
          content = await tryGroq();
          source = 'Groq';
        }
        if (!content) {
          // Both failed — fallback to 'schedule'
          const fallback = tasks.map(t => ({ id: t.id, quadrant: 'schedule', reason: 'AI unavailable — defaulted' }));
          for (const cl of fallback) await updateMatrixTask(cl.id, { quadrant: cl.quadrant });
          return res.json({ ok: true, classifications: fallback });
        }

        // Extract JSON
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          content = content.substring(jsonStart, jsonEnd + 1);
        }
        const parsed = JSON.parse(content);
        
        // Update DB
        if (parsed.classifications) {
          for (const cl of parsed.classifications) {
            await updateMatrixTask(cl.id, { quadrant: cl.quadrant });
          }
        }
        console.log(`[AI/${source}] Classified ${parsed.classifications?.length || 0} tasks`);
        res.json({ ok: true, classifications: parsed.classifications });
      } catch (err) {
        console.error('[Server] AI classification error:', err.message);
        // Graceful fallback — don't 500, just default classify
        const fallback = tasks.map(t => ({ id: t.id, quadrant: 'schedule', reason: 'AI error — defaulted' }));
        for (const cl of fallback) { try { await updateMatrixTask(cl.id, { quadrant: cl.quadrant }); } catch {} }
        res.json({ ok: true, classifications: fallback });
      }
    });

    // ═══════════════════════════════════════════
    //  SESSION ENDPOINTS (NEW)
    // ═══════════════════════════════════════════

    // Start a focus session
    app.post('/session/start', (req, res) => {
      const { goal, mode, allowedApps, tagId, djangoId } = req.body;
      const info = session.startSession(goal || 'Focus Session', mode || 'basic', allowedApps || [], tagId);

      if (djangoId) {
        startDjangoBridge(djangoId);
      }

      // Broadcast to UI
      broadcast({ type: 'session_started', ...info });
      res.json({ ok: true, session: info });
    });

    // End the current session → push summary to Supabase
    app.post('/session/end', async (req, res) => {
      const summary = session.endSession();
      if (!summary) return res.json({ ok: false, error: 'No active session' });

      if (currentDjangoWs) {
        try { currentDjangoWs.close(); } catch (_) {}
        currentDjangoWs = null;
      }

      // Push session summary to Supabase
      try {
        const supabase = getDB();
        if (supabase) {
          await supabase.from('sessions').upsert({
            id: summary.id,
            user_id: getUserId(),
            start_time: summary.start_time,
            end_time: summary.end_time,
            goal: summary.goal,
            avg_score: summary.avg_score,
            deep_work_minutes: summary.deep_work_minutes,
            productive_sec: summary.breakdown.productive,
            distraction_sec: summary.breakdown.distraction,
            browser_sec: summary.breakdown.browser,
            neutral_sec: summary.breakdown.neutral,
            idle_sec: summary.breakdown.idle,
            text_sec: summary.contentTypeBreakdown.text,
            video_sec: summary.contentTypeBreakdown.video,
            interactive_sec: summary.contentTypeBreakdown.interactive,
            audio_sec: summary.contentTypeBreakdown.audio,
          });

          // Also push the final score
          await supabase.from('scores').insert({
            user_id: getUserId(),
            timestamp: Date.now(),
            score: summary.avg_score,
          });

          // Save accrued per-site browser tracking
          if (summary.browserTabs && summary.browserTabs.length > 0) {
            await insertSessionSites(summary.id, summary.browserTabs);
          }

          // Log to subject tag if applicable
          if (summary.tagId) {
            const loggedMinutes = Math.max(1, summary.duration_minutes || summary.deep_work_minutes || 1);
            const dateStr = new Date(summary.start_time).toISOString().slice(0, 10);
            await logTagSession(summary.tagId, summary.id, loggedMinutes, dateStr);
          }

          console.log('[Server] Session summary saved to Supabase');
        }
      } catch (err) {
        console.error('[Server] Error saving session to Supabase:', err.message);
      }

      // Broadcast to UI
      broadcast({ type: 'session_ended', summary });
      res.json({ ok: true, summary });
    });

    // Get session status
    app.get('/session/status', (req, res) => {
      res.json(session.getStatus());
    });

    // Pause session (take a break — 20 min max)
    app.post('/session/pause', (req, res) => {
      const result = session.pauseSession();
      if (result.ok) {
        broadcast({ type: 'session_paused', breakCount: result.breakCount });
      }
      res.json(result);
    });

    // Resume session (end break)
    app.post('/session/resume', (req, res) => {
      const result = session.resumeSession();
      if (result.ok) {
        broadcast({ type: 'session_resumed', breakDuration: result.breakDuration });
      }
      res.json(result);
    });

    // ═══════════════════════════════════════════
    //  DATA ENDPOINTS (Supabase)
    // ═══════════════════════════════════════════

    // Track last browser event timestamp for elapsed time calculation
    let lastBrowserEventTime = 0;
    let lastBrowserHostname = '';

    app.post('/browser-event', async (req, res) => {
      try {
        const { url, category, contentType, timestamp } = req.body;
        const now = timestamp || Date.now();

        // During active session, add to session memory
        if (session.isActive()) {
          session.addEvent('chrome', 'Chrome', url, category || 'browser', false, contentType || 'text');
          try {
            const hostname = new URL(url).hostname;

            // Calculate elapsed seconds since last browser event on the SAME host
            // Cap at 5 minutes to avoid inflated times from idle/unfocused periods
            let elapsedSec = 0;
            if (lastBrowserEventTime > 0 && lastBrowserHostname) {
              const diff = Math.round((now - lastBrowserEventTime) / 1000);
              if (diff > 0 && diff <= 300) { // max 5 min
                // Attribute time to the PREVIOUS hostname (where user was)
                session.addBrowserTab(lastBrowserHostname, '', category, contentType, diff);
              }
            }

            // Record this visit (0 elapsed — time gets attributed on the NEXT event)
            session.addBrowserTab(hostname, url, category, contentType, 0);
            lastBrowserEventTime = now;
            lastBrowserHostname = hostname;

            // Broadcast the browser switch to the UI
            broadcast({
              type: 'event',
              app: hostname,
              category: category,
              source: 'browser',
              timestamp: now
            });
          } catch (e) {
            // invalid URL parsing
          }
        }
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  ANALYTICS ENDPOINTS (NEW)
    // ═══════════════════════════════════════════

    // Receive per-tab time analytics from extension
    app.post('/analytics/tab-time', async (req, res) => {
      try {
        const { timeBreakdown, perSite, timestamp } = req.body;
        const sessionId = session.isActive() ? session.getStatus().id : null;

        // Store per-site data
        if (perSite && perSite.length > 0) {
          await insertTabAnalytics(perSite.map(site => ({
            session_id: sessionId,
            hostname: site.hostname,
            url: '',
            category: site.category,
            content_type: site.contentType,
            active_seconds: site.totalSeconds,
            timestamp: timestamp || Date.now(),
          })));
        }

        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get content type preferences
    app.get('/analytics/content-preferences', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getContentPreferences(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get time breakdown (productive/distraction/neutral)
    app.get('/analytics/time-breakdown', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getTimeBreakdownDB(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get Top Time Sinks (per-site aggregation across all sessions)
    app.get('/analytics/per-site', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const category = req.query.category || null;
        const data = await getPerSiteAnalytics(days, category);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get per-site analytics for a specific session ID
    app.get('/analytics/session/:id', async (req, res) => {
      try {
        const data = await getSessionSites(req.params.id);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get study habit insights
    app.get('/analytics/study-habits', async (req, res) => {
      try {
        const data = await getStudyHabits();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Internal Scraper Endpoint
    app.post('/scraped-content', async (req, res) => {
      const { topic } = req.body;
      try {
        // Fetch from Dev.to (handles random fallback if topic is null)
        const articles = await fetchDevToArticles(topic);
        res.json({ results: articles, topic: articles[0]?.topic || topic });
      } catch (err) {
        console.error('[Server] Scraper endpoint error:', err.message);
        res.status(500).json({ error: 'Failed to scrape content' });
      }
    });

    app.get('/analytics/top-goal', async (req, res) => {
      try {
        const data = await getTopGoal();
        res.json(data || { goal: null, count: 0 });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/desktop-notify', (req, res) => {
      try {
        const { title, message } = req.body;
        const { exec } = require('child_process');
        const safeTitle = (title || 'MindForge').replace(/'/g, "''");
        const safeBody = (message || '').replace(/'/g, "''");
        const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${safeBody}', '${safeTitle}', 'OK', 'Warning')`;
        exec(`powershell.exe -NoProfile -WindowStyle Hidden -Command "${ps}"`, (err) => {});
        console.log(`[Notification] Desktop pop-up sent: ${safeTitle}`);
        res.json({ ok: true });
      } catch (err) {
        console.error('[Server] Failed to send desktop notification:', err.message);
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/habit-complete', async (req, res) => {
      try {
        const { habit } = req.body;
        const today = new Date().toISOString().slice(0, 10);
        await updateHabit(today, habit, true);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/scores/heatmap', async (req, res) => {
      try {
        const data = await getHeatmapData();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/ramp', async (req, res) => {
      try {
        const data = await getDeepWorkRamp();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/debt', async (req, res) => {
      try {
        const data = await getFocusDebt();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/habits', async (req, res) => {
      try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const data = await getDailyHabits(date);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Analytics ───
    app.get('/analytics', async (req, res) => {
      try {
        const range = req.query.range || 'week';
        const data = await getAnalyticsData(range);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Today Summary ───
    app.get('/summary/today', async (req, res) => {
      try {
        const data = await getTodaySummary();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Detailed Tab Analytics ───
    app.get('/analytics/tabs-detail', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 7;
        const data = await getDetailedTabAnalytics(days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Dashboard Stats ───
    app.get('/dashboard/stats', async (req, res) => {
      try {
        const range = req.query.range || 'week';
        const data = await getDashboardStats(range);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── Session History ───
    app.get('/sessions/history', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const data = await getSessionHistory(limit, offset);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  SUBJECT TAGS ENDPOINTS
    // ═══════════════════════════════════════════

    app.get('/tags', async (req, res) => {
      try {
        const data = await getTags();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/tags', async (req, res) => {
      try {
        const { name, color, targetMinutes, targetType } = req.body;
        if (!name || !targetMinutes || !targetType) {
          return res.status(400).json({ error: 'Missing required tag fields' });
        }
        const result = await createTag(name, color, targetMinutes, targetType);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, tag: result.data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/tags/:id/sessions', async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 30;
        const data = await getTagSessions(req.params.id, days);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  FOCUS ROOM ENDPOINTS
    // ═══════════════════════════════════════════

    // Create a room
    app.post('/room/create', async (req, res) => {
      try {
        const { name, displayName } = req.body;
        if (!name) return res.status(400).json({ error: 'Room name is required' });

        // Generate 6-char code
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

        const result = await createRoom(code, name);
        if (result.error) return res.status(500).json({ error: result.error });

        // Auto-join the creator
        await joinRoom(code, displayName || 'Host');

        res.json({ ok: true, room: result.data, code });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Join a room by code
    app.post('/room/join', async (req, res) => {
      try {
        const { code, displayName } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });

        const room = await getRoomByCode(code.toUpperCase());
        if (!room) return res.status(404).json({ error: 'Room not found' });

        const result = await joinRoom(code.toUpperCase(), displayName || 'Member');
        if (result.error) return res.status(500).json({ error: result.error });

        res.json({ ok: true, room, member: result.data });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Leave a room
    app.post('/room/leave', async (req, res) => {
      try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });

        const result = await leaveRoom(code);
        if (result.error) return res.status(500).json({ error: result.error });

        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get room members
    app.get('/room/members/:code', async (req, res) => {
      try {
        const members = await getRoomMembers(req.params.code);
        const room = await getRoomByCode(req.params.code);
        res.json({ room, members });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Update member status (called by scorer hook)
    app.post('/room/status', async (req, res) => {
      try {
        const { code, status, score } = req.body;
        if (!code) return res.status(400).json({ error: 'Room code is required' });
        await updateMemberStatus(code, status, score);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get user's active room
    app.get('/room/active', async (req, res) => {
      try {
        const roomId = await getUserActiveRoom();
        if (!roomId) return res.json({ room: null });
        const room = await getRoomByCode(roomId);
        const members = await getRoomMembers(roomId);
        res.json({ room, members });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ═══════════════════════════════════════════
    //  EISENHOWER MATRIX ENDPOINTS
    // ═══════════════════════════════════════════

    app.get('/matrix', async (req, res) => {
      try { res.json(await getMatrixTasks()); } 
      catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/matrix', async (req, res) => {
      try {
        const { title, quadrant, googleEventId, dueDate } = req.body;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const result = await createMatrixTask(title, quadrant || 'inbox', googleEventId, dueDate);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.put('/matrix/:id', async (req, res) => {
      try {
        const result = await updateMatrixTask(req.params.id, req.body);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.delete('/matrix/:id', async (req, res) => {
      try {
        const result = await deleteMatrixTask(req.params.id);
        if (result.error) return res.status(500).json({ error: result.error });
        res.json({ ok: true });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/matrix/:id/complete', async (req, res) => {
      try {
        const result = await completeMatrixTask(req.params.id);
        if (result.error) return res.status(500).json({ error: result.error });
        
        // Sync to google calendar if authenticated
        if (global.googleTokens && process.env.GOOGLE_CLIENT_ID && result.data?.google_event_id && !result.data.title.startsWith('[DONE]')) {
          const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
          oauth2Client.setCredentials(global.googleTokens);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          try {
            await calendar.events.patch({
              calendarId: 'primary',
              eventId: result.data.google_event_id,
              requestBody: { summary: `[DONE] ${result.data.title}` }
            });
            console.log(`[Google Calendar] Marked event ${result.data.google_event_id} as done.`);
          } catch (calErr) {
            console.error('[Google Calendar] Failed to mark event as done:', calErr.message);
          }
        }
        res.json({ ok: true, task: result.data });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════════════════════════════════════
    //  GOOGLE CALENDAR ENDPOINTS
    // ═══════════════════════════════════════════
    
    app.get('/calendar/auth-url', (req, res) => {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      // DEMO MODE: If keys missing, return loopback URL that hits callback with a dummy code
      if (!clientId || !clientSecret) {
        return res.json({ url: 'http://localhost:39871/calendar/callback?code=demo_mode' });
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:39871/calendar/callback');
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/calendar.events']
      });
      res.json({ url });
    });
    
    app.get('/calendar/callback', async (req, res) => {
      const { code } = req.query;
      
      if (code === 'demo_mode') {
        global.googleTokens = { demo: true };
        return res.send('<h1 style="color:#22c55e;font-family:sans-serif;margin-top:20%;text-align:center">MindForge Calendar Sync Successful (Demo Mode)</h1><p style="text-align:center">You can close this tab now and return to the app.</p>');
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      try {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:39871/calendar/callback');
        const { tokens } = await oauth2Client.getToken(code);
        global.googleTokens = tokens;
        res.send('<h1 style="color:#22c55e;font-family:sans-serif;margin-top:20%;text-align:center">MindForge Calendar Sync Successful</h1><p style="text-align:center">You can close this tab now and return to the app.</p>');
      } catch (err) {
        res.status(500).send('<h1 style="color:#ef4444;font-family:sans-serif;margin-top:20%;text-align:center">Authentication failed</h1><p style="text-align:center">' + err.message + '</p>');
      }
    });

    app.get('/calendar/status', (req, res) => {
      res.json({ authenticated: !!global.googleTokens });
    });
    
    app.post('/calendar/sync', async (req, res) => {
      if (!global.googleTokens) return res.status(401).json({ error: 'Not authenticated with Google' });
      
      if (global.googleTokens.demo) {
        await createMatrixTask('Demo Meeting with Team', 'schedule', 'demo_event_1');
        await createMatrixTask('Finish Hackathon Submission', 'do_first', 'demo_event_2');
        return res.json({ ok: true, syncedCount: 2 });
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials(global.googleTokens);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      try {
        const response = await calendar.events.list({
          calendarId: 'primary', timeMin: new Date().toISOString(), maxResults: 15,
          singleEvents: true, orderBy: 'startTime',
        });
        const events = response.data.items;
        let syncedCount = 0;
        
        // Fetch existing task google event IDs so we don't duplicate
        const existingTasks = await getMatrixTasks();
        const existingEventIds = existingTasks.map(t => t.google_event_id).filter(Boolean);

        for (const event of events) {
          if (event.summary && !existingEventIds.includes(event.id) && !event.summary.startsWith('[DONE]')) {
            await createMatrixTask(event.summary, 'inbox', event.id);
            syncedCount++;
          }
        }
        res.json({ ok: true, syncedCount });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.post('/calendar/export', async (req, res) => {
      if (!global.googleTokens) return res.status(401).json({ error: 'Not authenticated' });
      
      try {
        const tasks = await getMatrixTasks();
        const exportTasks = tasks.filter(t => !t.completed && !t.google_event_id && (t.quadrant === 'schedule' || t.quadrant === 'do_first'));
        let exportedCount = 0;

        if (global.googleTokens.demo) {
          for (let i = 0; i < exportTasks.length; i++) {
             await updateMatrixTask(exportTasks[i].id, { google_event_id: `demo_export_${Date.now()}_${i}` });
             exportedCount++;
          }
          return res.json({ ok: true, exportedCount });
        }

        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials(global.googleTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // Fallback start time for tasks without a due_date
        let fallbackTime = new Date();
        fallbackTime.setDate(fallbackTime.getDate() + 1);
        fallbackTime.setHours(9, 0, 0, 0);

        for (const task of exportTasks) {
          let startTime, endTime;

          if (task.due_date) {
            // Use the task's due_date — schedule at 9 AM on that date
            startTime = new Date(task.due_date);
            startTime.setHours(9, 0, 0, 0);
            endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
          } else {
            // No due_date — stack sequentially starting tomorrow 9 AM
            startTime = new Date(fallbackTime);
            endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
            fallbackTime = endTime; // next task starts after this one
          }
          
          const event = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: task.title,
              description: `MindForge - ${task.quadrant === 'do_first' ? '🔴 Urgent & Important' : '🔵 Scheduled Deep Work'}`,
              start: { dateTime: startTime.toISOString() },
              end: { dateTime: endTime.toISOString() },
            }
          });
          
          if (event.data && event.data.id) {
            await updateMatrixTask(task.id, { google_event_id: event.data.id });
            exportedCount++;
          }
        }
        res.json({ ok: true, exportedCount });
      } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ═══════════════════════════════════════════
    //  EMAIL REPORT ENDPOINTS
    // ═══════════════════════════════════════════

    const { sendDailyEmail, getEmailHistory, getEmailById } = require('./emailService');
    const { getUser: getAuthUser } = require('./auth');

    // Get email history for current user
    app.get('/email/history', async (req, res) => {
      try {
        const data = await getEmailHistory();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Get a single email report content
    app.get('/email/:id', async (req, res) => {
      try {
        const data = await getEmailById(req.params.id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Manually trigger daily report (for testing / demo)
    app.post('/email/send-now', async (req, res) => {
      try {
        // Use the authenticated user's email as recipient
        const user = getAuthUser();
        const recipientEmail = req.body.email || user?.email;
        if (!recipientEmail) {
          return res.status(400).json({ error: 'No recipient email — user not logged in' });
        }
        const result = await sendDailyEmail(recipientEmail);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ─── HTTP + WebSocket server ───
    const server = http.createServer(app);
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      console.log('[WS] Client connected');

      // Send current session status on connect
      ws.send(JSON.stringify({ type: 'session_status', ...session.getStatus() }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());

          // ─── Browser Events (from Extension) ───
          if (msg.type === 'browser_signal') {
            let hostname = 'Browser';
            try { hostname = new URL(msg.url).hostname; } catch(e){}
            broadcast({
              type: 'event',
              app: msg.title || hostname,
              category: msg.category,
              source: 'desktop',
              timestamp: msg.timestamp || Date.now(),
              reason: msg.aiReason || null
            });
          }

          // ─── Tab Visibility Events (from Page Visibility API) ───
          if (msg.type === 'tab_away') {
            console.log('[WS] User left MindForge tab');
            if (session.isActive()) {
              session.addEvent('mindforge', 'MindForge Tab', '', 'idle', false, 'text');
            }
            // Broadcast to all clients (including ActivePage timeline)
            broadcast({
              type: 'event',
              app: 'Tab Away',
              category: 'idle',
              source: 'desktop',
              timestamp: msg.timestamp || new Date().toISOString(),
            });
          }

          if (msg.type === 'tab_return') {
            const awaySec = msg.awaySeconds || 0;
            console.log(`[WS] User returned to MindForge tab (away ${awaySec}s)`);
            if (session.isActive()) {
              // Log as distraction if away > 60s, otherwise neutral
              const cat = awaySec > 60 ? 'distraction' : 'neutral';
              session.addEvent('mindforge', 'MindForge Tab', '', cat, false, 'text');
            }
            broadcast({
              type: 'event',
              app: `Returned (${awaySec}s away)`,
              category: awaySec > 60 ? 'distraction' : 'productive',
              source: 'desktop',
              timestamp: msg.timestamp || new Date().toISOString(),
            });
          }
        } catch (_) {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => console.log('[WS] Client disconnected'));
      ws.on('error', (err) => console.error('[WS] Error:', err.message));
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') reject(new Error(`Port ${PORT} is already in use`));
      else reject(err);
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Express + WS on http://0.0.0.0:${PORT} (LAN accessible)`);
      startScorer(broadcast);
      resolve();
    });
  });
}

module.exports = { startServer, broadcast };
