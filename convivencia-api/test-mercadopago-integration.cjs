'use strict';
// Pruebas integrales: PostgreSQL PGlite + HTTP Express + proveedor Mercado Pago SIMULADO.
// No usa credenciales ni ejecuta cobros reales.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const {createSubscriptions}=require('./subscriptions');
let db,pool,service,server,base,admin,seq=30000;
const mails=[],remoteInvoices=[],payments=new Map(),preapprovals=new Map();
const env={
 MEC_SUBSCRIPTION_ENCRYPTION_KEY:'isolated-test-only',
 MEC_SUBSCRIPTION_PAYMENT_PROVIDER:'mercadopago',
 MEC_SUBSCRIPTION_MP_MODE:'production',
 MEC_SUBSCRIPTION_MP_CHECKOUT_ENABLED:'1',
 MEC_SUBSCRIPTION_MP_ACCESS_TOKEN:'dummy-not-a-real-token',
 MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET:'dummy-secret'
};
function normalizedRut(raw){return String(raw||'').toUpperCase().replace(/[^0-9K]/g,'').replace(/^(\d+)([0-9K])$/,'$1-$2')}
function validRut(raw){const x=normalizedRut(raw),m=x.match(/^(\d{7,8})-([0-9K])$/);if(!m)return false;let total=0,mult=2;for(const c of [...m[1]].reverse()){total+=Number(c)*mult;mult=mult===7?2:mult+1}const n=11-total%11;return String(n===11?'0':n===10?'K':n)===m[2]}
async function hashPassword(pass){const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:crypto.scryptSync(pass,salt,64).toString('hex')}}
async function auth(req,res,next){const id=Number(req.headers['x-test-user']);const q=await pool.query('select * from users where id=$1',[id]);req.auth=q.rows[0];if(!req.auth)return res.status(401).json({ok:false});next()}
const role=r=>[auth,(req,res,next)=>req.auth.role===r?next():res.status(403).json({ok:false})];
const locks=new Map();
async function lock(id,fn){const prev=locks.get(id)||Promise.resolve();let release;const next=new Promise(ok=>release=ok);locks.set(id,prev.then(()=>next));await prev;try{return await fn(pool)}finally{release()}}
const mp={
 configuration:()=>({mode:'production',configured:true,ready:true}),
 async createPreapproval({id,email,amountClp}){const pre={id:'mp'+id.replaceAll('-',''),status:'pending',external_reference:'MEC-CONV-'+id,
  payer_email:email,auto_recurring:{frequency:30,frequency_type:'days',currency_id:'CLP',transaction_amount:amountClp},
  init_point:'https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=mp'+id.replaceAll('-','')};
  preapprovals.set(pre.id,pre);return {preapprovalId:pre.id,checkoutUrl:pre.init_point}},
 async getPreapproval(id){if(!preapprovals.has(id))throw Error('not_found');return preapprovals.get(id)},
 async listInvoices(id){return remoteInvoices.filter(x=>x.preapproval_id===id)},
 async getInvoice(id){return remoteInvoices.find(x=>String(x.id)===String(id))},
 async getPayment(id){return payments.get(String(id))},
 async cancelPreapproval(id){const p=preapprovals.get(id);p.status='canceled';return p},
 webhookValid:()=>false
};
async function call(path,body,user){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(user?{'x-test-user':String(user)}:{})},
 body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
 const data=await response.json().catch(()=>null);return {status:response.status,data};
}
function form(){
 seq++;
 return {rbd:String(seq),full_name:'Profesional de Prueba',establishment_name:'Escuela Demo',
  rut:'12.345.678-5',email:'responsable@example.test',plan_code:'300',consent:true,recurring_consent:true};
}
function paidInvoice(subscription,invoiceId,paymentId,amount=12990){
 const reference='MEC-CONV-'+subscription.id;
 const invoice={id:invoiceId,preapproval_id:subscription.mp_preapproval_id,external_reference:reference,
  currency_id:'CLP',transaction_amount:amount,payment:{id:paymentId,status:'approved'},
  date_created:new Date().toISOString()};
 remoteInvoices.push(invoice);
 payments.set(String(paymentId),{id:paymentId,live_mode:true,status:'approved',currency_id:'CLP',transaction_amount:amount});
 return invoice;
}
before(async()=>{
 db=new PGlite();
 await db.exec(fs.readFileSync(__dirname+'/schema.sql','utf8'));
 await db.exec(fs.readFileSync(__dirname+'/subscriptions.sql','utf8'));
 pool={
  async query(sql,args){if(/pg_(try_)?advisory/.test(sql))return {rows:[{held:true}],rowCount:1};const r=await db.query(sql,args);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0}},
  async connect(){return {...this,release(){}}}
 };
 const e=await pool.query("insert into establishments(name,rbd) values('Administración Test','MEC-ADMIN-TEST') returning id");
 const u=await pool.query("insert into users(establishment_id,name,email,role) values($1,'Admin','admin@example.test','platform_admin') returning id",[e.rows[0].id]);admin=u.rows[0].id;
 const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));
 service=createSubscriptions({app,pool,requireAuth:auth,requireRole:role,rateLimit:()=>((req,res,next)=>next()),makePassword:hashPassword,validRut,
  normalizeRut:normalizedRut,env,lockOverride:lock,mailOverride:async mail=>mails.push(mail),mercadoPagoOverride:mp,
  gatewayOverride:{}});
 server=app.listen(0,'127.0.0.1');await new Promise(ok=>server.once('listening',ok));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise(ok=>server.close(ok));if(db)await db.close()});
let newSubscription,token;
test('solicitud Mercado Pago sin modificar contratos Oneclick ni activar pagos',async()=>{
 const plans=await call('/api/subscriptions/plans');
 assert.equal(plans.status,200);assert.equal(plans.data.payment_provider,'mercadopago');
 assert.equal(plans.data.payment_ready,true);
 const r=await call('/api/subscriptions/requests',form());
 assert.equal(r.status,201,JSON.stringify(r.data));token=r.data.management_token;
 const q=await pool.query('select * from mec_subscriptions where id=$1',[r.data.id]);
 newSubscription=q.rows[0];assert.equal(newSubscription.payment_provider,'mercadopago');
 assert.equal(newSubscription.status,'requested');
 const a=await call('/api/subscriptions/enroll',{token});
 assert.equal(a.status,409);
});
test('preapproval se inicia una vez y no crea cuentas ni cargos por sí mismo',async()=>{
 const r=await call('/api/subscriptions/mercadopago/start',{token});
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.ok(r.data.url.startsWith('https://www.mercadopago.cl/'));
 const previous=await call('/api/subscriptions/mercadopago/start',{token});
 assert.equal(previous.status,200);
 assert.equal(previous.data.url,r.data.url);
 newSubscription=(await pool.query('select * from mec_subscriptions where id=$1',[newSubscription.id])).rows[0];
 assert.equal(newSubscription.status,'enrolling');
 assert.equal((await pool.query('select count(*) n from mec_subscription_mp_invoices')).rows[0].n,0);
});
test('no hay activación ni aprobación antes de pago reconocido',async()=>{
 assert.equal((await call('/api/subscriptions/admin/'+newSubscription.id+'/activate',{},admin)).status,409);
 const sync=await call('/api/subscriptions/mercadopago/sync',{token});
 assert.equal(sync.status,200);
 assert.equal(sync.data.confirmed,0);
});
test('pago aprobado se contabiliza una vez incluso con notificaciones duplicadas',async()=>{
 paidInvoice(newSubscription,1001,7001);
 const [a,b]=await Promise.all([call('/api/subscriptions/mercadopago/sync',{token}),call('/api/subscriptions/mercadopago/sync',{token})]);
 assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(b.status,200,JSON.stringify(b.data));
 const q=await pool.query('select status from mec_subscriptions where id=$1',[newSubscription.id]);
 assert.equal(q.rows[0].status,'paid_pending_activation');
 assert.equal((await pool.query('select count(*) n from mec_subscription_mp_invoices where subscription_id=$1',[newSubscription.id])).rows[0].n,1);
 assert.equal((await pool.query('select establishment_id from mec_subscriptions where id=$1',[newSubscription.id])).rows[0].establishment_id,null);
});
test('pago manipulado no altera vigencia ni activa cuenta',async()=>{
 paidInvoice(newSubscription,1002,7002,1);
 await call('/api/subscriptions/mercadopago/sync',{token});
 const q=await pool.query('select count(*) n from mec_subscription_mp_invoices where subscription_id=$1',[newSubscription.id]);
 assert.equal(q.rows[0].n,1);
 remoteInvoices.splice(remoteInvoices.findIndex(x=>x.id===1002),1);
});
test('solo el superadministrador activa 30 días después de pago confirmado',async()=>{
 assert.equal((await call('/api/subscriptions/admin/'+newSubscription.id+'/activate',{})).status,401);
 const before=Date.now();
 const r=await call('/api/subscriptions/admin/'+newSubscription.id+'/activate',{},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 newSubscription=(await pool.query('select * from mec_subscriptions where id=$1',[newSubscription.id])).rows[0];
 assert.equal(newSubscription.status,'active');
 assert.ok(new Date(newSubscription.access_until).getTime()-before>29*24*3600*1000);
});
test('renovación se procesa una vez y extiende periodo, sin duplicarlo',async()=>{
 const old=new Date(newSubscription.access_until).getTime();
 paidInvoice(newSubscription,1003,7003);
 const first=await call('/api/subscriptions/mercadopago/sync',{token});
 assert.equal(first.status,200,JSON.stringify(first.data));
 const newer=(await pool.query('select access_until from mec_subscriptions where id=$1',[newSubscription.id])).rows[0].access_until;
 assert.ok(new Date(newer).getTime()-old>=29*24*3600*1000);
 await call('/api/subscriptions/mercadopago/sync',{token});
 assert.equal((await pool.query('select access_until from mec_subscriptions where id=$1',[newSubscription.id])).rows[0].access_until.getTime(),newer.getTime());
 assert.equal((await pool.query('select count(*) n from mec_subscription_mp_invoices where subscription_id=$1',[newSubscription.id])).rows[0].n,2);
});
test('cancelación a través del enlace impide nuevos cobros y conserva acceso pagado',async()=>{
 const r=await call('/api/subscriptions/cancel-by-token',{token});
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.subscription.status,'cancelled');
 assert.equal(preapprovals.get(newSubscription.mp_preapproval_id).status,'canceled');
 const q=await pool.query('select cancelled_at,next_charge_at,access_until from mec_subscriptions where id=$1',[newSubscription.id]);
 assert.ok(q.rows[0].cancelled_at);assert.equal(q.rows[0].next_charge_at,null);assert.ok(q.rows[0].access_until);
});
test('un cobro tardío tras cancelación requiere revisión; nunca reactiva el acceso',async()=>{
 paidInvoice(newSubscription,1004,7004);
 const r=await call('/api/subscriptions/mercadopago/sync',{token});
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal((await pool.query('select status from mec_subscriptions where id=$1',[newSubscription.id])).rows[0].status,'cancelled');
 assert.ok(mails.length>0);
});
test('cancelación hecha directamente en Mercado Pago se refleja localmente',async()=>{
 const req=await call('/api/subscriptions/requests',form());assert.equal(req.status,201);
 const go=await call('/api/subscriptions/mercadopago/start',{token:req.data.management_token});assert.equal(go.status,200);
 const sub=(await pool.query('select * from mec_subscriptions where id=$1',[req.data.id])).rows[0];
 preapprovals.get(sub.mp_preapproval_id).status='canceled';
 const sync=await call('/api/subscriptions/mercadopago/sync',{token:req.data.management_token});
 assert.equal(sync.status,200,JSON.stringify(sync.data));
 const status=(await pool.query('select cancelled_at,status from mec_subscriptions where id=$1',[sub.id])).rows[0];
 assert.ok(status.cancelled_at);assert.equal(status.status,'cancelled');
});
