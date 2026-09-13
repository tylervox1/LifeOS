
import Stripe from 'stripe';
import {appPublicUrl} from './urls.js';

function stripe(){
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
}
function priceFor(plan){
  if(plan==='plus') return process.env.STRIPE_PRICE_PLUS;
  if(plan==='pro') return process.env.STRIPE_PRICE_PRO;
  return null;
}
export async function createCheckoutSession(pool,user,{plan}){
  const s=stripe();
  if(!s) throw new Error('Stripe is not configured');
  const price=priceFor(plan);
  if(!price) throw new Error('Selected plan is not configured');
  let customer=user.stripe_customer_id;
  if(!customer){
    const c=await s.customers.create({email:user.email,name:user.name||undefined,metadata:{lifeosUserId:user.id}});
    customer=c.id;
    await pool.query(`UPDATE users SET stripe_customer_id=$1 WHERE id=$2`,[customer,user.id]);
  }
  const base=appPublicUrl();
  if(!base) throw new Error('Public app URL is not configured');
  return s.checkout.sessions.create({
    mode:'subscription',
    customer,
    line_items:[{price,quantity:1}],
    success_url:`${base}/?billing=success`,
    cancel_url:`${base}/?billing=cancel`,
    allow_promotion_codes:true,
    metadata:{lifeosUserId:user.id,plan}
  });
}
export async function createPortalSession(user){
  const s=stripe();
  if(!s) throw new Error('Stripe is not configured');
  if(!user.stripe_customer_id) throw new Error('No billing customer exists yet');
  const base=appPublicUrl();
  if(!base) throw new Error('Public app URL is not configured');
  return s.billingPortal.sessions.create({
    customer:user.stripe_customer_id,
    return_url:`${base}/?view=settings`
  });
}
export async function handleStripeWebhook(pool,rawBody,signature){
  const s=stripe();
  if(!s||!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook is not configured');
  const event=s.webhooks.constructEvent(rawBody,signature,process.env.STRIPE_WEBHOOK_SECRET);
  const obj=event.data.object;
  if(event.type==='checkout.session.completed'){
    const userId=obj.metadata?.lifeosUserId;
    const plan=obj.metadata?.plan||'plus';
    if(userId) await pool.query(
      `UPDATE users SET plan=$1,stripe_customer_id=COALESCE($2,stripe_customer_id),stripe_subscription_id=$3,subscription_status='active' WHERE id=$4`,
      [plan,obj.customer||null,obj.subscription||null,userId]
    );
  }
  if(event.type.startsWith('customer.subscription.')){
    const sub=obj;
    const u=(await pool.query(`SELECT id FROM users WHERE stripe_customer_id=$1 LIMIT 1`,[sub.customer])).rows[0];
    if(u){
      const active=['active','trialing'].includes(sub.status);
      await pool.query(
        `UPDATE users SET subscription_status=$1,stripe_subscription_id=$2,current_period_end=to_timestamp($3),plan=CASE WHEN $4 THEN plan ELSE 'free' END WHERE id=$5`,
        [sub.status,sub.id,sub.current_period_end||0,active,u.id]
      );
    }
  }
  return event;
}
