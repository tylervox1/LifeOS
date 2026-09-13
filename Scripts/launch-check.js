
import 'dotenv/config';

const must=[
  'DATABASE_URL','APP_SECRET','APP_PUBLIC_URL','ADMIN_API_KEY',
  'OPENAI_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'
];
const delivery=['SMTP_HOST','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'];
let fail=false;
for(const k of must){
  if(!process.env[k]){console.error(`FAIL ${k} missing`);fail=true}else console.log(`OK ${k}`);
}
if(process.env.NODE_ENV==='production'){
  if(process.env.DEMO_MODE==='true'){console.error('FAIL DEMO_MODE=true in production');fail=true}
  if(!String(process.env.APP_PUBLIC_URL||'').startsWith('https://')){console.error('FAIL APP_PUBLIC_URL must be https in production');fail=true}
}
for(const k of delivery)if(!process.env[k])console.warn(`WARN ${k} missing: related delivery feature will not work`);
if(process.env.STRIPE_SECRET_KEY && (!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_PRICE_PLUS||!process.env.STRIPE_PRICE_PRO)){
  console.error('FAIL Stripe configuration is incomplete');fail=true;
}
if(String(process.env.REQUIRE_INVITE||'true')!=='true')console.warn('WARN invite gating is disabled');
process.exitCode=fail?1:0;
