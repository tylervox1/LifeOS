
import http from 'node:http';

export async function startFakeGoogle() {
  const state = { drafts: [], sends: [], events: [], revoked: [] };
  const server = http.createServer(async (req,res)=>{
    const chunks=[]; for await (const c of req) chunks.push(c);
    const body=Buffer.concat(chunks).toString();
    res.setHeader('Content-Type','application/json');

    if(req.url==='/userinfo'){
      res.end(JSON.stringify({sub:'fake-google-user',email:'fake@example.com',name:'Fake Google User'})); return;
    }
    if(req.url==='/token'){
      res.end(JSON.stringify({access_token:'fake-access',refresh_token:'fake-refresh',expires_in:3600,scope:'openid email'})); return;
    }
    if(req.url?.startsWith('/revoke')){
      state.revoked.push(req.url);res.statusCode=200;res.end('{}');return;
    }
    if(req.url==='/gmail/drafts' && req.method==='POST'){
      state.drafts.push(JSON.parse(body));res.end(JSON.stringify({id:'draft-1',message:{id:'msg-draft-1'}}));return;
    }
    if(req.url==='/gmail/messages/send' && req.method==='POST'){
      state.sends.push(JSON.parse(body));res.end(JSON.stringify({id:'sent-1'}));return;
    }
    if(req.url==='/calendar/calendars/primary/events' && req.method==='POST'){
      state.events.push(JSON.parse(body));res.end(JSON.stringify({id:'evt-1',htmlLink:'https://fake/event/1'}));return;
    }
    res.statusCode=404;res.end(JSON.stringify({error:'not found',url:req.url}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address();
  return {
    base:`http://127.0.0.1:${port}`,
    state,
    close:()=>new Promise(resolve=>server.close(resolve))
  };
}
