
const requiredProduction=[
  'DATABASE_URL','APP_SECRET','ADMIN_API_KEY'
];

export function validateProductionConfig(){
  if(process.env.NODE_ENV!=='production')return;
  if(String(process.env.STRICT_PRODUCTION_CONFIG||'false')!=='true')return;
  const missing=requiredProduction.filter(k=>!process.env[k]);
  if(missing.length)throw new Error(`Missing required production settings: ${missing.join(', ')}`);
  if(String(process.env.DEMO_MODE||'false').toLowerCase()==='true')throw new Error('DEMO_MODE must be false in production');
  const publicUrl=process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL||'';
  if(!String(publicUrl).startsWith('https://'))throw new Error('A HTTPS APP_PUBLIC_URL or RENDER_EXTERNAL_URL is required in production');
  if(String(process.env.APP_SECRET).length<32)throw new Error('APP_SECRET must be at least 32 characters');
  if(String(process.env.ADMIN_API_KEY).length<32)throw new Error('ADMIN_API_KEY must be at least 32 characters');
}
