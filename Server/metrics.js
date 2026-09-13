
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'lifeos_' });

export const httpRequests = new client.Counter({
  name: 'lifeos_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method','route','status'],
  registers: [register]
});

export const jobGauge = new client.Gauge({
  name: 'lifeos_jobs',
  help: 'Current jobs by status',
  labelNames: ['status'],
  registers: [register]
});

export async function collectJobMetrics(pool) {
  jobGauge.reset();
  const r = await pool.query(`SELECT status, count(*)::int AS count FROM jobs GROUP BY status`);
  for (const row of r.rows) jobGauge.set({status:row.status}, row.count);
}

export { register };
