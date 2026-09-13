
import 'dotenv/config';

const required=['DATABASE_URL','APP_SECRET','APP_PUBLIC_URL'];
const recommended=['OPENAI_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SMTP_HOST','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','SENTRY_DSN','POSTHOG_API_KEY'];
const launchRequired=['ADMIN_API_KEY','PRIVACY_VERSION','TERMS_VERSION'];

let fail=false;
for(const k of required){
  if(!process.env[k]){console.error(`FAIL missing ${k}`);fail=true}else console.log(`OK ${k}`);
}
for(const k of launchRequired){
  if(!process.env[k]){console.error(`FAIL public beta requires ${k}`);fail=true}else console.log(`OK ${k}`);
}
for(const k of recommended){
  if(!process.env[k])console.warn(`WARN ${k} is not configured`);
}
if(process.env.STRIPE_SECRET_KEY && (!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_PRICE_PLUS||!process.env.STRIPE_PRICE_PRO)){
  console.error('FAIL Stripe is partially configured');fail=true;
}
if(/example\.com/.test(process.env.SUPPORT_EMAIL||''))console.warn('WARN SUPPORT_EMAIL still uses example.com');
process.exitCode=fail?1:0;
