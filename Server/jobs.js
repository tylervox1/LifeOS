
export async function enqueue(pool,{userId=null,jobType,payload={},priority=100,runAt=null,maxAttempts=5,dedupeKey=null}){
  const r=await pool.query(
    `INSERT INTO jobs(user_id,job_type,payload,priority,run_at,max_attempts,dedupe_key)
     VALUES($1,$2,$3,$4,COALESCE($5,now()),$6,$7) ON CONFLICT DO NOTHING RETURNING *`,
    [userId,jobType,payload,priority,runAt,maxAttempts,dedupeKey]);
  return r.rows[0]||null;
}
export async function claimNext(pool,workerId){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const r=await c.query(`SELECT * FROM jobs WHERE status='queued' AND run_at<=now() ORDER BY priority,run_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    if(!r.rows[0]){await c.query('COMMIT');return null}
    const u=await c.query(`UPDATE jobs SET status='running',locked_at=now(),locked_by=$1,attempts=attempts+1,updated_at=now() WHERE id=$2 RETURNING *`,[workerId,r.rows[0].id]);
    await c.query('COMMIT');return u.rows[0];
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export const complete=(pool,id)=>pool.query(`UPDATE jobs SET status='completed',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1`,[id]);
export async function fail(pool,j,e){
  const retry=j.attempts<j.max_attempts,delay=Math.min(3600,Math.pow(2,Math.max(j.attempts-1,0))*30);
  await pool.query(`UPDATE jobs SET status=$1,last_error=$2,locked_at=NULL,locked_by=NULL,run_at=CASE WHEN $1='queued' THEN now()+($3||' seconds')::interval ELSE run_at END,updated_at=now() WHERE id=$4`,
    [retry?'queued':'failed',String(e?.message||e),String(delay),j.id]);
}
export const recoverStale=pool=>pool.query(`UPDATE jobs SET status='queued',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE status='running' AND locked_at<now()-interval '15 minutes'`);
