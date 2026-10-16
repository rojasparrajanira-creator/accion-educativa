'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createApp, parseSignature, validSignature} = require('./server');

function signature(secret, dataId, requestId, ts) {
  return crypto.createHmac('sha256',secret)
    .update('id:'+dataId.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
}
async function withServer(secret, callback) {
  const server = createApp({getSecret:()=>secret});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await callback('http://127.0.0.1:'+server.address().port);}
  finally {await new Promise(resolve=>server.close(resolve));}
}
test('health reports test-only mode and hides all secrets',async()=>{
  await withServer('',async base=>{
    const r=await fetch(base+'/health');
    const root=await (await fetch(base+'/')).json();
    assert.equal(root.ok,true);
    assert.equal(root.configured,false);
    assert.equal(root.chargesEnabled,false);
    const j=await r.json();
    assert.equal(r.status,200);
    assert.equal(j.configured,false);
    assert.equal(j.chargesEnabled,false);
    assert.ok(!JSON.stringify(j).includes('SECRET'));
    const bad=await fetch(base+'/webhooks/mercadopago',{method:'POST'});
    assert.equal(bad.status,503);
  });
});
test('accepts only correctly signed Mercado Pago webhook simulation',async()=>{
  await withServer('local-fixture-not-a-real-credential',async base=>{
    const ts=String(Date.now()), reqId='test-request-123',id='12345';
    const s=signature('local-fixture-not-a-real-credential',id,reqId,ts);
    const path='/webhooks/mercadopago?data.id='+id;
    const headers={'x-request-id':reqId,'x-signature':'ts='+ts+',v1='+s,'content-type':'application/json'};
    const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify({type:'subscription_authorized_payment',data:{id}})});
    assert.equal(r.status,200);
    assert.deepEqual(await r.json(),{received:true,testOnly:true});
    const status=await (await fetch(base+'/status')).json();
    assert.equal(status.receivedVerified,1);
    assert.equal(status.lastVerifiedTopic,'subscription_authorized_payment');
    assert.equal(status.chargesEnabled,false);
    const bad=await fetch(base+path,{method:'POST',headers:{...headers,'x-signature':'ts='+ts+',v1='+'0'.repeat(64)},body:'{}'});
    assert.equal(bad.status,401);
    const latest=await (await fetch(base+'/status')).json();
    assert.equal(latest.receivedVerified,1);
  });
});
test('rejects stale timestamps, malformed and invalid signatures',()=>{
  const secret='test-secret',id='HELLO',reqId='req-1',ts=String(Date.now());
  const sig=signature(secret,id,reqId,ts);
  assert.ok(parseSignature('ts='+ts+',v1='+sig));
  assert.equal(parseSignature('ts='+ts+',v1='+'bad'),null);
  assert.equal(parseSignature('ts='+ts+',v1='+sig+',ts='+ts),null);
  assert.equal(validSignature({secret,timestamp:ts,requestId:reqId,dataId:id,signature:sig,now:Date.now()}),true);
  assert.equal(validSignature({secret,timestamp:ts,requestId:reqId,dataId:id,signature:sig,now:Date.now()+3600000}),false);
});
