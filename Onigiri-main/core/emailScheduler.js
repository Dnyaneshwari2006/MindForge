/**
 * MindForge — Email Scheduler
 * 
 * Runs a cron job at 6:00 PM IST daily to send the focus report.
 * Uses the currently authenticated user's email as recipient.
 */

const cron = require('node-cron');
const { sendDailyEmail, initTransport } = require('./emailService');
const { getUser } = require('./auth');

let schedulerActive = false;

/**
 * Start the daily email scheduler.
 * Fires at 18:00 (6 PM) every day, Asia/Kolkata timezone.
 */
function startEmailScheduler() {
  // Initialize SMTP transport
  const smtpReady = initTransport();
  if (!smtpReady) {
    console.warn('[Email] Scheduler not started — SMTP not configured');
    return;
  }

  // Schedule: minute hour day month weekday
  // "0 18 * * *" = 6:00 PM every day
  cron.schedule('0 18 * * *', async () => {
    console.log('[Email] ⏰ 6 PM — triggering daily report...');
    
    try {
      const user = getUser();
      if (!user || !user.email) {
        console.warn('[Email] No authenticated user — skipping daily email');
        return;
      }

      const result = await sendDailyEmail(user.email);
      if (result.ok) {
        console.log(`[Email] ✓ Daily report sent to ${user.email}`);
      } else {
        console.error(`[Email] ✗ Failed: ${result.error}`);
      }
    } catch (err) {
      console.error('[Email] Scheduler error:', err.message);
    }
  }, {
    timezone: 'Asia/Kolkata',
  });

  schedulerActive = true;
  console.log('[Email] ✓ Daily email scheduler active (6:00 PM IST)');
}

function isSchedulerActive() {
  return schedulerActive;
}

module.exports = { startEmailScheduler, isSchedulerActive };
