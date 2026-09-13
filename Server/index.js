
import 'dotenv/config';
import express from 'express';import cookieParser from 'cookie-parser';import pg from 'pg';import helmet from 'helmet';import rateLimit from 'express-rate-limit';import pinoHttp from 'pino-http';import { logger } from './logger.js';
import {authMiddleware,csrfGuard,createSession,register,login,issueAuthToken} from './auth.js';import {validateProductionConfig} from './config.js';import {validateInvite,redeemInvite,createInvite} from './invites.js';import {register as metricsRegister,httpRequests,collectJobMetrics} from './metrics.js';import {vapidPublicKey} from './push.js';import {planFor} from './plans.js';import {incrementUsage,currentUsage} from './usage.js';import {createCheckoutSession,createPortalSession,handleStripeWebhook} from './billing.js';import {captureProductEvent,captureError} from './telemetry.js';import {adminGuard} from './admin.js';
import {hashToken} from './crypto.js';import {googleAuthUrl,handleGoogleCallback,disconnectGoogle,verifyPubSub} from './google.js';
import {enqueue} from './jobs.js';import {assistantTurn} from './assistant.js';import {decideApproval} from './actions.js';

validateProductionConfig();
const {Pool}=pg,app=express(),PORT=process.env.PORT||3000,pool=new Pool({connectionString:process.env.DATABASE_URL});
if(process.env.TRUST_PROXY)app.set('trust proxy',Number(process.env.TRUST_PROXY)||1);
app.post('/api/billing/webhook',express.raw({type:'application/json'}),async(req,res)=>{
  try{
    const event=await handleStripeWebhook(pool,req.body,req.get('stripe-signature'));
    await captureProductEvent(pool,{event:'billing_webhook_received',properties:{type:event.type}});
    res.json({received:true});
  }catch(e){
    captureError(e,{area:'stripe_webhook'});
    res.status(400).json({error:'invalid webhook'});
  }
});

app.use(pinoHttp({logger}));
app.use((req,res,next)=>{
  res.on('finish',()=>httpRequests.inc({method:req.method,route:req.route?.path||req.path||'unknown',status:String(res.statusCode)}));
  next();
});
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'1mb'}));app.use(cookieParser());app.use(express.static('public'));
const authLimit=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false});
app.get('/api/health',(req,res)=>res.json({ok:true,version:'3.1',service:'lifeos-api'}));


app.get('/api/readiness',async(req,res)=>{
  try{
    if(String(process.env.HEALTH_REQUIRE_DB||'true')==='true') await pool.query('SELECT 1');
    res.json({ok:true,version:'3.1',database:'ready'});
  }catch(e){
    req.log?.error({err:e},'readiness failed');
    res.status(503).json({ok:false,database:'unavailable'});
  }
});


app.get('/metrics',async(req,res)=>{
  if(String(process.env.METRICS_ENABLED||'true')!=='true') return res.status(404).end();
  try{
    await collectJobMetrics(pool);
    res.set('Content-Type',metricsRegister.contentType);
    res.end(await metricsRegister.metrics());
  }catch(e){
    req.log?.error({err:e},'metrics failed');
    res.status(503).end();
  }
});


app.get('/api/public/beta-status',(req,res)=>res.json({
  signupsOpen:String(process.env.BETA_SIGNUPS_OPEN||'true')==='true',
  requireInvite:String(process.env.REQUIRE_INVITE||'true')==='true',
  waitlistEnabled:String(process.env.WAITLIST_ENABLED||'true')==='true'
}));
app.post('/api/public/waitlist',authLimit,async(req,res)=>{
  if(String(process.env.WAITLIST_ENABLED||'true')!=='true')return res.status(404).json({error:'waitlist is disabled'});
  const email=String(req.body.email||'').trim().toLowerCase(),name=String(req.body.name||'').trim()||null;
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.status(400).json({error:'valid email required'});
  const r=await pool.query(
    `INSERT INTO waitlist_entries(email,name,source) VALUES($1,$2,$3)
     ON CONFLICT(email) DO UPDATE SET name=COALESCE(EXCLUDED.name,waitlist_entries.name),updated_at=now()
     RETURNING id,email,status,created_at`,
    [email,name,'public']
  );
  res.status(201).json(r.rows[0]);
});

app.post('/api/auth/register',authLimit,async(req,res)=>{
  try{
    if(String(process.env.BETA_SIGNUPS_OPEN||'true')!=='true')return res.status(403).json({error:'beta signups are currently closed'});
    let invite=null;
    if(String(process.env.REQUIRE_INVITE||'true')==='true'){
      invite=await validateInvite(pool,req.body.inviteCode);
      if(!invite)return res.status(403).json({error:'a valid beta invite code is required'});
    }
    const u=await register(pool,req.body);
    try{
      if(invite)await redeemInvite(pool,invite.id,u.id);
    }catch(e){
      await pool.query(`DELETE FROM users WHERE id=$1`,[u.id]).catch(()=>{});
      throw e;
    }
    const s=await createSession(pool,u,req,res),tok=await issueAuthToken(pool,u.id,'verify_email',1440);
    await enqueue(pool,{userId:u.id,jobType:'send_verification_email',payload:{email:u.email,token:tok},priority:5});
    await captureProductEvent(pool,{userId:u.id,event:'beta_registration'});
    res.status(201).json({user:u,csrf:s.csrf});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/push/subscribe',async(req,res)=>{
  const s=req.body;if(!s?.endpoint||!s?.keys?.p256dh||!s?.keys?.auth)return res.status(400).json({error:'invalid subscription'});
  await pool.query(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,user_agent) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id,endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,updated_at=now()`,
    [req.user.id,s.endpoint,s.keys.p256dh,s.keys.auth,req.headers['user-agent']||null]);
  res.status(201).json({ok:true});
});
app.delete('/api/push/subscribe',async(req,res)=>{
  const endpoint=String(req.body.endpoint||'');await pool.query(`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`,[req.user.id,endpoint]);res.json({ok:true});
});
app.post('/api/sync/recover',async(req,res)=>{
  const provider=req.body.provider;
  if(!['gmail','calendar'].includes(provider))return res.status(400).json({error:'invalid provider'});
  await pool.query(`DELETE FROM sync_state WHERE user_id=$1 AND provider=$2`,[req.user.id,provider]);
  await enqueue(pool,{userId:req.user.id,jobType:provider==='gmail'?'sync_gmail':'sync_calendar',priority:1,dedupeKey:`recover:${provider}:${Date.now()}`});
  res.status(202).json({ok:true});
});

app.get('/api/dashboard',async(req,res)=>{
  const uid=req.user.id;
  const [alerts,brief,events,tasks]=await Promise.all([
    pool.query(`SELECT * FROM proactive_alerts WHERE user_id=$1 AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 8`,[uid]),
    pool.query(`SELECT * FROM daily_briefs WHERE user_id=$1 ORDER BY local_date DESC LIMIT 1`,[uid]),
    pool.query(`SELECT * FROM events WHERE user_id=$1 AND deleted=false AND start_time>=now() ORDER BY start_time LIMIT 6`,[uid]),
    pool.query(`SELECT * FROM tasks WHERE user_id=$1 AND status='open' ORDER BY due_at NULLS LAST,created_at DESC LIMIT 8`,[uid])
  ]);
  res.json({attention:alerts.rows,brief:brief.rows[0]?.content||'Nothing urgent is currently detected.',upcoming:events.rows,tasks:tasks.rows});
});
app.get('/api/tasks',async(req,res)=>res.json((await pool.query(`SELECT * FROM tasks WHERE user_id=$1 ORDER BY status,due_at NULLS LAST,created_at DESC`,[req.user.id])).rows));
app.get('/api/inbox',async(req,res)=>res.json((await pool.query(`SELECT * FROM inbox_items WHERE user_id=$1 ORDER BY importance DESC,occurred_at DESC NULLS LAST LIMIT 100`,[req.user.id])).rows));
app.get('/api/memories',async(req,res)=>res.json((await pool.query(`SELECT * FROM memories WHERE user_id=$1 ORDER BY importance DESC,created_at DESC`,[req.user.id])).rows));

app.get('/api/plan',async(req,res)=>{
  const p=planFor(req.user);
  const [assistantUsed,syncUsed]=await Promise.all([
    currentUsage(pool,req.user.id,'assistant_messages','month'),
    currentUsage(pool,req.user.id,'manual_syncs','day')
  ]);
  res.json({plan:req.user.plan||'free',subscriptionStatus:req.user.subscription_status||null,limits:p,usage:{assistantMessages:assistantUsed,manualSyncs:syncUsed}});
});
app.post('/api/billing/checkout',async(req,res)=>{
  try{
    const plan=req.body.plan;
    if(!['plus','pro'].includes(plan))return res.status(400).json({error:'invalid plan'});
    const session=await createCheckoutSession(pool,req.user,{plan});
    await captureProductEvent(pool,{userId:req.user.id,event:'billing_checkout_created',properties:{plan}});
    res.json({url:session.url});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/billing/portal',async(req,res)=>{
  try{const session=await createPortalSession(req.user);res.json({url:session.url})}
  catch(e){res.status(400).json({error:e.message})}
});
app.post('/api/legal/accept',async(req,res)=>{
  const privacy=process.env.PRIVACY_VERSION||'2026-09-13',terms=process.env.TERMS_VERSION||'2026-09-13';
  await pool.query(`UPDATE users SET privacy_accepted_version=$1,terms_accepted_version=$2 WHERE id=$3`,[privacy,terms,req.user.id]);
  res.json({ok:true,privacy,terms});
});
app.post('/api/support',async(req,res)=>{
  const subject=String(req.body.subject||'').trim(),message=String(req.body.message||'').trim();
  if(!subject||!message)return res.status(400).json({error:'subject and message required'});
  const r=await pool.query(`INSERT INTO support_tickets(user_id,email,category,subject,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at`,
    [req.user.id,req.user.email,req.body.category||'general',subject,message]);
  await captureProductEvent(pool,{userId:req.user.id,event:'support_ticket_created',properties:{category:req.body.category||'general'}});
  res.status(201).json(r.rows[0]);
});


app.post('/api/admin/invites',adminGuard,async(req,res)=>{
  try{
    const invite=await createInvite(pool,{
      label:req.body.label,
      maxUses:req.body.maxUses||1,
      expiresAt:req.body.expiresAt||null,
      createdBy:req.user?.email||'admin'
    });
    res.status(201).json(invite);
  }catch(e){res.status(400).json({error:e.message})}
});
app.get('/api/admin/invites',adminGuard,async(req,res)=>{
  res.json((await pool.query(
    `SELECT id,label,max_uses,used_count,expires_at,disabled_at,created_by,created_at
     FROM beta_invites ORDER BY created_at DESC LIMIT 200`
  )).rows);
});
app.post('/api/admin/invites/:id/disable',adminGuard,async(req,res)=>{
  const r=await pool.query(`UPDATE beta_invites SET disabled_at=now() WHERE id=$1 RETURNING id,disabled_at`,[req.params.id]);
  if(!r.rowCount)return res.status(404).json({error:'invite not found'});
  res.json(r.rows[0]);
});
app.get('/api/admin/waitlist',adminGuard,async(req,res)=>{
  res.json((await pool.query(`SELECT * FROM waitlist_entries ORDER BY created_at DESC LIMIT 500`)).rows);
});
app.patch('/api/admin/waitlist/:id',adminGuard,async(req,res)=>{
  const status=String(req.body.status||'waiting');
  const r=await pool.query(`UPDATE waitlist_entries SET status=$1,notes=COALESCE($2,notes),invited_at=CASE WHEN $1='invited' THEN COALESCE(invited_at,now()) ELSE invited_at END,updated_at=now() WHERE id=$3 RETURNING *`,
    [status,req.body.notes||null,req.params.id]);
  if(!r.rowCount)return res.status(404).json({error:'waitlist entry not found'});
  res.json(r.rows[0]);
});

app.get('/api/admin/summary',adminGuard,async(req,res)=>{
  const [users,plans,tickets,jobs,events]=await Promise.all([
    pool.query(`SELECT count(*)::int c FROM users`),
    pool.query(`SELECT plan,count(*)::int c FROM users GROUP BY plan ORDER BY plan`),
    pool.query(`SELECT status,count(*)::int c FROM support_tickets GROUP BY status ORDER BY status`),
    pool.query(`SELECT status,count(*)::int c FROM jobs GROUP BY status ORDER BY status`),
    pool.query(`SELECT event_name,count(*)::int c FROM product_events WHERE created_at>now()-interval '7 days' GROUP BY event_name ORDER BY c DESC LIMIT 20`)
  ]);
  res.json({users:users.rows[0].c,plans:plans.rows,tickets:tickets.rows,jobs:jobs.rows,recentEvents:events.rows});
});
app.get('/api/admin/users',adminGuard,async(req,res)=>{
  res.json((await pool.query(`SELECT id,email,name,plan,subscription_status,email_verified_at,onboarding_completed_at,last_active_at,created_at FROM users ORDER BY created_at DESC LIMIT 200`)).rows);
});
app.get('/api/admin/support',adminGuard,async(req,res)=>{
  res.json((await pool.query(`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200`)).rows);
});
app.patch('/api/admin/support/:id',adminGuard,async(req,res)=>{
  const status=req.body.status||'open',notes=req.body.admin_notes||null;
  const r=await pool.query(`UPDATE support_tickets SET status=$1,admin_notes=$2,updated_at=now() WHERE id=$3 RETURNING *`,[status,notes,req.params.id]);
  if(!r.rows[0])return res.status(404).json({error:'ticket not found'});res.json(r.rows[0]);
});

app.get('/api/status',async(req,res)=>{
  const uid=req.user.id;
  const [acct,syncs,alerts,jobs]=await Promise.all([
    pool.query(`SELECT provider,provider_account_id,metadata,connected_at,updated_at FROM connected_accounts WHERE user_id=$1 ORDER BY updated_at DESC`,[uid]),
    pool.query(`SELECT provider,cursor,last_full_sync_at,last_incremental_sync_at,last_error,updated_at FROM sync_state WHERE user_id=$1 ORDER BY provider`,[uid]),
    pool.query(`SELECT count(*)::int AS open FROM proactive_alerts WHERE user_id=$1 AND dismissed_at IS NULL`,[uid]),
    pool.query(`SELECT status,count(*)::int AS count FROM jobs WHERE user_id=$1 GROUP BY status`,[uid])
  ]);
  res.json({connections:acct.rows,sync:syncs.rows,openAlerts:alerts.rows[0]?.open||0,jobs:Object.fromEntries(jobs.rows.map(x=>[x.status,x.count]))});
});
app.get('/api/memory-candidates',async(req,res)=>res.json((await pool.query(`SELECT * FROM memory_candidates WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC`,[req.user.id])).rows));
app.post('/api/memory-candidates/:id/decision',async(req,res)=>{
 const decision=req.body.decision;if(!['remember','reject'].includes(decision))return res.status(400).json({error:'invalid decision'});
 const c=(await pool.query(`SELECT * FROM memory_candidates WHERE id=$1 AND user_id=$2 AND status='pending'`,[req.params.id,req.user.id])).rows[0];
 if(!c)return res.status(404).json({error:'candidate not found'});
 if(decision==='remember')await pool.query(`INSERT INTO memories(user_id,memory_type,content,confidence,source_id) VALUES($1,$2,$3,$4,$5)`,[req.user.id,c.memory_type,c.content,c.confidence,c.source_id]);
 await pool.query(`UPDATE memory_candidates SET status=$1 WHERE id=$2`,[decision==='remember'?'accepted':'rejected',c.id]);res.json({ok:true});
});
app.post('/api/alerts/:id/dismiss',async(req,res)=>{const r=await pool.query(`UPDATE proactive_alerts SET dismissed_at=now() WHERE id=$1 AND user_id=$2 RETURNING id`,[req.params.id,req.user.id]);if(!r.rows[0])return res.status(404).json({error:'alert not found'});res.json({ok:true})});
app.post('/api/sync',async(req,res)=>{
  const plan=planFor(req.user),used=await currentUsage(pool,req.user.id,'manual_syncs','day');
  if(used>=plan.manualSyncsPerDay)return res.status(402).json({error:'daily manual sync limit reached',limit:plan.manualSyncsPerDay});
  const stamp=Date.now(),types=['sync_gmail','sync_calendar','scan_proactive_alerts','generate_daily_brief'];
  for(const [i,t] of types.entries())await enqueue(pool,{userId:req.user.id,jobType:t,priority:10+i*10,dedupeKey:`manual:${t}:${stamp}`});
  await incrementUsage(pool,req.user.id,'manual_syncs',1,'day');
  res.status(202).json({ok:true,queued:types});
});
app.post('/api/tasks',async(req,res)=>{const title=String(req.body.title||'').trim();if(!title)return res.status(400).json({error:'title required'});res.status(201).json((await pool.query(`INSERT INTO tasks(user_id,title,description,due_at,priority) VALUES($1,$2,$3,$4,$5) RETURNING *`,[req.user.id,title,req.body.description||null,req.body.due_at||null,req.body.priority||'normal'])).rows[0])});
app.patch('/api/tasks/:id',async(req,res)=>{const fields=[],vals=[];let n=1;for(const k of ['title','description','due_at','priority','status'])if(k in req.body){fields.push(`${k}=$${n++}`);vals.push(req.body[k])}if('status'in req.body)fields.push(`completed_at=CASE WHEN $${n-1}='completed' THEN now() ELSE NULL END`);if(!fields.length)return res.status(400).json({error:'no changes'});vals.push(req.params.id,req.user.id);const idPos=n++,userPos=n;const r=await pool.query(`UPDATE tasks SET ${fields.join(',')} WHERE id=$${idPos} AND user_id=$${userPos} RETURNING *`,vals);if(!r.rows[0])return res.status(404).json({error:'task not found'});res.json(r.rows[0])});

app.post('/api/assistant',async(req,res)=>{
  try{
    const plan=planFor(req.user),used=await currentUsage(pool,req.user.id,'assistant_messages','month');
    if(used>=plan.assistantMessagesPerMonth)return res.status(402).json({error:'monthly assistant limit reached',limit:plan.assistantMessagesPerMonth,plan:req.user.plan||'free'});
    const out=await assistantTurn(pool,req.user.id,String(req.body.message||''));
    await incrementUsage(pool,req.user.id,'assistant_messages',1,'month');
    await captureProductEvent(pool,{userId:req.user.id,event:'assistant_message'});
    res.json(out);
  }catch(e){captureError(e,{area:'assistant'});res.status(500).json({error:e.message})}
});
app.get('/api/approvals',async(req,res)=>res.json((await pool.query(`SELECT * FROM approvals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.user.id])).rows));
app.post('/api/approvals/:id/decision',async(req,res)=>{try{res.json(await decideApproval(pool,req.user.id,req.params.id,req.body.decision))}catch(e){res.status(400).json({error:e.message})}});

app.get('/api/account/export',async(req,res)=>{
  const uid=req.user.id;
  const tables=['tasks','inbox_items','events','memories','memory_candidates','proactive_alerts','daily_briefs','approvals','audit_log'];
  const out={exportedAt:new Date().toISOString(),user:{id:req.user.id,email:req.user.email,name:req.user.name,timezone:req.user.timezone}};
  for(const t of tables)out[t]=(await pool.query(`SELECT * FROM ${t} WHERE user_id=$1 ORDER BY 1`,[uid])).rows;
  res.setHeader('Content-Disposition','attachment; filename="lifeos-export.json"');res.json(out)
});
app.delete('/api/account',async(req,res)=>{
  const uid=req.user.id;await pool.query(`DELETE FROM users WHERE id=$1`,[uid]);res.clearCookie('lifeos_session');res.json({ok:true})
});
app.get('/api/sessions',async(req,res)=>res.json((await pool.query(`SELECT id,user_agent,ip_address,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=$1 ORDER BY last_seen_at DESC`,[req.user.id])).rows.map(x=>({...x,current:req.session?.id===x.id}))));
app.delete('/api/sessions/:id',async(req,res)=>{await pool.query(`DELETE FROM sessions WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.id]);res.json({ok:true})});
app.get('/api/jobs',async(req,res)=>res.json((await pool.query(`SELECT id,job_type,status,attempts,last_error,created_at FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.user.id])).rows));

app.use((err,req,res,next)=>{req.log?.error({err},'request failed');captureError(err,{path:req.path});res.status(500).json({error:'internal server error'})});
if(process.env.NO_LISTEN!=='true'){
  app.listen(PORT,()=>logger.info({port:PORT},'LifeOS V2.7 API started'));
}
export { app, pool };
