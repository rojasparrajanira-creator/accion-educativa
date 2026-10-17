'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createMailer=require('./idps-mailer');

function stubDb(refresh='valid-refresh'){
  const events=[];
  return {
    events,
    async query(sql,args=[]){
      if(sql.startsWith('CREATE TABLE'))return {rows:[],rowCount:0};
      if(sql.includes("key='gmail_refresh_token'"))return {rows:refresh?[{value:refresh}]:[]};
      if(sql.startsWith('INSERT INTO idps_email_delivery')){
        events.push({category:args[1],to:args[2],subject:args[3],
          relatedId:args[4],status:args[5],messageId:args[6]});
        return {rowCount:1,rows:[]};
      }
      if(sql.startsWith('SELECT id,category'))return {rows:events.map(e=>({
        ...e,recipient:e.to,status:e.status,provider_message_id:e.messageId,
        created_at:new Date(),id:'mock-id'}))};
      throw Error('Unexpected query '+sql);
    }
  };
}
test('connected Gmail accepts outgoing mail, saves its message ID and never logs PIN or contents',async()=>{
  const db=stubDb();
  const called=[];
  const mailer=createMailer({
    pool:db,env:{GOOGLE_CLIENT_ID:'fake-id',GOOGLE_CLIENT_SECRET:'fake-secret'},
    http:async(url,args)=>{
      called.push({url,args});
      if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'mock-token'})};
      if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send')return {ok:true,json:async()=>({id:'gmail-message-123',threadId:'thread123',labelIds:['SENT']})};
      throw Error('unexpected URL');
    }
  });
  await mailer.init();
  assert.deepEqual(await mailer.status(),{connected:true,reason:null});
  const message=await mailer.send({to:'client@example.test',subject:'Cuenta IDPS',html:'<b>PIN SECRETO 333333</b>',
    category:'acceso_pin',relatedId:'institution-123'});
  assert.deepEqual(message,{sent:true,via:'gmail',providerMessageId:'gmail-message-123'});
  const sent=called.filter(x=>x.url.includes('messages/send'));
  assert.equal(sent.length,1);
  const raw=JSON.parse(sent[0].args.body).raw;
  assert.match(Buffer.from(raw,'base64url').toString(),/To: client@example.test/);
  assert.equal(db.events.length,1);
  assert.equal(db.events[0].status,'accepted');
  assert.equal(db.events[0].category,'acceso_pin');
  assert.equal(db.events[0].relatedId,'institution-123');
  assert.equal(db.events[0].messageId,'gmail-message-123');
  assert.doesNotMatch(JSON.stringify(db.events),/333333/);
  assert.equal((await mailer.history())[0].status,'accepted');
});
test('expired Gmail authorization never falls back to Resend and records a failure',async()=>{
  const db=stubDb('stale-refresh'),called=[];
  const mailer=createMailer({
    pool:db,
    env:{GOOGLE_CLIENT_ID:'fake-id',GOOGLE_CLIENT_SECRET:'fake-secret',
      RESEND_API_KEY:'fake-resend-key',RESEND_FROM:'noreply@verified.test'},
    http:async(url)=>{
      called.push(url);
      if(url==='https://oauth2.googleapis.com/token')return {ok:false,status:400};
      throw Error('Unexpected network call');
    }
  });
  assert.equal((await mailer.status()).connected,false);
  await assert.rejects(()=>mailer.send({to:'client@example.test',subject:'Access',html:'hello',
    category:'acceso_pin'}),/Gmail/);
  assert.equal(db.events.length,1);
  assert.equal(db.events[0].status,'failed');
  assert.ok(called.every(url=>url.startsWith('https://oauth2.googleapis.com/')));
});
test('unconnected Gmail reports unavailable and does not claim a message was sent',async()=>{
  const db=stubDb(null);
  const mailer=createMailer({pool:db,env:{GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret'}});
  assert.equal(await mailer.available(),false);
  await assert.rejects(()=>mailer.send({to:'client@example.test',subject:'IDPS',html:'hello'}),/no está conectado/);
  assert.equal(db.events[0].status,'failed');
});
