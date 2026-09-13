import fs from 'node:fs';

const required = [
  'Dockerfile',
  'render.yaml',
  'package.json',
  'server/index.js',
  'server/migrate.js',
  'server/worker.js',
  'server/scheduler.js',
  'db/schema.sql'
];

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error('LifeOS repository verification failed. Missing:');
  for (const file of missing) console.error(` - ${file}`);
  process.exit(1);
}
console.log('LifeOS repository verification passed.');
