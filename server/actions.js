
import {enqueue} from './jobs.js';

const defs={
  create_email_draft:{risk:1},
  send_email:{risk:2},
  create_calendar_event:{risk:2}
};
export async function proposeAction(pool,userId,actionType,payload){
  const d=defs[actionType];if(!d)throw new Error('Unsupported action');
  return (await pool.query(`INSERT INTO approvals(user_id,action_type,action_payload,risk_level) VALUES($1,$2,$3,$4) RETURNING *`,
    [userId,actionType,payload,d.risk])).rows[0];
}
export async function decideApproval(pool,userId,id,decision){
  if(!['approved','rejected'].includes(decision))throw new Error('Invalid decision');
  const r=await pool.query(`UPDATE approvals SET status=$1,decided_at=now() WHERE id=$2 AND user_id=$3 AND status='pending' RETURNING *`,
    [decision,id,userId]);const a=r.rows[0];if(!a)throw new Error('Approval not found or already decided');
  if(decision==='approved'){
    await enqueue(pool,{userId,jobType:'execute_approval',payload:{approvalId:a.id},priority:5,dedupeKey:`approval:${a.id}`});
  }return a;
}
