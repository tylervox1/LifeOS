import crypto from 'crypto';
console.log('APP_SECRET=' + crypto.randomBytes(32).toString('base64url'));
console.log('ADMIN_API_KEY=' + crypto.randomBytes(32).toString('base64url'));
