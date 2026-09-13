
import * as Sentry from '@sentry/node';
import {PostHog} from 'posthog-node';

let posthog=null;
export function initTelemetry(app){
  if(process.env.SENTRY_DSN){
    Sentry.init({
      dsn:process.env.SENTRY_DSN,
      environment:process.env.SENTRY_ENVIRONMENT||process.env.NODE_ENV||'development',
      sendDefaultPii:false
    });
    Sentry.setupExpressErrorHandler?.(app);
  }
  if(process.env.POSTHOG_API_KEY){
    posthog=new PostHog(process.env.POSTHOG_API_KEY,{host:process.env.POSTHOG_HOST||'https://us.i.posthog.com'});
  }
}
export async function captureProductEvent(pool,{userId=null,event,properties={}}){
  try{await pool.query(`INSERT INTO product_events(user_id,event_name,properties) VALUES($1,$2,$3)`,[userId,event,properties])}catch{}
  try{posthog?.capture({distinctId:userId||'anonymous',event,properties})}catch{}
}
export function captureError(err,context={}){
  try{Sentry.captureException(err,{extra:context})}catch{}
}
