export function appPublicUrl(){
  const url = process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
  return String(url).replace(/\/$/, '');
}
