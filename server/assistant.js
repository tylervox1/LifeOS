
import {proposeAction} from './actions.js';

const tools=[
  {type:'function',name:'create_email_draft',description:'Propose creating a Gmail draft. This requires user approval before execution.',parameters:{type:'object',properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'}},required:['to','subject','body'],additionalProperties:false}},
  {type:'function',name:'send_email',description:'Propose sending a Gmail message. Never executes directly; requires explicit user approval.',parameters:{type:'object',properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'}},required:['to','subject','body'],additionalProperties:false}},
  {type:'function',name:'create_calendar_event',description:'Propose creating a calendar event. Never executes directly; requires explicit user approval.',parameters:{type:'object',properties:{title:{type:'string'},start:{type:'string'},end:{type:'string'},description:{type:'string'},location:{type:'string'}},required:['title','start','end'],additionalProperties:false}}
];

export async function assistantTurn(pool,userId,message){
  if(!process.env.OPENAI_API_KEY)return {reply:'AI key not configured. You can still use tasks, alerts, sync, and approvals.',proposals:[]};
  const [tasks,mem]=await Promise.all([
    pool.query(`SELECT title,status,priority,due_at FROM tasks WHERE user_id=$1 ORDER BY due_at NULLS LAST LIMIT 10`,[userId]),
    pool.query(`SELECT memory_type,content,confidence FROM memories WHERE user_id=$1 ORDER BY importance DESC LIMIT 10`,[userId])
  ]);
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({
    model:process.env.OPENAI_MODEL||'gpt-5.6',
    instructions:`You are Synchrified, the user's AI Chief of Staff. Be concise. Never claim an external action happened unless execution_result confirms it. Tool calls are proposals only. User context: ${JSON.stringify({tasks:tasks.rows,memories:mem.rows})}`,
    input:message,tools
  })});
  const d=await r.json();if(!r.ok)throw new Error(`AI API ${r.status}`);
  const proposals=[];const texts=[];
  for(const o of d.output||[]){
    if(o.type==='message')for(const c of o.content||[])if(c.type==='output_text')texts.push(c.text);
    if(o.type==='function_call'){
      const args=JSON.parse(o.arguments||'{}');
      proposals.push(await proposeAction(pool,userId,o.name,args));
    }
  }
  return {reply:texts.join('\n')|| (proposals.length?'I prepared an action for your approval.':'No response.'),proposals};
}
