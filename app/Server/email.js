
import nodemailer from 'nodemailer';

function transport(){
  if(!process.env.SMTP_HOST)return null;
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:String(process.env.SMTP_SECURE||'false')==='true',
    auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined
  });
}
export async function sendTransactional({to,subject,text,html}){
  const t=transport();
  if(!t)throw new Error('SMTP is not configured');
  return t.sendMail({from:process.env.EMAIL_FROM,to,subject,text,html});
}
