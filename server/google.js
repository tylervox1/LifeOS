
import crypto from 'crypto';
import {OAuth2Client} from 'google-auth-library';
import {encrypt,decrypt} from './crypto.js';
import {safeText} from './attention.js';

const TOKEN=process.env.GOOGLE_TOKEN_URL||'https://oauth2.googleapis.com/token', GMAIL=process.env.GOOGLE_GMAIL_BASE||'https://gmail.googleapis.com/gmail/v1/users/me', CAL=process.env.GOOGLE_CALENDAR_BASE||'https://www.googleapis.com/calendar/v3';
const WRITE=String(process.env.GOOGLE_WRITE_ACTIONS_ENABLED||'false')==='true';

function signState(userId){
  const body=Buffer.from(JSON.stringify({userId,exp:Date.now()+600000})).toString('base64url');
  const sig=crypto.createHmac('sha256',process.env.APP_SECRET).update(body).digest('base64url');return `${body}.${sig}`;
}
function checkState(s){
  const [b,g]=String(s||'').split('.');if(!b||!g)return null;
  const w=crypto.createHmac('sha256',process.env.APP_SECRET).update(b).digest('base64url');
  if(g.length!==w.length||!crypto.timingSafeEqual(Buffer.from(g),Buffer.from(w)))return null;
  const d=JSON.parse(Buffer.from(b,'base64url').toString());return d.exp>Date.now()?d:null;
}
export function googleAuthUrl(userId){
  const scopes=['openid','email','profile','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
  if(WRITE)scopes.push('https://www.googleapis.com/auth/gmail.compose','https://www.googleapis.com/auth/calendar.events');
  const q=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:process.env.GOOGLE_REDIRECT_URI,response_type:'code',access_type:'offline',prompt:'consent',scope:scopes.join(' '),state:signState(userId)});
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
async function tokenReq(params){
  const r=await fetch(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)});const d=await r.json();
  if(!r.ok)throw new Error(`Google token error ${r.status}`);return d;
}
export async function handleGoogleCallback(pool,{code,state}){
  const s=checkState(state);if(!s)throw new Error('Invalid or expired OAuth state');
  const t=await tokenReq({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:process.env.GOOGLE_REDIRECT_URI,grant_type:'authorization_code'});
  const u=await fetch(process.env.GOOGLE_USERINFO_URL||'https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${t.access_token}`}}).then(r=>r.json());
  await pool.query(
    `INSERT INTO connected_accounts(user_id,provider,provider_account_id,access_token_encrypted,refresh_token_encrypted,expires_at,permissions,metadata)
     VALUES($1,'google',$2,$3,$4,$5,$6,$7)
     ON CONFLICT(user_id,provider,provider_account_id) DO UPDATE SET access_token_encrypted=EXCLUDED.access_token_encrypted,
     refresh_token_encrypted=COALESCE(EXCLUDED.refresh_token_encrypted,connected_accounts.refresh_token_encrypted),expires_at=EXCLUDED.expires_at,
     permissions=EXCLUDED.permissions,metadata=EXCLUDED.metadata,updated_at=now()`,
    [s.userId,u.sub,encrypt(t.access_token),t.refresh_token?encrypt(t.refresh_token):null,new Date(Date.now()+t.expires_in*1000),JSON.stringify(t.scope?.split(' ')||[]),{email:u.email,name:u.name}]
  );return s.userId;
}
async function account(pool,userId){
  const a=(await pool.query(`SELECT * FROM connected_accounts WHERE user_id=$1 AND provider='google' ORDER BY updated_at DESC LIMIT 1`,[userId])).rows[0];
  if(!a)throw new Error('Google account not connected');let access=decrypt(a.access_token_encrypted);
  if(a.expires_at&&new Date(a.expires_at).getTime()<Date.now()+60000){
    const refresh=decrypt(a.refresh_token_encrypted);if(!refresh)throw new Error('Google refresh token missing');
    const t=await tokenReq({refresh_token:refresh,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token'});
    access=t.access_token;await pool.query(`UPDATE connected_accounts SET access_token_encrypted=$1,expires_at=$2,updated_at=now() WHERE id=$3`,[encrypt(access),new Date(Date.now()+t.expires_in*1000),a.id]);
  }return {a,access};
}
async function api(url,access,opt={}){
  const r=await fetch(url,{...opt,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json',...(opt.headers||{})}});
  const d=await r.json().catch(()=>null);if(!r.ok){const e=new Error(`Google API ${r.status}`);e.status=r.status;e.body=d;throw e}return d;
}
export async function disconnectGoogle(pool,userId){
  const {a,access}=await account(pool,userId);
  try{await fetch(`${process.env.GOOGLE_REVOKE_URL||'https://oauth2.googleapis.com/revoke'}?token=${encodeURIComponent(access)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}})}catch{}
  await pool.query(`DELETE FROM connected_accounts WHERE id=$1`,[a.id]);
  await pool.query(`DELETE FROM sync_state WHERE user_id=$1 AND provider IN ('gmail','calendar')`,[userId]);
}

function decodePlain(payload){
  const stack=[payload],texts=[];
  while(stack.length){
    const p=stack.pop();
    if(p?.parts)stack.push(...p.parts);
    if(p?.mimeType==='text/plain'&&p.body?.data){
      try{texts.push(Buffer.from(p.body.data.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'))}catch{}
    }
  }
  return texts.join('\n').slice(0,4000);
}
function classify(subject,body=''){
  const s=(subject+' '+body).toLowerCase();
  if(/due|expires|renew|payment|invoice|bill|action required|respond|rsvp|deadline/.test(s))return {category:'Needs action',importance:.9,action:true};
  if(/flight|hotel|reservation|trip|booking/.test(s))return {category:'Travel',importance:.75,action:true};
  if(/statement|charge|price|subscription/.test(s))return {category:'Finance',importance:.7,action:true};
  return {category:'Information',importance:.35,action:false};
}
async function upsertMessage(pool,userId,m,access){
  const full=await api(`${GMAIL}/messages/${m.id}?format=full`,access);
  const headers=Object.fromEntries((full.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));
  const subject=headers.subject||'(no subject)',body=decodePlain(full.payload||{}),c=classify(subject,body);
  await pool.query(
    `INSERT INTO inbox_items(user_id,source,source_id,title,summary,category,importance,action_required,occurred_at,metadata)
     VALUES($1,'gmail',$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),$9)
     ON CONFLICT(user_id,source,source_id) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,category=EXCLUDED.category,
     importance=EXCLUDED.importance,action_required=EXCLUDED.action_required,occurred_at=EXCLUDED.occurred_at,metadata=EXCLUDED.metadata,updated_at=now()`,
    [userId,full.id,safeText(subject),safeText(body||headers.from||'').slice(0,500),c.category,c.importance,c.action,Number(full.internalDate||Date.now()),{from:headers.from||null,threadId:full.threadId,labelIds:full.labelIds||[],analysisText:safeText(body).slice(0,1800)}]
  );
  if(c.importance>=.85)await pool.query(
    `INSERT INTO memory_candidates(user_id,memory_type,content,confidence,source_id) VALUES($1,'context',$2,.75,$3) ON CONFLICT DO NOTHING`,
    [userId,subject,full.id]);
}
export async function syncGmail(pool,userId){
  const {access}=await account(pool,userId);
  const st=(await pool.query(`SELECT * FROM sync_state WHERE user_id=$1 AND provider='gmail'`,[userId])).rows[0];
  if(st?.cursor){
    try{
      let pageToken=null,latest=st.cursor,ids=new Set();
      do{
        const q=new URLSearchParams({startHistoryId:st.cursor,historyTypes:'messageAdded'});
        if(pageToken)q.set('pageToken',pageToken);
        const d=await api(`${GMAIL}/history?${q}`,access);latest=d.historyId||latest;
        for(const h of d.history||[])for(const a of h.messagesAdded||[])ids.add(a.message.id);
        pageToken=d.nextPageToken||null;
      }while(pageToken);
      for(const id of ids)await upsertMessage(pool,userId,{id},access);
      await pool.query(
        `INSERT INTO sync_state(user_id,provider,cursor,last_incremental_sync_at,last_error) VALUES($1,'gmail',$2,now(),NULL)
         ON CONFLICT(user_id,provider) DO UPDATE SET cursor=EXCLUDED.cursor,last_incremental_sync_at=now(),last_error=NULL,updated_at=now()`,
        [userId,latest]);
      return;
    }catch(e){if(e.status!==404)throw e}
  }
  let pageToken=null,count=0;
  do{
    const q=new URLSearchParams({maxResults:'50'});if(pageToken)q.set('pageToken',pageToken);
    const d=await api(`${GMAIL}/messages?${q}`,access);
    for(const m of d.messages||[]){await upsertMessage(pool,userId,m,access);if(++count>=100)break}
    pageToken=count>=100?null:(d.nextPageToken||null);
  }while(pageToken);
  const profile=await api(`${GMAIL}/profile`,access);
  await pool.query(
    `INSERT INTO sync_state(user_id,provider,cursor,last_full_sync_at,last_error) VALUES($1,'gmail',$2,now(),NULL)
     ON CONFLICT(user_id,provider) DO UPDATE SET cursor=EXCLUDED.cursor,last_full_sync_at=now(),last_error=NULL,updated_at=now()`,
    [userId,profile.historyId]);
}
async function upsertEvent(pool,userId,e){
  await pool.query(
    `INSERT INTO events(user_id,title,start_time,end_time,location,source,external_id,deleted,metadata)
     VALUES($1,$2,$3,$4,$5,'google_calendar',$6,$7,$8)
     ON CONFLICT(user_id,source,external_id) DO UPDATE SET title=EXCLUDED.title,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,
     location=EXCLUDED.location,deleted=EXCLUDED.deleted,metadata=EXCLUDED.metadata,updated_at=now()`,
    [userId,e.summary||'(untitled)',e.start?.dateTime||e.start?.date||null,e.end?.dateTime||e.end?.date||null,e.location||null,e.id,e.status==='cancelled',{htmlLink:e.htmlLink,status:e.status}]
  );
}
export async function syncCalendar(pool,userId){
  const {access}=await account(pool,userId);
  const st=(await pool.query(`SELECT * FROM sync_state WHERE user_id=$1 AND provider='calendar'`,[userId])).rows[0];
  if(st?.cursor){
    try{
      let pageToken=null,next=st.cursor;
      do{
        const q=new URLSearchParams({syncToken:st.cursor,showDeleted:'true',singleEvents:'true'});if(pageToken)q.set('pageToken',pageToken);
        const d=await api(`${CAL}/calendars/primary/events?${q}`,access);
        for(const e of d.items||[])await upsertEvent(pool,userId,e);
        pageToken=d.nextPageToken||null;next=d.nextSyncToken||next;
      }while(pageToken);
      await pool.query(
        `INSERT INTO sync_state(user_id,provider,cursor,last_incremental_sync_at,last_error) VALUES($1,'calendar',$2,now(),NULL)
         ON CONFLICT(user_id,provider) DO UPDATE SET cursor=EXCLUDED.cursor,last_incremental_sync_at=now(),last_error=NULL,updated_at=now()`,
        [userId,next]);return;
    }catch(e){
      if(e.status!==410)throw e;
      await pool.query(`DELETE FROM events WHERE user_id=$1 AND source='google_calendar'`,[userId]);
    }
  }
  let pageToken=null,next=null;
  do{
    const q=new URLSearchParams({timeMin:new Date(Date.now()-7*86400000).toISOString(),maxResults:'250',singleEvents:'true',showDeleted:'true'});
    if(pageToken)q.set('pageToken',pageToken);
    const d=await api(`${CAL}/calendars/primary/events?${q}`,access);
    for(const e of d.items||[])await upsertEvent(pool,userId,e);
    pageToken=d.nextPageToken||null;next=d.nextSyncToken||next;
  }while(pageToken);
  await pool.query(
    `INSERT INTO sync_state(user_id,provider,cursor,last_full_sync_at,last_error) VALUES($1,'calendar',$2,now(),NULL)
     ON CONFLICT(user_id,provider) DO UPDATE SET cursor=EXCLUDED.cursor,last_full_sync_at=now(),last_error=NULL,updated_at=now()`,
    [userId,next]);
}

export async function renewGmailWatch(pool,userId){
  if(!process.env.GMAIL_PUBSUB_TOPIC)return;
  const {access}=await account(pool,userId);
  const d=await api(`${GMAIL}/watch`,access,{method:'POST',body:JSON.stringify({topicName:process.env.GMAIL_PUBSUB_TOPIC,labelIds:['INBOX'],labelFilterBehavior:'INCLUDE'})});
  await pool.query(`UPDATE connected_accounts SET metadata=metadata||$1::jsonb,updated_at=now() WHERE user_id=$2 AND provider='google'`,[JSON.stringify({gmailWatchExpiration:d.expiration,gmailWatchHistoryId:d.historyId}),userId]);
}
export async function verifyPubSub(req){
  if(!process.env.GOOGLE_PUBSUB_AUDIENCE)throw new Error('GOOGLE_PUBSUB_AUDIENCE not configured');
  const auth=req.get('authorization')||'';const token=auth.replace(/^Bearer /,'');
  const c=new OAuth2Client();await c.verifyIdToken({idToken:token,audience:process.env.GOOGLE_PUBSUB_AUDIENCE});
}
export async function createGmailDraft(pool,userId,{to,subject,body}){
  if(!WRITE)throw new Error('Google write actions disabled');
  const {access}=await account(pool,userId);
  const raw=Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`).toString('base64url');
  return api(`${GMAIL}/drafts`,access,{method:'POST',body:JSON.stringify({message:{raw}})});
}
export async function sendGmail(pool,userId,{to,subject,body}){
  if(!WRITE)throw new Error('Google write actions disabled');
  const {access}=await account(pool,userId);
  const raw=Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`).toString('base64url');
  return api(`${GMAIL}/messages/send`,access,{method:'POST',body:JSON.stringify({raw})});
}
export async function createCalendarEvent(pool,userId,p){
  if(!WRITE)throw new Error('Google write actions disabled');
  const {access}=await account(pool,userId);
  return api(`${CAL}/calendars/primary/events`,access,{method:'POST',body:JSON.stringify({summary:p.title,description:p.description||undefined,location:p.location||undefined,start:{dateTime:p.start},end:{dateTime:p.end}})});
}
