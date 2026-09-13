
import crypto from 'crypto';

function normalizeCode(code){return String(code||'').trim().toUpperCase()}
function hashCode(code){return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex')}

export function createInviteCode(){
  return crypto.randomBytes(8).toString('base64url').toUpperCase();
}

export async function validateInvite(pool,code){
  const normalized=normalizeCode(code);
  if(!normalized)return null;
  const r=await pool.query(
    `SELECT * FROM beta_invites
     WHERE code_hash=$1
       AND disabled_at IS NULL
       AND (expires_at IS NULL OR expires_at>now())
       AND used_count<max_uses
     LIMIT 1`,
    [hashCode(normalized)]
  );
  return r.rows[0]||null;
}

export async function createInvite(pool,{label,maxUses=1,expiresAt=null,createdBy='admin'}={}){
  const code=createInviteCode();
  const r=await pool.query(
    `INSERT INTO beta_invites(code_hash,label,max_uses,expires_at,created_by)
     VALUES($1,$2,$3,$4,$5)
     RETURNING id,label,max_uses,used_count,expires_at,created_at`,
    [hashCode(code),label||null,Math.max(1,Number(maxUses)||1),expiresAt||null,createdBy]
  );
  return {...r.rows[0],code};
}

export async function redeemInvite(pool,inviteId,userId){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const updated=await client.query(
      `UPDATE beta_invites
       SET used_count=used_count+1
       WHERE id=$1
         AND disabled_at IS NULL
         AND (expires_at IS NULL OR expires_at>now())
         AND used_count<max_uses
       RETURNING id`,
      [inviteId]
    );
    if(!updated.rowCount)throw new Error('Invite is no longer available');
    await client.query(
      `INSERT INTO beta_invite_redemptions(invite_id,user_id) VALUES($1,$2)`,
      [inviteId,userId]
    );
    await client.query('COMMIT');
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{client.release()}
}
