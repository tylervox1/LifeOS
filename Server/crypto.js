
import crypto from 'crypto';
function key(){
  const s=process.env.APP_SECRET||'';
  if(s.length<32)throw new Error('APP_SECRET must be at least 32 characters');
  return crypto.createHash('sha256').update(s).digest();
}
export const hashToken=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
export function encrypt(text){
  if(!text)return null;
  const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const body=Buffer.concat([c.update(String(text),'utf8'),c.final()]);
  return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url');
}
export function decrypt(blob){
  if(!blob)return null;
  const d=Buffer.from(blob,'base64url'),iv=d.subarray(0,12),tag=d.subarray(12,28),body=d.subarray(28);
  const dec=crypto.createDecipheriv('aes-256-gcm',key(),iv);dec.setAuthTag(tag);
  return Buffer.concat([dec.update(body),dec.final()]).toString('utf8');
}
export const randomToken=()=>crypto.randomBytes(32).toString('base64url');
