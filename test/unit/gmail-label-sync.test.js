import test from 'node:test';
import assert from 'node:assert/strict';
import {encrypt} from '../../server/crypto.js';
import {syncGmail} from '../../server/google.js';

test('Gmail incremental sync refreshes unread labels and handles removed messages',async t=>{
  process.env.APP_SECRET ||= '01234567890123456789012345678901';
  const calls=[];
  const pool={query:async(sql,args)=>{
    calls.push({sql,args});
    if(sql.includes('FROM connected_accounts'))return {rows:[{access_token_encrypted:encrypt('test-access'),expires_at:new Date(Date.now()+3600000)}]};
    if(sql.includes('FROM sync_state'))return {rows:[{cursor:'100'}]};
    if(sql.includes('AS needed'))return {rows:[{needed:false}]};
    return {rows:[]};
  }};
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/history')){
      assert.equal(u.searchParams.has('historyTypes'),false);
      return Response.json({historyId:'102',history:[{labelsRemoved:[{message:{id:'read-now'}}],messagesDeleted:[{message:{id:'gone'}}]}]});
    }
    if(u.pathname.endsWith('/messages/gone'))return Response.json({error:'removed'},{status:404});
    if(u.pathname.endsWith('/messages/read-now'))return Response.json({id:'read-now',threadId:'thread',labelIds:['INBOX'],internalDate:String(Date.now()),payload:{headers:[{name:'Subject',value:'Hello'}],mimeType:'text/plain',body:{data:Buffer.from('Please reply').toString('base64url')}}});
    throw new Error('Unexpected Google request');
  });
  await syncGmail(pool,'test-user');
  const insert=calls.find(c=>c.sql.includes('INSERT INTO inbox_items'));
  assert.deepEqual(insert.args[8].labelIds,['INBOX']);
  assert.ok(calls.some(c=>c.sql.includes('UPDATE inbox_items')&&c.args[1]==='gone'));
  assert.ok(calls.some(c=>c.sql.includes('INSERT INTO sync_state')&&c.args[1]==='102'));
});
