'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createSettings=require('./idps-transfer-settings');

test('Superadmin-configured bank details override absent Render variables and stay persisted',async()=>{
  let stored=null;
  const pool={async query(sql,args=[]){
    if(sql.startsWith('CREATE TABLE'))return {rows:[],rowCount:0};
    if(sql.startsWith('SELECT value'))return {rows:stored?[{value:stored}]:[]};
    if(sql.startsWith('INSERT INTO idps_settings')){stored=args[0];return {rowCount:1,rows:[]};}
    throw Error('Unexpected SQL: '+sql);
  }};
  const routes={};
  const app={
    get(path,...handlers){routes['GET '+path]=handlers;},
    post(path,...handlers){routes['POST '+path]=handlers;}
  };
  const settings=createSettings({pool,env:{},layout:(title,body)=>body,
    requireSuper:(req,res,next)=>req.authenticated?next():res.status(403).end()});
  await settings.init();
  assert.equal((await settings.get()).ready,false);
  settings.register(app);
  const data={holder:'Acción Educativa SPA',rut:'RUT ficticio',bank:'Banco Ficticio',
    type:'Cuenta corriente',number:'12345',email:'pagos@example.test'};
  const post=routes['POST /superadmin/datos-transferencia'];
  const result={destination:null,statusCode:200,redirect(dest){this.destination=dest;},
    status(v){this.statusCode=v;return this;},end(){}};
  post[0]({authenticated:true},result,()=>post[1]({body:data},result));
  // Middleware is async in production; wait a microtask for Postgres callbacks to settle.
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.match(result.destination,/superadmin\/dashboard/);
  assert.equal((await settings.get()).holder,data.holder);
  assert.equal((await settings.get()).ready,true);
  assert.equal(JSON.parse(stored).number,data.number);
});
test('bank settings handler denies unapproved users',()=>{
  const settings=createSettings({pool:null,layout:(a,b)=>b,
    requireSuper:(req,res,next)=>req.authenticated?next():res.status(403).end()});
  const routes={};
  settings.register({get(name,...handlers){routes[name]=handlers;},post(){}});
  let status=0;
  routes['/superadmin/datos-transferencia'][0]({authenticated:false},
    {status(n){status=n;return this;},end(){}},()=>{throw Error('Should not pass');});
  assert.equal(status,403);
});
