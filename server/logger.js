
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'lifeos' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'token',
      '*.password',
      '*.token',
      '*.access_token',
      '*.refresh_token'
    ],
    censor: '[REDACTED]'
  }
});
