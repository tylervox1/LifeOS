import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLayout,validateItem,WIDGETS} from '../../server/workspace.js';
import {prepareSources,suggestByRules,validateSuggestions,safeText} from '../../server/attention.js';

test('layout keeps known sections once and restores missing sections',()=>{
  assert.deepEqual(normalizeLayout(null),{order:WIDGETS,hidden:[],compact:false});
  const p=normalizeLayout({order:['tasks','tasks','bad'],hidden:['inbox','bad','inbox'],compact:true});
  assert.equal(p.order[0],'tasks');assert.equal(p.order.length,WIDGETS.length);
  assert.deepEqual(p.hidden,['inbox']);assert.equal(p.compact,true);
  assert.equal(normalizeLayout({compact:'true'}).compact,false);
});
test('tracker accepts database dates and rejects invalid money, dates, status and kinds',()=>{
  const input={kind:'bill',title:'Electricity',amount:0,due_at:new Date('2026-09-20T10:00:00Z')};
  assert.equal(validateItem(input).amount,0);
  assert.equal(validateItem(input).due_at,'2026-09-20T10:00:00.000Z');
  for(const patch of [{amount:-1},{amount:'nan'},{due_at:'bad'},{status:'paid-for-real'},{kind:'bank'},{title:''}])assert.throws(()=>validateItem({...input,...patch}));
});
const source=(id,title,labels=[],text='Please review the details.')=>({id,title,text,labels,receivedAt:'2026-09-01T00:00:00Z'});
test('all six attention categories require actionable evidence',()=>{
  const sources=[source('1','Your payment is overdue'),source('2','Your subscription expires soon'),source('3','Upcoming appointment reminder'),source('4','Please reply to this message',['UNREAD']),source('5','Flight check-in deadline'),source('6',"I will send the report",['SENT'])];
  assert.deepEqual(suggestByRules(sources,Date.parse('2026-09-15')).map(i=>i.kind),['bill','subscription','appointment','email','travel','commitment']);
  assert.equal(suggestByRules([source('7','Your purchase was successful!'),source('8','Payment received'),source('9','Your payment is due',['CATEGORY_PROMOTIONS']),source('10','Please reply'),source('11',"I will send the report")]).length,0);
});
test('scanner excludes credentials and rejects invented source evidence',()=>{
  assert.equal(prepareSources([{source_id:'1',title:'Setup',summary:'GOOGLE_CLIENT_SECRET=private'}]).length,0);
  assert.ok(!safeText('GOCSPX-fake-fixture-secret').includes('fake-fixture-secret'));
  const sources=[source('1','Payment due')];
  const valid={source_id:'1',kind:'bill',title:'Review payment',evidence:'Payment due',due_at:null,amount:null};
  assert.equal(validateSuggestions([valid],sources).length,1);
  for(const patch of [{source_id:'other'},{evidence:'An invented amount of $50'},{kind:'commitment'},{kind:'email'}])assert.equal(validateSuggestions([{...valid,...patch}],sources).length,0);
});
