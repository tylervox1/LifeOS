import test from 'node:test';
import assert from 'node:assert/strict';
import pgUtils from 'pg/lib/utils.js';
import {googleAuthUrl,handleGoogleCallback} from '../../server/google.js';
import {decrypt} from '../../server/crypto.js';

test('OAuth callback sends permissions as JSON through the PostgreSQL driver', async t=>{
  process.env.APP_SECRET='oauth-regression-test-secret-32-characters';
  const userId='00000000-0000-4000-8000-000000000001';
  const scopes=['openid','email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
  let tokenResponse;
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).includes('token'))return {ok:true,json:async()=>tokenResponse};
    return {ok:true,json:async()=>({sub:'test-google-user',email:'oauth@example.com',name:'OAuth Test'})};
  });
  for(const scope of [scopes.join(' '),undefined]){
    tokenResponse={access_token:'test-access',expires_in:3600,scope};
    let saved;
    const pool={query:async(sql,params)=>{saved=params;
      // pg normally encodes JS arrays as PostgreSQL arrays, which JSONB rejects.
      assert.deepEqual(JSON.parse(pgUtils.prepareValue(params[5])),scope?scopes:[]);
      return {rows:[]};
    }};
    const state=new URL(googleAuthUrl(userId)).searchParams.get('state');
    assert.equal(await handleGoogleCallback(pool,{code:'test-code',state}),userId);
    assert.equal(decrypt(saved[2]),'test-access');
    assert.equal(saved[3],null);
    assert.equal(saved[1],'test-google-user');
    assert.deepEqual(JSON.parse(pgUtils.prepareValue(saved[6])),{email:'oauth@example.com',name:'OAuth Test'});
  }
});
