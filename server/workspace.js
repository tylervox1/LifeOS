import crypto from 'node:crypto';
import {KINDS,safeText,scanAttention} from './attention.js';

export const WIDGETS=['attention','brief','calendar','tasks','inbox','finances','subscriptions','commitments','travel','connections'];
export function normalizeLayout(input={}){
  input=input&&typeof input==='object'?input:{};
  const order=Array.isArray(input.order)?[...new Set(input.order.filter(x=>WIDGETS.includes(x)))]:[];
  return {order:[...order,...WIDGETS.filter(x=>!order.includes(x))],hidden:Array.isArray(input.hidden)?[...new Set(input.hidden.filter(x=>WIDGETS.includes(x)))]:[],compact:input.compact===true};
}
export function validateItem(input){
  input=input&&typeof input==='object'?input:{};
  const title=String(input.title||'').trim();
  if(!title||title.length>240)throw new Error('Add a title of 1–240 characters.');
  if(!KINDS.includes(input.kind))throw new Error('Choose a valid item type.');
  const status=input.status||'open',recurrence=input.recurrence||'none';
  if(!['needs_review','open','completed','dismissed'].includes(status))throw new Error('Invalid status.');
  if(!['none','weekly','monthly','yearly'].includes(recurrence))throw new Error('Invalid recurrence.');
  const due=input.due_at instanceof Date?input.due_at.toISOString():input.due_at||null;
  if(due&&(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(due)||!Number.isFinite(Date.parse(due))))throw new Error('Enter a valid date and time.');
  const amount=input.amount===null||input.amount===undefined||input.amount===''?null:Number(input.amount);
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>9999999999))throw new Error('Enter a valid non-negative amount.');
  const currency=String(input.currency||'USD').toUpperCase();
  if(!/^[A-Z]{3}$/.test(currency))throw new Error('Use a three-letter currency code.');
  try{new Intl.NumberFormat('en',{style:'currency',currency});}catch{throw new Error('Invalid currency.');}
  return {kind:input.kind,title:safeText(title),notes:safeText(input.notes).slice(0,2000),status,recurrence,due_at:due,amount,currency};
}
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const route=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
export function mountWorkspace(app,pool){
  app.get('/api/workspace',route(async(req,res)=>{
    const uid=req.user.id;
    const [pref,items,events,scan]=await Promise.all([
      pool.query("SELECT preferences->'dashboard' AS layout FROM users WHERE id=$1",[uid]),
      pool.query(`SELECT * FROM attention_items WHERE user_id=$1 ORDER BY CASE status WHEN 'needs_review' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,due_at NULLS LAST,created_at DESC LIMIT 500`,[uid]),
      pool.query(`SELECT id,title,start_time,end_time,location,source,external_id FROM events WHERE user_id=$1 AND deleted=false AND start_time>=now()-interval '1 day' ORDER BY start_time LIMIT 100`,[uid]),
      pool.query('SELECT attempted_at,completed_at,engine,last_error FROM attention_scans WHERE user_id=$1',[uid])
    ]);
    res.json({layout:normalizeLayout(pref.rows[0]?.layout),items:items.rows,events:events.rows,scan:scan.rows[0]||null,aiAvailable:!!process.env.OPENAI_API_KEY,googleWritesEnabled:process.env.GOOGLE_WRITE_ACTIONS_ENABLED==='true'});
  }));
  app.put('/api/workspace/layout',route(async(req,res)=>{
    const layout=normalizeLayout(req.body);
    await pool.query("UPDATE users SET preferences=jsonb_set(COALESCE(preferences,'{}'::jsonb),'{dashboard}',$2::jsonb) WHERE id=$1",[req.user.id,JSON.stringify(layout)]);
    res.json(layout);
  }));
  app.post('/api/workspace/items',route(async(req,res)=>{
    let i;try{i=validateItem(req.body);}catch(e){return res.status(400).json({error:e.message});}
    const r=await pool.query(`INSERT INTO attention_items(user_id,kind,title,notes,due_at,amount,currency,recurrence,status,source_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[req.user.id,i.kind,i.title,i.notes,i.due_at,i.amount,i.currency,i.recurrence,i.status,crypto.randomUUID()]);
    res.status(201).json(r.rows[0]);
  }));
  app.patch('/api/workspace/items/:id',route(async(req,res)=>{
    if(!validId(req.params.id))return res.status(400).json({error:'Invalid item.'});
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const row=(await c.query('SELECT * FROM attention_items WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];
      if(!row){await c.query('ROLLBACK');return res.status(404).json({error:'Item not found.'});}
      let i;try{i=validateItem({...row,...req.body,kind:row.kind});}catch(e){await c.query('ROLLBACK');return res.status(400).json({error:e.message});}
      const r=await c.query(`UPDATE attention_items SET title=$3,notes=$4,due_at=$5,amount=$6,currency=$7,recurrence=$8,status=$9,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`,[row.id,req.user.id,i.title,i.notes,i.due_at,i.amount,i.currency,i.recurrence,i.status]);
      await c.query('COMMIT');res.json(r.rows[0]);
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }));
  app.post('/api/workspace/scan',route(async(req,res)=>res.json(await scanAttention(pool,req.user.id))));
}
