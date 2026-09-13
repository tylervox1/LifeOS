
import {sendPushToUser} from './push.js';

function pref(user,key,def=true){
  const p=user.preferences||{};
  return key in p ? Boolean(p[key]) : def;
}

export async function notifyDailyBrief(pool,userId){
  const u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[userId])).rows[0];
  if(!u || !pref(u,'dailyBriefNotify',String(process.env.DEFAULT_DAILY_BRIEF_NOTIFY||'true')==='true')) return;
  const b=(await pool.query(`SELECT * FROM daily_briefs WHERE user_id=$1 ORDER BY local_date DESC LIMIT 1`,[userId])).rows[0];
  if(!b)return;
  const key=`daily-brief:${b.local_date}`;
  const exists=await pool.query(`SELECT 1 FROM notification_log WHERE user_id=$1 AND dedupe_key=$2`,[userId,key]);
  if(exists.rowCount)return;
  const result=await sendPushToUser(pool,userId,{title:'Your Synchrified Daily Brief',body:b.content,url:'/?view=today',tag:key});
  await pool.query(`INSERT INTO notification_log(user_id,notification_type,dedupe_key,title,body,delivered_count,failed_count)
    VALUES($1,'daily_brief',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [userId,key,'Your Synchrified Daily Brief',b.content,result.delivered,result.failed]);
}

export async function notifyNewAlerts(pool,userId){
  const u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[userId])).rows[0];
  if(!u || !pref(u,'alertNotify',String(process.env.DEFAULT_ALERT_NOTIFY||'true')==='true')) return;
  const alerts=(await pool.query(`SELECT * FROM proactive_alerts WHERE user_id=$1 AND dismissed_at IS NULL AND created_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 5`,[userId])).rows;
  for(const a of alerts){
    const key=`alert:${a.id}`;
    if((await pool.query(`SELECT 1 FROM notification_log WHERE user_id=$1 AND dedupe_key=$2`,[userId,key])).rowCount)continue;
    const result=await sendPushToUser(pool,userId,{title:a.title,body:a.summary||'Synchrified found something that may need your attention.',url:'/?view=today',tag:key});
    await pool.query(`INSERT INTO notification_log(user_id,notification_type,dedupe_key,title,body,delivered_count,failed_count)
      VALUES($1,'alert',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [userId,key,a.title,a.summary||null,result.delivered,result.failed]);
  }
}
