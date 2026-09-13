
import pg from 'pg';
const {Pool}=pg;

export function testPool(){
  if(!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL or DATABASE_URL required');
  return new Pool({connectionString:process.env.TEST_DATABASE_URL||process.env.DATABASE_URL});
}
export async function resetData(pool){
  await pool.query(`
    TRUNCATE audit_log,jobs,daily_briefs,proactive_alerts,sync_state,approvals,memory_candidates,memories,
    inbox_items,tasks,events,connected_accounts,auth_tokens,sessions,users RESTART IDENTITY CASCADE
  `);
}
