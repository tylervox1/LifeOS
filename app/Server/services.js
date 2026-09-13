
import {createGmailDraft,sendGmail,createCalendarEvent,syncGmail,syncCalendar,renewGmailWatch} from './google.js';
import {sendTransactional} from './email.js';import {appPublicUrl} from './urls.js';import {notifyDailyBrief,notifyNewAlerts} from './notifications.js';

async function executeApproval(pool,userId,id){
  const a=(await pool.query(`SELECT * FROM approvals WHERE id=$1 AND user_id=$2 AND status='approved' AND executed_at IS NULL`,[id,userId])).rows[0];
  if(!a)return;
  let result;
  if(a.action_type==='create_email_draft')result=await createGmailDraft(pool,userId,a.action_payload);
  else if(a.action_type==='send_email')result=await sendGmail(pool,userId,a.action_payload);
  else if(a.action_type==='create_calendar_event')result=await createCalendarEvent(pool,userId,a.action_payload);
  else throw new Error('Unsupported approved action');
  await pool.query(`UPDATE approvals SET executed_at=now(),execution_result=$1 WHERE id=$2`,[result,a.id]);
  await pool.query(`INSERT INTO audit_log(user_id,event_type,details) VALUES($1,'approval_executed',$2)`,[userId,{approvalId:a.id,actionType:a.action_type}]);
}
async function scanAlerts(pool,userId){
  await pool.query(`INSERT INTO proactive_alerts(user_id,alert_key,title,summary,severity,source_type)
    SELECT $1,'task-overdue:'||id,'Overdue task',title,'high','task' FROM tasks
    WHERE user_id=$1 AND status='open' AND due_at<now() ON CONFLICT(user_id,alert_key) DO NOTHING`,[userId]);
  await pool.query(`INSERT INTO proactive_alerts(user_id,alert_key,title,summary,severity,source_type,source_id)
    SELECT $1,'event-24h:'||id,'Upcoming event',title,'medium','event',id::text FROM events
    WHERE user_id=$1 AND deleted=false AND start_time BETWEEN now() AND now()+interval '24 hours'
    ON CONFLICT(user_id,alert_key) DO NOTHING`,[userId]);
  await pool.query(`INSERT INTO proactive_alerts(user_id,alert_key,title,summary,severity,source_type,source_id)
    SELECT $1,'mail-action:'||id,title,summary,'medium','gmail',id::text FROM inbox_items
    WHERE user_id=$1 AND action_required=true AND created_at>now()-interval '2 days'
    ON CONFLICT(user_id,alert_key) DO NOTHING`,[userId]);
}
async function generateBrief(pool,userId){
  const u=(await pool.query(`SELECT timezone FROM users WHERE id=$1`,[userId])).rows[0];if(!u)return;
  const date=(await pool.query(`SELECT (now() AT TIME ZONE $1)::date d`,[u.timezone||'UTC'])).rows[0].d;
  const [a,e,t]=await Promise.all([
    pool.query(`SELECT title,summary,severity FROM proactive_alerts WHERE user_id=$1 AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 5`,[userId]),
    pool.query(`SELECT title,start_time FROM events WHERE user_id=$1 AND deleted=false AND start_time>=now() ORDER BY start_time LIMIT 5`,[userId]),
    pool.query(`SELECT title,due_at FROM tasks WHERE user_id=$1 AND status='open' ORDER BY due_at NULLS LAST LIMIT 5`,[userId])]);
  let text='';
  if(process.env.OPENAI_API_KEY){
    try{
      const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({
        model:process.env.OPENAI_MODEL||'gpt-5.6',input:`Write a concise LifeOS daily brief. Alerts:${JSON.stringify(a.rows)} Events:${JSON.stringify(e.rows)} Tasks:${JSON.stringify(t.rows)}`})});
      const d=await r.json();if(r.ok)text=d.output_text||'';
    }catch{}
  }
  if(!text){
    const p=[];if(a.rows.length)p.push(`${a.rows.length} alert${a.rows.length===1?'':'s'} need attention.`);
    if(e.rows.length)p.push(`Next event: ${e.rows[0].title}.`);if(t.rows.length)p.push(`${t.rows.length} open task${t.rows.length===1?'':'s'} are prioritized.`);
    text=p.join(' ')||'Nothing urgent is currently detected.';
  }
  await pool.query(`INSERT INTO daily_briefs(user_id,local_date,content) VALUES($1,$2,$3)
    ON CONFLICT(user_id,local_date) DO UPDATE SET content=EXCLUDED.content,generated_at=now()`,[userId,date,text]);
}
export async function processJob(pool,j){
  switch(j.job_type){
    case 'execute_approval': return executeApproval(pool,j.user_id,j.payload.approvalId);
    case 'sync_gmail': return syncGmail(pool,j.user_id);
    case 'sync_calendar': return syncCalendar(pool,j.user_id);
    case 'renew_gmail_watch': return renewGmailWatch(pool,j.user_id);
    case 'scan_proactive_alerts': { const r=await scanAlerts(pool,j.user_id); await notifyNewAlerts(pool,j.user_id); return r; }
    case 'generate_daily_brief': { const r=await generateBrief(pool,j.user_id); await notifyDailyBrief(pool,j.user_id); return r; }
    case 'send_verification_email': {
      const base=appPublicUrl(); if(!base) throw new Error('Public app URL is not configured for email links');
      return sendTransactional({to:j.payload.email,subject:'Verify your LifeOS email',text:`Verify: ${base}/?verify=${j.payload.token}`});
    }
    case 'send_password_reset_email': {
      const base=appPublicUrl(); if(!base) throw new Error('Public app URL is not configured for email links');
      return sendTransactional({to:j.payload.email,subject:'Reset your LifeOS password',text:`Reset: ${base}/?reset=${j.payload.token}`});
    }
    default: throw new Error(`Unknown job type: ${j.job_type}`);
  }
}
