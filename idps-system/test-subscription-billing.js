'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const register=require('./subscription-billing');
const subscriptionId='11111111-1111-4111-8111-111111111111';
const billingSecret='dummy-test-webhook-secret';
const now=()=>Date.now();

function config(){
  const env={
    IDPS_BILLING_ENABLED:'true',
    DATABASE_URL:'postgres://invalid/test',
    MERCADOPAGO_ACCESS_TOKEN:'dummy-test-token',
    MERCADOPAGO_WEBHOOK_SECRET:billingSecret,
    IDPS_BILLING_CRON_SECRET:'dummy-cron',
    RESEND_API_KEY:'dummy-mail',
    RESEND_FROM:'idps@example.test',
    PUBLIC_URL:'https://idps.example.test'
  };
  const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env);
  return ()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};
}
const fixture=()=>({
  stored:{id:subscriptionId,rbd_norm:'12345',email:'escuela@example.test',preapproval_id:'pre-01',
    status:'pending',access_until:null},
  establishment:{rbd_norm:'12345',email:'escuela@example.test',status:'active',expires_at:null},
  invoice:{id:777,preapproval_id:'pre-01',currency_id:'CLP',transaction_amount:'15000',
    payment:{id:999,status:'approved'}},
  payment:{id:999,status:'approved',currency_id:'CLP',transaction_amount:15000},
  subscription:{id:'pre-01',external_reference:subscriptionId,status:'authorized',payer_email:'escuela@example.test',
    auto_recurring:{frequency:30,frequency_type:'days',currency_id:'CLP',transaction_amount:15000},
    next_payment_date:'2026-11-16T17:00:00Z'},
  charges:new Set(),notices:new Set(),emails:0,failOneUpdate:false
});

function fakePool(state){
  let snapshot;
  const query=async(sql,args=[])=>{
    if(/CREATE TABLE IF NOT EXISTS/.test(sql))return {rowCount:0,rows:[]};
    if(sql==='BEGIN'){snapshot={stored:structuredClone(state.stored),establishment:structuredClone(state.establishment),
      charges:new Set(state.charges)};return {rows:[]};}
    if(sql==='COMMIT'){snapshot=null;return {rows:[]};}
    if(sql==='ROLLBACK'){if(snapshot){state.stored=snapshot.stored;state.establishment=snapshot.establishment;
      state.charges=snapshot.charges;}snapshot=null;return {rows:[]};}
    if(/SELECT \* FROM idps_billing_subscriptions WHERE preapproval_id=\$1 FOR UPDATE/.test(sql)){
      return {rowCount:1,rows:[{...state.stored}]};
    }
    if(/INSERT INTO idps_billing_charges/.test(sql)){
      if(state.charges.has(args[0]))return {rowCount:0,rows:[]};
      state.charges.add(args[0]);return {rowCount:1,rows:[{payment_id:args[0]}]};
    }
    if(/UPDATE idps_billing_subscriptions SET status='authorized',last_payment_at=now\(\)/.test(sql)){
      if(state.failOneUpdate){state.failOneUpdate=false;throw Error('simulated transaction failure');}
      const current=state.stored.access_until?Date.parse(state.stored.access_until):now();
      const start=Math.max(current,now());
      state.stored.access_until=new Date(start+30*86400000).toISOString();
      state.stored.status='authorized';state.stored.next_payment_at=args[1];return {rowCount:1,rows:[{...state.stored}]};
    }
    if(/UPDATE idps_establishments SET expires_at/.test(sql)){
      if(state.establishment.rbd_norm===args[0]&&state.establishment.email===args[1]&&state.establishment.status==='active'){
        state.establishment.expires_at=args[2];return {rowCount:1,rows:[]};}
      return {rowCount:0,rows:[]};
    }
    if(/UPDATE idps_billing_subscriptions SET cancel_token_hash/.test(sql)){
      state.stored.cancel_token_hash=args[1];return {rowCount:1,rows:[]};
    }
    if(/SELECT 1 FROM idps_billing_notices/.test(sql)){
      const key=args.join('|');return {rowCount:state.notices.has(key)?1:0,rows:[]};
    }
    if(/INSERT INTO idps_billing_notices/.test(sql)){
      state.notices.add(args.join('|'));return {rowCount:1,rows:[]};
    }
    throw Error('Unmocked SQL: '+sql.slice(0,100));
  };
  return {query,async connect(){return {query,release(){}};}};
}
function signature(secret,id,requestId,ts){
  return crypto.createHmac('sha256',secret)
    .update('id:'+id.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';').digest('hex');
}
function registerApp(state){
  const routes={};
  const app={post(path,...handlers){routes[path]=handlers.at(-1);},
    get(path,...handlers){routes[path]=handlers.at(-1);}};
  const init=register(app,{pool:fakePool(state),layout:(_title,body)=>body});
  return {routes,init};
}
function req(id='777',topic='subscription_authorized_payment'){
  const timestamp=String(now()),rid='test-webhook-1';
  const sig=signature(billingSecret,id,rid,timestamp);
  const headers={'x-signature':'ts='+timestamp+',v1='+sig,'x-request-id':rid};
  return {body:{type:topic,data:{id}},query:{'data.id':id},get(name){return headers[name.toLowerCase()];}};
}
function reply(){return {statusCode:null,sendStatus(v){this.statusCode=v;return this;}};}
async function mockNetwork(state,run){
  const old=global.fetch;
  global.fetch=async(url)=>{
    const uri=String(url);
    let obj;
    if(uri.endsWith('/authorized_payments/777'))obj=state.invoice;
    else if(uri.endsWith('/v1/payments/999'))obj=state.payment;
    else if(uri.endsWith('/preapproval/pre-01'))obj=state.subscription;
    else if(uri==='https://api.resend.com/emails'){state.emails++;return {ok:true,json:async()=>({})};}
    else throw Error('Unexpected fake network URL: '+uri);
    return {ok:true,json:async()=>obj};
  };
  try{await run();}finally{global.fetch=old;}
}

test('refuses real charges by default, even if merchant credentials are present',()=>{
  const restore=config();
  try{
    delete process.env.IDPS_BILLING_ENABLED;
    assert.equal(register.ready(),false);
    process.env.IDPS_BILLING_ENABLED='false';
    assert.equal(register.ready(),false);
  }finally{restore();}
});
test('simulated signed approved charge extends access once; duplicates do not extend it again',async()=>{
  const restore=config(),state=fixture();
  try{
    const {routes,init}=registerApp(state);await init();
    await mockNetwork(state,async()=>{
      const endpoint=routes['/webhooks/mercadopago/subscriptions'];
      const first=reply();await endpoint(req(),first);
      assert.equal(first.statusCode,200);
      assert.equal(state.charges.size,1);
      assert.ok(Date.parse(state.stored.access_until)>Date.now()+29*86400000);
      assert.equal(state.establishment.expires_at,state.stored.access_until);
      assert.equal(state.emails,1);
      const until=state.stored.access_until;
      const repeated=reply();await endpoint(req(),repeated);
      assert.equal(repeated.statusCode,200);
      assert.equal(state.charges.size,1);
      assert.equal(state.stored.access_until,until);
      assert.equal(state.emails,1);
    });
  }finally{restore();}
});
test('rejects untrusted webhook signatures before contacting the payment provider',async()=>{
  const restore=config(),state=fixture();try{
    const {routes,init}=registerApp(state);await init();
    const input=req();input.get=()=> 'INVALID';
    const res=reply();
    await routes['/webhooks/mercadopago/subscriptions'](input,res);
    assert.equal(res.statusCode,401);
    assert.equal(state.charges.size,0);
  }finally{restore();}
});
test('incorrect amount, altered interval, rejected card or canceled subscription never extend access',async()=>{
  const restore=config();
  try{
    for(const changed of [
      s=>{s.payment.status='rejected';},
      s=>{s.invoice.transaction_amount=1000;},
      s=>{s.subscription.auto_recurring.frequency=1;s.subscription.auto_recurring.frequency_type='months';},
      s=>{s.stored.status='canceled';},
      s=>{s.subscription.external_reference='unmatched';}
    ]){
      const state=fixture();changed(state);
      const {routes,init}=registerApp(state);await init();
      await mockNetwork(state,async()=>{
        const res=reply();await routes['/webhooks/mercadopago/subscriptions'](req(),res);
        assert.equal(res.statusCode,200);
        assert.equal(state.charges.size,0);
        assert.equal(state.stored.access_until,null);
      });
    }
  }finally{restore();}
});
test('database failure rolls back payment receipt, allowing safe retry',async()=>{
  const restore=config(),state=fixture();
  try{
    state.failOneUpdate=true;
    const {routes,init}=registerApp(state);await init();
    await mockNetwork(state,async()=>{
      const endpoint=routes['/webhooks/mercadopago/subscriptions'];
      const first=reply();await endpoint(req(),first);
      assert.equal(first.statusCode,503);
      assert.equal(state.charges.size,0);
      assert.equal(state.stored.access_until,null);
      const retry=reply();await endpoint(req(),retry);
      assert.equal(retry.statusCode,200);
      assert.equal(state.charges.size,1);
    });
  }finally{restore();}
});
