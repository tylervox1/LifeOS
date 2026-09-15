
import test from 'node:test';
import assert from 'node:assert/strict';
import {testPool,resetData} from './db.js';
import {startFakeGoogle} from './fake-google.js';

process.env.APP_SECRET=process.env.APP_SECRET||'01234567890123456789012345678901';
process.env.GOOGLE_WRITE_ACTIONS_ENABLED='true';

test('approved Gmail draft is executed by worker service and recorded', async t=>{
  const fake=await startFakeGoogle();
  t.after(()=>fake.close());
  process.env.GOOGLE_GMAIL_BASE=fake.base+'/gmail';
  process.env.GOOGLE_CALENDAR_BASE=fake.base+'/calendar';
  process.env.GOOGLE_TOKEN_URL=fake.base+'/token';
  process.env.GOOGLE_USERINFO_URL=fake.base+'/userinfo';
  process.env.GOOGLE_REVOKE_URL=fake.base+'/revoke';

  const pool=testPool();
  t.after(()=>pool.end());
  await resetData(pool);
  const {encrypt}=await import('../../server/crypto.js');
  const {proposeAction,decideApproval}=await import('../../server/actions.js');
  const {processJob}=await import('../../server/services.js');

  const u=(await pool.query(`INSERT INTO users(email,name,email_verified_at) VALUES('worker@example.com','Worker',now()) RETURNING id`)).rows[0];
  await pool.query(
    `INSERT INTO connected_accounts(user_id,provider,provider_account_id,access_token_encrypted,refresh_token_encrypted,expires_at)
     VALUES($1,'google','fake-google-user',$2,$3,now()+interval '1 hour')`,
    [u.id,encrypt('fake-access'),encrypt('fake-refresh')]
  );

  const approval=await proposeAction(pool,u.id,'create_email_draft',{to:'alex@example.com',subject:'Friday',body:'See you Friday.'});
  await decideApproval(pool,u.id,approval.id,'approved');
  const job=(await pool.query(`SELECT * FROM jobs WHERE user_id=$1 AND job_type='execute_approval'`,[u.id])).rows[0];
  assert.ok(job);
  await processJob(pool,job);

  assert.equal(fake.state.drafts.length,1);
  const saved=(await pool.query(`SELECT executed_at,execution_result FROM approvals WHERE id=$1`,[approval.id])).rows[0];
  assert.ok(saved.executed_at);
  assert.equal(saved.execution_result.id,'draft-1');


});
