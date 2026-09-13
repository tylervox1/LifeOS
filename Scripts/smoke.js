
import 'dotenv/config';
const base=(process.env.APP_PUBLIC_URL||process.env.APP_BASE_URL||'http://localhost:3000').replace(/\/$/,'');
const checks=[
  ['/api/health',200],
  ['/api/readiness',200],
  ['/api/public/beta-status',200],
  ['/',200],
  ['/admin.html',200],
  ['/legal/privacy.html',200],
  ['/legal/terms.html',200]
];
let failed=0;
for(const [path,expected] of checks){
  try{
    const r=await fetch(base+path,{redirect:'manual'});
    if(r.status!==expected){console.error(`FAIL ${path}: ${r.status}, expected ${expected}`);failed++}
    else console.log(`OK ${path}`);
  }catch(e){console.error(`FAIL ${path}: ${e.message}`);failed++}
}
process.exitCode=failed?1:0;
