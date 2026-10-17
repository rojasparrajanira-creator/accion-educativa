'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createMailer=require('./idps-mailer');

test('uses connected Gmail when refresh token and OAuth are valid',async()=>{
  const calls=[];
  const mailer=createMailer({
    pool:{async query(sql){assert.match(sql,/gmail_refresh_token/);return {rows:[{value:'mock-refresh'}]};}},
    env:{GOOGLE_CLIENT_ID:'fake-id',GOOGLE_CLIENT_SECRET:'fake-secret'},
    http:async(url,args)=>{
      calls.push({url,args});
      if(url==='https://oauth2.googleapis.com/token')return {ok:true,json:async()=>({access_token:'mock-token'})};
      if(url==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send')return {ok:true};
      throw Error('unexpected URL');
    }
  });
  assert.equal(await mailer.available(),true);
  const sent=await mailer.send({to:'client@example.test',subject:'Cuenta IDPS',html:'<b>Acceso</b>'});
  assert.deepEqual(sent,{sent:true,via:'gmail'});
  assert.equal(calls.length,2);
  const outgoing=JSON.parse(calls[1].args.body);
  const mail=Buffer.from(outgoing.raw,'base64url').toString();
  assert.match(mail,/To: client@example.test/);
  assert.match(mail,/Acceso/);
  assert.doesNotMatch(mail,/mock-refresh/);
});

test('falls back to a verified Resend sender when Gmail refresh fails',async()=>{
  const called=[];
  const mailer=createMailer({
    pool:{async query(){return {rows:[{value:'mock-stale-refresh'}]};}},
    env:{GOOGLE_CLIENT_ID:'fake-id',GOOGLE_CLIENT_SECRET:'fake-secret',
      RESEND_API_KEY:'fake-key',RESEND_FROM:'IDPS <notices@example.test>'},
    http:async(url,args)=>{
      called.push(url);
      if(url.includes('oauth2.googleapis.com'))return {ok:false,status:400};
      if(url==='https://api.resend.com/emails'){
        const payload=JSON.parse(args.body);
        assert.equal(payload.from,'IDPS <notices@example.test>');
        return {ok:true};
      }
      throw Error('unexpected request');
    }
  });
  assert.equal((await mailer.send({to:'user@example.test',subject:'Clave',html:'<b>PIN</b>'})).via,'resend');
  assert.equal(called.length,2);
});

test('no active sender fails safely and does not pretend an email was accepted',async()=>{
  const mailer=createMailer({pool:null,env:{GOOGLE_CLIENT_ID:'fake',RESEND_API_KEY:'fake'}});
  assert.equal(await mailer.available(),false);
  await assert.rejects(()=>mailer.send({to:'user@example.test',subject:'IDPS',html:'correo'}),/No hay un canal de correo operativo/);
});
