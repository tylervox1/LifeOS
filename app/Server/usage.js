
export async function incrementUsage(pool,userId,key,amount=1,period='month'){
  const expr=period==='day' ? `(now() AT TIME ZONE 'UTC')::date` : `date_trunc('month',now())::date`;
  const r=await pool.query(
    `INSERT INTO usage_counters(user_id,usage_key,period_start,amount)
     VALUES($1,$2,${expr},$3)
     ON CONFLICT(user_id,usage_key,period_start)
     DO UPDATE SET amount=usage_counters.amount+EXCLUDED.amount,updated_at=now()
     RETURNING amount`,
    [userId,key,amount]
  );
  return r.rows[0].amount;
}
export async function currentUsage(pool,userId,key,period='month'){
  const expr=period==='day' ? `(now() AT TIME ZONE 'UTC')::date` : `date_trunc('month',now())::date`;
  const r=await pool.query(`SELECT amount FROM usage_counters WHERE user_id=$1 AND usage_key=$2 AND period_start=${expr}`,[userId,key]);
  return r.rows[0]?.amount||0;
}
