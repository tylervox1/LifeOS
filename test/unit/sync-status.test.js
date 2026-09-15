import test from 'node:test';
import assert from 'node:assert/strict';
import {processJob} from '../../server/services.js';
test('failed Google sync updates connection error status and still fails the job',async()=>{
  for(const [job_type,provider] of [['sync_gmail','gmail'],['sync_calendar','calendar']]){
    const calls=[];
    const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}};
    await assert.rejects(processJob(pool,{job_type,user_id:'owner'}),/Google account not connected/);
    assert.deepEqual(calls.find(c=>c.sql.includes('INSERT INTO sync_state')).args,['owner',provider,'Google account not connected']);
  }
});
