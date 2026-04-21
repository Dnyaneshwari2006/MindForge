/**
 * MindForge — Seed Script
 * Inserts 7 days of realistic demo data into Supabase
 * Run: node seed.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  console.log('🌱 Seeding MindForge demo data...\n');

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;

  // ─── 1. Seed scores (every 30s during work hours for 7 days) ───
  console.log('📊 Inserting scores...');
  const scores = [];

  for (let d = 6; d >= 0; d--) {
    const dayStart = now - d * DAY;
    // Work hours: 8am - 10pm
    for (let h = 8; h <= 22; h++) {
      const hourStart = dayStart - (new Date(dayStart).getHours() - h) * HOUR;
      // Insert ~4 scores per hour (every 15 min for demo)
      for (let m = 0; m < 4; m++) {
        const ts = hourStart + m * 15 * 60 * 1000;
        let baseScore;

        // Morning focused (8-12): higher scores
        if (h >= 8 && h <= 12) baseScore = randomBetween(65, 95);
        // Afternoon dip (13-15): lower scores
        else if (h >= 13 && h <= 15) baseScore = randomBetween(40, 70);
        // Evening focus (16-19): moderate-high
        else if (h >= 16 && h <= 19) baseScore = randomBetween(55, 85);
        // Late night (20-22): lower
        else baseScore = randomBetween(30, 60);

        scores.push({
          timestamp: ts,
          score: baseScore,
        });
      }
    }
  }

  // Insert in batches of 100
  for (let i = 0; i < scores.length; i += 100) {
    const batch = scores.slice(i, i + 100);
    const { error } = await supabase.from('scores').insert(batch);
    if (error) console.error('  Score insert error:', error.message);
  }
  console.log(`  ✓ Inserted ${scores.length} scores\n`);

  // ─── 2. Seed events ───
  console.log('📝 Inserting events...');
  const apps = [
    { app: 'Visual Studio Code', category: 'productive' },
    { app: 'Cursor', category: 'productive' },
    { app: 'Terminal', category: 'productive' },
    { app: 'Chrome', category: 'browser' },
    { app: 'Notion', category: 'productive' },
    { app: 'Discord', category: 'distraction' },
    { app: 'Spotify', category: 'distraction' },
    { app: 'Figma', category: 'productive' },
  ];

  const events = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = now - d * DAY;
    for (let h = 8; h <= 22; h++) {
      const hourTs = dayStart - (new Date(dayStart).getHours() - h) * HOUR;
      // ~6 app switches per hour
      for (let e = 0; e < 6; e++) {
        const app = apps[Math.floor(Math.random() * apps.length)];
        events.push({
          timestamp: hourTs + e * 10 * 60 * 1000,
          source: 'system',
          app: app.app,
          url: null,
          category: app.category,
          is_idle: Math.random() < 0.05,
        });
      }
    }
  }

  for (let i = 0; i < events.length; i += 100) {
    const batch = events.slice(i, i + 100);
    const { error } = await supabase.from('events').insert(batch);
    if (error) console.error('  Event insert error:', error.message);
  }
  console.log(`  ✓ Inserted ${events.length} events\n`);

  // ─── 3. Seed ramp data ───
  console.log('🎯 Inserting ramp data...');
  const rampData = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date(now - d * DAY).toISOString().slice(0, 10);
    const target = 20 + Math.floor((6 - d) / 2) * 5; // Gradually increasing
    const achieved = randomBetween(Math.max(0, target - 10), target + 5);
    rampData.push({
      date,
      target_minutes: target,
      achieved,
      success: achieved >= target,
    });
  }

  const { error: rampErr } = await supabase.from('ramp').insert(rampData);
  if (rampErr) console.error('  Ramp insert error:', rampErr.message);
  console.log(`  ✓ Inserted ${rampData.length} ramp entries\n`);

  // ─── 4. Seed daily habits ───
  console.log('✅ Inserting daily habits...');
  const habitsData = [];
  let streak = 0;

  for (let d = 6; d >= 0; d--) {
    const date = new Date(now - d * DAY).toISOString().slice(0, 10);
    const read = Math.random() > 0.2;
    const meditation = Math.random() > 0.3;
    const session = Math.random() > 0.25;
    const allDone = read && meditation && session;
    streak = allDone ? streak + 1 : 0;

    habitsData.push({
      date,
      read_done: read,
      meditation_done: meditation,
      session_done: session,
      streak_count: streak,
    });
  }

  const { error: habitsErr } = await supabase.from('daily_habits').insert(habitsData);
  if (habitsErr) console.error('  Habits insert error:', habitsErr.message);
  console.log(`  ✓ Inserted ${habitsData.length} habit entries\n`);

  // ─── 5. Seed sessions ───
  console.log('📅 Inserting sessions...');
  const sessions = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = now - d * DAY;
    // 2-3 sessions per day
    const numSessions = randomBetween(2, 3);
    for (let s = 0; s < numSessions; s++) {
      const start = dayStart + (8 + s * 3) * HOUR;
      const duration = randomBetween(20, 60);
      sessions.push({
        id: `session-${d}-${s}`,
        start_time: start,
        end_time: start + duration * 60 * 1000,
        goal: ['Code sprint', 'Research', 'Reading', 'Practice'][Math.floor(Math.random() * 4)],
        avg_score: randomBetween(50, 90),
        deep_work_minutes: duration,
      });
    }
  }

  const { error: sessErr } = await supabase.from('sessions').insert(sessions);
  if (sessErr) console.error('  Session insert error:', sessErr.message);
  console.log(`  ✓ Inserted ${sessions.length} sessions\n`);

  console.log('🎉 Seed complete! Your MindForge dashboard should now show realistic data.');
}

seed().catch(console.error);
