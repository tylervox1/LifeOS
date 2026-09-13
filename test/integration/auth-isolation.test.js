
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {testPool,resetData} from './db.js';

process.env.NO_LISTEN='true';
process.env.DEMO_MODE='false';
process.env.APP_SECRET=process.env.APP_SECRET||'01234567890123456789012345678901';

test('two accounts remain isolated in export and CSRF protects mutations', async (t)=>{
  const pool=testPool(); await resetData(pool);
  const {app}=await import('../../server/index.js');

  const a=request.agent(app), b=request.agent(app);
  const ar=await a.post('/api/auth/register').send({email:'a@example.com',password:'password123',name:'A'}).expect(201);
  const br=await b.post('/api/auth/register').send({email:'b@example.com',password:'password123',name:'B'}).expect(201);
  const csrfA=ar.body.csrf, csrfB=br.body.csrf;

  const ua=(await pool.query(`SELECT id FROM users WHERE email='a@example.com'`)).rows[0].id;
  const ub=(await pool.query(`SELECT id FROM users WHERE email='b@example.com'`)).rows[0].id;
  await pool.query(`INSERT INTO tasks(user_id,title) VALUES($1,'A secret task'),($2,'B secret task')`,[ua,ub]);

  const exA=await a.get('/api/account/export').expect(200);
  const exB=await b.get('/api/account/export').expect(200);
  assert.equal(exA.body.tasks.length,1);
  assert.equal(exA.body.tasks[0].title,'A secret task');
  assert.equal(exB.body.tasks.length,1);
  assert.equal(exB.body.tasks[0].title,'B secret task');

  await a.delete('/api/account').expect(403);
  await a.delete('/api/account').set('x-csrf-token',csrfA).expect(200);
  const remain=(await pool.query(`SELECT email FROM users ORDER BY email`)).rows.map(x=>x.email);
  assert.deepEqual(remain,['b@example.com']);

  await pool.end();
});
