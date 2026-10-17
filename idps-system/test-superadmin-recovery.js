'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const register=require('./superadmin-recovery');
const adminEmail='contacto-superadmin@example.test';
const previousPassword='old password for testing';
const legacyHash=crypto.scryptSync(previousPassword,'idps-legacy-test-salt',64).toString('hex');
const layout=(_title,body)=>'<html><body>'+body+'</body></html>';

function fakeDatabase(){
  const state={row:null,writes:[],otherTablesTouched:false};
  const db={state,async query(sql,args=[]){
    state.writes.push(sql);
    if(sql.startsWith('CREATE TABLE IF NOT EXISTS idps_superadmin_credentials'))return {rowCount:0,rows:[]};
    if(sql.startsWith('INSERT INTO idps_superadmin_credentials')){
      if(!state.row)state.row={password_hash:args[0],password_version:0,reset_hash:null,reset_expires_at:null,reset_sent_at:null};
      return {rowCount:1,rows:[]};
    }
    if(sql.startsWith('SELECT password_hash,password_version'))return {rowCount:state.row?1:0,rows:state.row?[{...state.row}]:[]};
    if(sql.includes('SET reset_hash=$1,reset_expires_at=')){
      if(Date.now()-(state.row.reset_sent_at||0)<180000)return {rowCount:0,rows:[]};
      state.row.reset_hash=args[0];state.row.reset_expires_at=Date.now()+30*60000;
      state.row.reset_sent_at=Date.now();return {rowCount:1,rows:[{id:1}]};
    }
    if(sql.includes('SET reset_hash=NULL,reset_expires_at=NULL,reset_sent_at=NULL WHERE id=1 AND reset_hash=$1')){
      if(state.row.reset_hash===args[0]){state.row.reset_hash=null;state.row.reset_expires_at=null;state.row.reset_sent_at=null;}
      return {rowCount:1,rows:[]};
    }
    if(sql.includes('SET password_hash=$1,password_version=password_version+1')){
      if(state.row.reset_hash!==args[1]||state.row.reset_expires_at<Date.now())
        return {rowCount:0,rows:[]};
      state.row.password_hash=args[0];state.row.password_version++;
      state.row.reset_hash=null;state.row.reset_expires_at=null;state.row.reset_sent_at=null;
      return {rowCount:1,rows:[{password_version:state.row.password_version}]};
    }
    state.otherTablesTouched=true;
    throw Error('Unexpected SQL for recovery module: '+sql);
  }};
  return db;
}
async function fixture(){
  const app=express();
  app.use(express.urlencoded({extended:false}));
  const db=fakeDatabase(),mail=[];
  const module=register(app,{
    pool:db,adminEmail,legacyPasswordHash:legacyHash,legacySalt:'idps-legacy-test-salt',layout,
    env:{RESEND_API_KEY:'fake-key',RESEND_FROM:'IDPS <contacto@example.test>'},
    sendEmail:async(to,link)=>{mail.push({to,link});}
  });
  await module.init();
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const close=()=>new Promise(resolve=>server.close(resolve));
  const post=(path,data)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams(data)});
  return {app,db,mail,module,url,post,close};
}
test('only the superadministrator can use recovery; unknown addresses reveal nothing',async()=>{
  const x=await fixture();
  try{
    const pre=await x.module.verifyPassword(adminEmail,previousPassword);
    assert.equal(pre.ok,true);assert.equal(pre.version,0);
    const invalid=await x.post('/superadmin/recuperar',{email:'someone-else@example.test'});
    assert.equal(invalid.status,200);
    assert.match(await invalid.text(),/Revisa tu correo/);
    assert.equal(x.mail.length,0);
    const valid=await x.post('/superadmin/recuperar',{email:adminEmail});
    assert.equal(valid.status,200);
    assert.match(await valid.text(),/Revisa tu correo/);
    assert.equal(x.mail.length,1);
    assert.equal(x.mail[0].to,adminEmail);
    assert.match(x.mail[0].link,/\/superadmin\/restablecer#token=[0-9a-f]{64}$/);
    assert.equal(x.db.state.otherTablesTouched,false);
  }finally{await x.close();}
});
test('reset is one-use, rejects wrong/replayed token, revokes former superadmin sessions',async()=>{
  const x=await fixture();
  try{
    await x.post('/superadmin/recuperar',{email:adminEmail});
    const value=x.mail[0].link.split('#token=')[1];
    const good='new admin password for IDPS';
    const wrong=await x.post('/superadmin/restablecer',{token:'0'.repeat(64),password:good,confirm:good});
    assert.equal(wrong.status,400);
    const tooShort=await x.post('/superadmin/restablecer',{token:value,password:'1234567',confirm:'1234567'});
    assert.equal(tooShort.status,400);
    const result=await x.post('/superadmin/restablecer',{token:value,password:good,confirm:good});
    assert.equal(result.status,200);
    assert.match(await result.text(),/Contraseña actualizada/);
    assert.equal((await x.module.verifyPassword(adminEmail,good)).ok,true);
    assert.equal((await x.module.verifyPassword(adminEmail,previousPassword)).ok,false);
    assert.equal(await x.module.sessionValid({role:'superadmin',sv:0}),false);
    assert.equal(await x.module.sessionValid({role:'superadmin',sv:1}),true);
    const replay=await x.post('/superadmin/restablecer',{token:value,password:'another long password for IDPS',confirm:'another long password for IDPS'});
    assert.equal(replay.status,400);
    assert.equal(x.db.state.otherTablesTouched,false);
  }finally{await x.close();}
});
test('expired link is rejected without changing password or institution state',async()=>{
  const x=await fixture();
  try{
    await x.post('/superadmin/recuperar',{email:adminEmail});
    const token=x.mail[0].link.split('#token=')[1];
    x.db.state.row.reset_expires_at=Date.now()-10;
    const answer=await x.post('/superadmin/restablecer',{token,password:'safe long password here',confirm:'safe long password here'});
    assert.equal(answer.status,400);
    assert.equal((await x.module.verifyPassword(adminEmail,previousPassword)).ok,true);
    assert.equal(x.db.state.otherTablesTouched,false);
  }finally{await x.close();}
});
test('visible recovery page prevents token leaking in query string and disables invalid links',async()=>{
  const x=await fixture();
  try{
    const res=await fetch(x.url+'/superadmin/restablecer');
    assert.equal(res.status,200);
    assert.equal(res.headers.get('referrer-policy'),'no-referrer');
    const html=await res.text();
    assert.match(html,/location.hash.match/);
    assert.match(html,/history.replaceState/);
    assert.match(html,/autocomplete="new-password"/);
  }finally{await x.close();}
});
