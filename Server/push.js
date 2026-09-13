
import webpush from 'web-push';

function configured(){
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
if(configured()){
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export function vapidPublicKey(){
  return configured() ? process.env.VAPID_PUBLIC_KEY : null;
}

export async function sendPushToUser(pool,userId,payload){
  if(!configured()) return {delivered:0,failed:0,configured:false};
  const subs=(await pool.query(`SELECT * FROM push_subscriptions WHERE user_id=$1`,[userId])).rows;
  let delivered=0,failed=0;
  for(const s of subs){
    try{
      await webpush.sendNotification(
        {endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},
        JSON.stringify(payload),
        {TTL:300}
      );
      delivered++;
    }catch(e){
      failed++;
      if(e?.statusCode===404||e?.statusCode===410){
        await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`,[s.id]);
      }
    }
  }
  return {delivered,failed,configured:true};
}
