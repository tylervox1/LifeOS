
import 'dotenv/config';import {logger} from './logger.js';import os from 'os';import pg from 'pg';import {claimNext,complete,fail,recoverStale} from './jobs.js';import {processJob} from './services.js';
const {Pool}=pg,pool=new Pool({connectionString:process.env.DATABASE_URL}),id=`${os.hostname()}:${process.pid}`,sleep=ms=>new Promise(r=>setTimeout(r,ms)),poll=Number(process.env.WORKER_POLL_MS||5000);
await recoverStale(pool);logger.info(`LifeOS worker ${id}`);
while(true){let j=null;try{j=await claimNext(pool,id);if(!j){await sleep(poll);continue}await processJob(pool,j);await complete(pool,j.id)}catch(e){logger.error(e);if(j)await fail(pool,j,e);await sleep(1000)}}
