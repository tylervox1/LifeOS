import test from 'node:test';
import assert from 'node:assert/strict';
import {testPool} from './db.js';
import {googleAuthUrl,handleGoogleCallback} from '../../server/google.js';
import {decrypt} from '../../server/crypto.js';

test('Google callback inserts and reconnects an account with JSONB permissions', async t=>{
  process.env.APP_SECRET='oauth-regression-test-secret-32-characters';
  const pool=testPool(),client=await pool.connect();
  t.after(async()=>{await client.query('ROLLBACK');client.release();await pool.end();});
  await client.query('BEGIN');
  // Session-local tables isolate this regression from other integration tests.
  await client.query('CREATE TEMP TABLE users (id UUID PRIMARY KEY)');
  await client.query("CREATE TEMP TABLE connected_accounts (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  provider TEXT NOT NULL,\n  provider_account_id TEXT,\n  access_token_encrypted TEXT,\n  refresh_token_encrypted TEXT,\n  expires_at TIMESTAMPTZ,\n  permissions JSONB DEFAULT '[]'::jsonb,\n  metadata JSONB DEFAULT '{}'::jsonb,\n  connected_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(user_id,provider,provider_account_id)\n);");
  const userId='00000000-0000-4000-8000-000000000001';
  await client.query('INSERT INTO users(id) VALUES($1)',[userId]);
  let tokens={access_token:'first-access',refresh_token:'first-refresh',expires_in:3600,scope:'openid email'};
  t.mock.method(globalThis,'fetch',async url=>({
    ok:true,json:async()=>String(url).includes('token')?tokens:{sub:'test-sub',email:'oauth@example.com',name:'OAuth Test'}
  }));
  const connect=()=>handleGoogleCallback(client,{
    code:'fake-code',state:new URL(googleAuthUrl(userId)).searchParams.get('state')
  });
  assert.equal(await connect(),userId);
  let rows=(await client.query('SELECT * FROM connected_accounts')).rows;
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].permissions,['openid','email']);
  assert.equal(decrypt(rows[0].refresh_token_encrypted),'first-refresh');
  tokens={access_token:'second-access',expires_in:3600,scope:'openid email https://www.googleapis.com/auth/gmail.readonly'};
  await connect();
  rows=(await client.query('SELECT * FROM connected_accounts')).rows;
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].permissions,tokens.scope.split(' '));
  assert.equal(decrypt(rows[0].access_token_encrypted),'second-access');
  assert.equal(decrypt(rows[0].refresh_token_encrypted),'first-refresh');
  assert.equal(rows[0].metadata.email,'oauth@example.com');
  tokens={access_token:'third-access',expires_in:3600};
  await connect();
  assert.deepEqual((await client.query('SELECT permissions FROM connected_accounts')).rows[0].permissions,[]);
});
