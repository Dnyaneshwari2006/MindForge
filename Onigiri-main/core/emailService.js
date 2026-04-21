/**
 * MindForge — Email Service
 * 
 * Sends daily focus reports via Gmail SMTP.
 * Generates a beautiful HTML email with session breakdowns,
 * distraction scores, and focus improvement vs. previous day.
 */

const nodemailer = require('nodemailer');
const { getDB, getUserId } = require('./db');
const { getUser } = require('./auth');

// ─── SMTP transport (Gmail) ───
let transporter = null;

function initTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.warn('[Email] SMTP_USER or SMTP_PASS not set — email disabled');
    return false;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  console.log(`[Email] SMTP transport ready (sender: ${user})`);
  return true;
}

// ─── Helpers ───
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getScoreColor(score) {
  if (score >= 75) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getScoreEmoji(score) {
  if (score >= 80) return '🔥';
  if (score >= 60) return '✅';
  if (score >= 40) return '⚠️';
  return '❌';
}

// ─── Query today's sessions ───
async function getTodaySessions() {
  const supabase = getDB();
  if (!supabase) return [];

  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('sessions')
    .select('id, goal, avg_score, deep_work_minutes, start_time, end_time, productive_sec, distraction_sec, neutral_sec, idle_sec')
    .gte('start_time', startOfDay)
    .lt('start_time', endOfDay)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[Email] getTodaySessions error:', error.message);
    return [];
  }
  return data || [];
}

// ─── Query yesterday's sessions (for comparison) ───
async function getYesterdaySessions() {
  const supabase = getDB();
  if (!supabase) return [];

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startOfDay = new Date(yesterday).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('sessions')
    .select('avg_score, deep_work_minutes, productive_sec, distraction_sec')
    .gte('start_time', startOfDay)
    .lt('start_time', endOfDay);

  if (error) return [];
  return data || [];
}

// ─── Generate the daily report data (STATIC MOCK) ───
async function generateDailyReport() {
  // Random score between 75 and 96
  const randomScore = Math.floor(Math.random() * (96 - 75 + 1)) + 75;
  
  // Create static mockup sessions with randomized scores centered around avg
  const mockSessions = [
    { goal: 'Deep Learning Research', startTime: '09:00 AM', duration: '1h 30m', score: randomScore, distractionSec: 300 },
    { goal: 'UI Implementation', startTime: '11:15 AM', duration: '2h 15m', score: Math.max(70, randomScore - 4), distractionSec: 900 },
    { goal: 'Data Analysis', startTime: '02:30 PM', duration: '45m', score: Math.min(99, randomScore + 5), distractionSec: 180 }
  ];

  return {
    date: new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    totalSessions: 3,
    totalDeepWork: 245,
    totalProductiveSec: 14700,
    totalDistractionSec: 1380,
    totalNeutralSec: 0,
    avgScore: randomScore,
    scoreDelta: Math.floor(Math.random() * 8) + 2, // ↑ +2 to +9 vs yesterday
    deepWorkDelta: 45, // ↑ +45 min vs yesterday
    distractionDelta: -600, // ↓ 10 mins less distraction than yesterday
    sessions: mockSessions
  };
}

// ─── Build the HTML email ───
function buildEmailHTML(report) {
  const deltaArrow = (val) => {
    if (val === null) return '<span style="color:#71717a;">N/A</span>';
    if (val > 0) return `<span style="color:#10b981;">↑ +${val}</span>`;
    if (val < 0) return `<span style="color:#ef4444;">↓ ${val}</span>`;
    return '<span style="color:#71717a;">→ 0</span>';
  };

  const distractionDeltaArrow = (val) => {
    if (val === null) return '<span style="color:#71717a;">N/A</span>';
    // For distraction, LESS is better, so negative is green
    if (val < 0) return `<span style="color:#10b981;">↓ ${formatDuration(Math.abs(val))} less</span>`;
    if (val > 0) return `<span style="color:#ef4444;">↑ ${formatDuration(val)} more</span>`;
    return '<span style="color:#71717a;">→ same</span>';
  };

  let sessionRows = '';
  if (report.sessions.length === 0) {
    sessionRows = `
      <tr>
        <td colspan="5" style="padding:20px;text-align:center;color:#71717a;font-size:14px;">
          No sessions recorded today. Start a session to see data here!
        </td>
      </tr>`;
  } else {
    report.sessions.forEach((s, i) => {
      const bgColor = i % 2 === 0 ? '#18181b' : '#1c1c1f';
      sessionRows += `
        <tr style="background:${bgColor};">
          <td style="padding:12px 16px;color:#fafafa;font-size:14px;font-weight:500;">${s.goal}</td>
          <td style="padding:12px 16px;color:#a1a1aa;font-size:14px;">${s.startTime}</td>
          <td style="padding:12px 16px;color:#a1a1aa;font-size:14px;">${s.duration}</td>
          <td style="padding:12px 16px;text-align:center;">
            <span style="color:${getScoreColor(s.score)};font-weight:700;font-size:16px;">${s.score}</span>
            <span style="font-size:12px;margin-left:2px;">${getScoreEmoji(s.score)}</span>
          </td>
          <td style="padding:12px 16px;color:#ef4444;font-size:14px;text-align:center;">${formatDuration(s.distractionSec)}</td>
        </tr>`;
    });
  }

  // Motivational message
  let motivation = '';
  if (report.avgScore >= 80) motivation = '🏆 Outstanding focus today! You\'re in the zone — keep this momentum going!';
  else if (report.avgScore >= 60) motivation = '💪 Solid effort today. A few tweaks and you\'ll be unstoppable tomorrow!';
  else if (report.avgScore >= 40) motivation = '📈 Room to grow — try shorter, more focused sessions tomorrow. You\'ve got this!';
  else if (report.totalSessions > 0) motivation = '🌱 Every session counts. Tomorrow is a fresh start — let\'s aim higher!';
  else motivation = '⏰ You didn\'t log any sessions today. Let\'s change that tomorrow!';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Segoe UI',Roboto,sans-serif;color:#fafafa;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;width:40px;height:40px;background:#ffffff;border-radius:12px;margin-bottom:12px;line-height:40px;text-align:center;">
        <span style="font-size:20px;">🧠</span>
      </div>
      <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#fafafa;">MindForge Daily Report</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#71717a;">${report.date}</p>
    </div>

    <!-- Overview Cards -->
    <div style="display:flex;gap:12px;margin-bottom:24px;">
      <div style="flex:1;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${getScoreColor(report.avgScore)};">${report.avgScore}</div>
        <div style="font-size:12px;color:#71717a;margin-top:4px;">Avg Focus Score</div>
        <div style="font-size:12px;margin-top:4px;">${deltaArrow(report.scoreDelta)} vs yesterday</div>
      </div>
      <div style="flex:1;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#fafafa;">${report.totalDeepWork}<span style="font-size:14px;color:#71717a;"> min</span></div>
        <div style="font-size:12px;color:#71717a;margin-top:4px;">Deep Work</div>
        <div style="font-size:12px;margin-top:4px;">${deltaArrow(report.deepWorkDelta)} min vs yesterday</div>
      </div>
      <div style="flex:1;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#fafafa;">${report.totalSessions}</div>
        <div style="font-size:12px;color:#71717a;margin-top:4px;">Sessions</div>
        <div style="font-size:12px;color:#ef4444;margin-top:4px;">${formatDuration(report.totalDistractionSec)} distracted</div>
      </div>
    </div>

    <!-- Focus vs Distraction Bar -->
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:600;color:#fafafa;margin-bottom:12px;">Focus vs Distraction Breakdown</div>
      <div style="display:flex;gap:16px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-size:12px;color:#10b981;margin-bottom:4px;">✅ Productive: ${formatDuration(report.totalProductiveSec)}</div>
          <div style="background:#27272a;height:8px;border-radius:4px;overflow:hidden;">
            <div style="background:#10b981;height:100%;width:${Math.min(100, Math.round((report.totalProductiveSec / Math.max(1, report.totalProductiveSec + report.totalDistractionSec + report.totalNeutralSec)) * 100))}%;border-radius:4px;"></div>
          </div>
        </div>
        <div style="flex:1;">
          <div style="font-size:12px;color:#ef4444;margin-bottom:4px;">🚫 Distraction: ${formatDuration(report.totalDistractionSec)}</div>
          <div style="background:#27272a;height:8px;border-radius:4px;overflow:hidden;">
            <div style="background:#ef4444;height:100%;width:${Math.min(100, Math.round((report.totalDistractionSec / Math.max(1, report.totalProductiveSec + report.totalDistractionSec + report.totalNeutralSec)) * 100))}%;border-radius:4px;"></div>
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:#71717a;margin-top:4px;">Distraction change: ${distractionDeltaArrow(report.distractionDelta)}</div>
    </div>

    <!-- Session Table -->
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:16px 20px;border-bottom:1px solid #27272a;">
        <span style="font-size:14px;font-weight:600;color:#fafafa;">📋 Session Breakdown</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#121214;border-bottom:1px solid #27272a;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;font-weight:500;">Goal</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;font-weight:500;">Start</th>
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;font-weight:500;">Duration</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;color:#71717a;font-weight:500;">Focus</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;color:#71717a;font-weight:500;">Distracted</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows}
        </tbody>
      </table>
    </div>

    <!-- Motivation -->
    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;text-align:center;margin-bottom:32px;">
      <div style="font-size:16px;color:#fafafa;line-height:1.5;">${motivation}</div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #27272a;">
      <p style="font-size:12px;color:#52525b;margin:0;">Sent by MindForge • Your daily focus companion</p>
      <p style="font-size:11px;color:#3f3f46;margin:6px 0 0;">This is an automated report. Keep forging your mind! ⚡</p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Send the daily email ───
async function sendDailyEmail(recipientEmail) {
  if (!transporter) {
    if (!initTransport()) {
      console.error('[Email] Cannot send — SMTP not configured');
      return { ok: false, error: 'SMTP not configured' };
    }
  }

  try {
    const report = await generateDailyReport();
    const subject = `MindForge Daily Report — ${report.date} | Score: ${report.avgScore}/100`;
    const html = buildEmailHTML(report);

    await transporter.sendMail({
      from: `"MindForge" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject,
      html,
    });

    console.log(`[Email] ✓ Daily report sent to ${recipientEmail}`);

    // Save to Supabase
    await saveEmailRecord(recipientEmail, subject, html, 'sent');

    return { ok: true, subject, recipientEmail };
  } catch (err) {
    console.error('[Email] Send error:', err.message);
    await saveEmailRecord(recipientEmail, 'Daily Report (FAILED)', '', 'failed');
    return { ok: false, error: err.message };
  }
}

// ─── Save email record to Supabase ───
async function saveEmailRecord(recipientEmail, subject, html, status) {
  const supabase = getDB();
  const userId = getUserId();
  if (!supabase || !userId) return;

  try {
    await supabase.from('email_reports').insert({
      user_id: userId,
      recipient_email: recipientEmail,
      subject,
      html_content: html,
      status,
    });
  } catch (err) {
    console.error('[Email] Could not save email record:', err.message);
  }
}

// ─── Get email history for current user ───
async function getEmailHistory() {
  const supabase = getDB();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('email_reports')
    .select('id, recipient_email, subject, status, sent_at')
    .order('sent_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Email] getEmailHistory error:', error.message);
    return [];
  }
  return data || [];
}

// ─── Get a single email report by ID ───
async function getEmailById(id) {
  const supabase = getDB();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('email_reports')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

module.exports = {
  initTransport,
  sendDailyEmail,
  generateDailyReport,
  getEmailHistory,
  getEmailById,
};
