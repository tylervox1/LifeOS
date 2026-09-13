
import crypto from 'crypto';
function safeEqual(a,b){
  const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
export function adminGuard(req,res,next){
  const expected=process.env.ADMIN_API_KEY;
  if(!expected || !safeEqual(req.get('x-admin-key'),expected)) return res.status(401).json({error:'admin authorization required'});
  next();
}
