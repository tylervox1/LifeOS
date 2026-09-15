
import test from 'node:test';
import assert from 'node:assert/strict';
import {testPool,resetData} from './db.js';
import {enqueue,claimNext} from '../../server/jobs.js';

test('queue dedupes active recurring jobs and claims one job once', async t=>{
  const pool=testPool();
  t.after(()=>pool.end());
  await resetData(pool);
  const u=(await pool.query(`INSERT INTO users(email) VALUES('q@example.com') RETURNING id`)).rows[0];
  await enqueue(pool,{userId:u.id,jobType:'sync_gmail',dedupeKey:'gmail:bucket-1'});
  await enqueue(pool,{userId:u.id,jobType:'sync_gmail',dedupeKey:'gmail:bucket-1'});
  const c=(await pool.query(`SELECT count(*)::int c FROM jobs WHERE user_id=$1`,[u.id])).rows[0].c;
  assert.equal(c,1);
  const first=await claimNext(pool,'worker-a');
  const second=await claimNext(pool,'worker-b');
  assert.ok(first);
  assert.equal(second,null);

});
