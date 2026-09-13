import 'dotenv/config';
import { logger } from './logger.js';
import pg from 'pg';
import { enqueue } from './jobs.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const poll = Number(process.env.SCHEDULER_POLL_MS || 60000);
const sync = Number(process.env.SYNC_INTERVAL_MINUTES || 15);
const brief = Number(process.env.DAILY_BRIEF_HOUR || 8);

export async function tick() {
  const users = (await pool.query(`
    SELECT u.id, u.timezone, u.preferences,
           EXISTS(
             SELECT 1 FROM connected_accounts ca
             WHERE ca.user_id = u.id AND ca.provider = 'google'
           ) AS has_google
    FROM users u
  `)).rows;

  const bucket = Math.floor(Date.now() / (sync * 60000));
  const day = Math.floor(Date.now() / 86400000);

  for (const u of users) {
    if (u.has_google) {
      for (const [jobType, priority] of [['sync_gmail', 20], ['sync_calendar', 20]]) {
        await enqueue(pool, {
          userId: u.id,
          jobType,
          priority,
          dedupeKey: `${jobType}:${bucket}`
        });
      }
      await enqueue(pool, {
        userId: u.id,
        jobType: 'renew_gmail_watch',
        priority: 30,
        dedupeKey: `watch:${day}`
      });
    }

    await enqueue(pool, {
      userId: u.id,
      jobType: 'scan_proactive_alerts',
      priority: 40,
      dedupeKey: `scan_proactive_alerts:${bucket}`
    });

    const local = (await pool.query(
      `SELECT EXTRACT(HOUR FROM now() AT TIME ZONE $1)::int h,
              (now() AT TIME ZONE $1)::date d`,
      [u.timezone || 'UTC']
    )).rows[0];
    const userBriefHour = Number(u.preferences?.dailyBriefHour ?? brief);
    if (local.h >= userBriefHour) {
      await enqueue(pool, {
        userId: u.id,
        jobType: 'generate_daily_brief',
        priority: 60,
        dedupeKey: `brief:${local.d}`
      });
    }
  }

  logger.info({ users: users.length }, 'Synchrified scheduler tick completed');
}

async function runOnce() {
  logger.info('Synchrified scheduler one-shot run starting');
  try {
    await tick();
  } finally {
    await pool.end();
  }
}

async function runContinuous() {
  logger.info({ pollMs: poll }, 'Synchrified continuous scheduler starting');
  while (true) {
    try {
      await tick();
    } catch (error) {
      logger.error({ error }, 'Synchrified scheduler tick failed');
    }
    await sleep(poll);
  }
}

if (process.env.SCHEDULER_ONESHOT === 'true') {
  runOnce().catch(error => {
    logger.error({ error }, 'Synchrified scheduler one-shot failed');
    process.exitCode = 1;
  });
} else {
  runContinuous().catch(error => {
    logger.error({ error }, 'Synchrified scheduler failed');
    process.exitCode = 1;
  });
}
