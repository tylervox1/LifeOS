
import argon2 from 'argon2';
import {hashToken,randomToken} from './crypto.js';

export async function createSession(pool,user,req,res){
  const raw=randomToken(),csrf=randomToken(),days=Number(process.env.SESSION_DAYS||30);
  const r=await pool.query(
    `INSERT INTO sessions(user_id,token_hash,csrf_hash,user_agent,ip_address,expires_at)
     VALUES($1,$2,$3,$4,$5,now()+($6||' days')::interval) RETURNING id`,
    [user.id,hashToken(raw),hashToken(csrf),req.headers['user-agent']||null,req.ip||null,String(days)]
  );
  res.cookie('lifeos_session',raw,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:days*86400000});
  return {id:r.rows[0].id,csrf};
}
export async function authMiddleware(pool,req,res,next){
  try{
    if(String(process.env.DEMO_MODE||'true').toLowerCase()==='true'&&!req.cookies?.lifeos_session){
      const r=await pool.query(`INSERT INTO users(email,name,email_verified_at) VALUES('demo@lifeos.local','Demo User',now()) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING *`);
      req.user=r.rows[0]; req.session=null; return next();
    }
    const raw=req.cookies?.lifeos_session;if(!raw)return res.status(401).json({error:'authentication required'});
    const r=await pool.query(
      `SELECT u.*,s.id session_id,s.csrf_hash FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now()`,[hashToken(raw)]
    );
    if(!r.rows[0])return res.status(401).json({error:'session expired'});
    req.user=r.rows[0];req.session={id:r.rows[0].session_id,csrf_hash:r.rows[0].csrf_hash};
    await pool.query(`UPDATE sessions SET last_seen_at=now() WHERE id=$1`,[req.session.id]);next();
  }catch(e){next(e)}
}
export function csrfGuard(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method)||!req.session)return next();
  const token=req.get('x-csrf-token');
  if(!token||hashToken(token)!==req.session.csrf_hash)return res.status(403).json({error:'invalid csrf token'});
  next();
}
export async function register(pool,{email,password,name}){
  const normalized=String(email||'').trim().toLowerCase();
  if(!normalized||String(password||'').length<8)throw new Error('Valid email and password of at least 8 characters required');
  const ph=await argon2.hash(String(password));
  return (await pool.query(`INSERT INTO users(email,password_hash,name) VALUES($1,$2,$3) RETURNING id,email,name,timezone,email_verified_at,created_at`,
    [normalized,ph,String(name||'').trim()||null])).rows[0];
}
export async function login(pool,{email,password}){
  const u=(await pool.query(`SELECT * FROM users WHERE email=$1`,[String(email||'').trim().toLowerCase()])).rows[0];
  if(!u?.password_hash||!(await argon2.verify(u.password_hash,String(password||''))))throw new Error('Invalid email or password');
  return u;
}
export async function issueAuthToken(pool,userId,type,minutes=60){
  const raw=randomToken();
  await pool.query(`INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES($1,$2,$3,now()+($4||' minutes')::interval)`,
    [userId,hashToken(raw),type,String(minutes)]);
  return raw;
}
