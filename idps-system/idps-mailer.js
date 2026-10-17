'use strict';
// Gmail is the only permitted sender for institutional IDPS correspondence.
// Gmail users/me/messages/send automatically stores the email in the connected
// Gmail mailbox's Sent folder. Accepted != received or read.
const crypto=require('node:crypto');
const clean=v=>String(v??'').trim();
const isEmail=v=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)&&v.length<=254;
const safeHeader=v=>String(v).replace(/[\r\n]/g,' ').trim();
const encodeSubject=v=>'=?UTF-8?B?'+Buffer.from(v,'utf8').toString('base64')+'?=';
const escape=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function createMailer({pool,env=process.env,http=fetch}={}){
  const configured=()=>Boolean(pool&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
  async function init(){
    if(!pool)return;
    await pool.query('CREATE TABLE IF NOT EXISTS idps_email_delivery ('+
      'id uuid PRIMARY KEY,category text NOT NULL,recipient text NOT NULL,'+
      'subject text NOT NULL,related_id text,provider text NOT NULL DEFAULT \'gmail\','+
      'provider_message_id text,status text NOT NULL CHECK(status IN (\'accepted\',\'failed\')),'+
      'created_at timestamptz NOT NULL DEFAULT now())');
  }
  async function history(limit=50){
    if(!pool)return [];
    const r=await pool.query('SELECT id,category,recipient,subject,related_id,provider,'+
      'provider_message_id,status,created_at FROM idps_email_delivery ORDER BY created_at DESC LIMIT $1',
      [Math.max(1,Math.min(100,Number(limit)||50))]);
    return r.rows;
  }
  async function refreshToken(){
    if(!configured())return null;
    const r=await pool.query("SELECT value FROM idps_settings WHERE key='gmail_refresh_token'");
    return r.rows[0]?.value||null;
  }
  async function oauthAccess(refresh){
    const response=await http('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,
        client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:'refresh_token'}),
      signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('El acceso Gmail expiró. Vuelve a conectar Gmail desde el panel.');
    const data=await response.json();
    if(!data.access_token)throw Error('Google no entregó acceso Gmail.');
    return data.access_token;
  }
  async function status(){
    if(!configured())return {connected:false,reason:'OAuth Gmail no configurado'};
    try{
      const refresh=await refreshToken();
      if(!refresh)return {connected:false,reason:'Gmail aún no conectado'};
      await oauthAccess(refresh);
      return {connected:true,reason:null};
    }catch(e){return {connected:false,reason:'Es necesario volver a autorizar Gmail'};}
  }
  async function available(){
    // Avoid claiming that merely having a stale token means the mailer works.
    return (await status()).connected;
  }
  async function record({category,recipient,subject,relatedId,status,messageId}){
    if(!pool)return;
    try{
      await pool.query('INSERT INTO idps_email_delivery ('+
        'id,category,recipient,subject,related_id,provider,status,provider_message_id) '+
        "VALUES($1,$2,$3,$4,$5,'gmail',$6,$7)",
        [crypto.randomUUID(),category,recipient,subject,relatedId||null,status,messageId||null]);
    }catch(e){console.error('IDPS email audit could not be saved:',e.message);}
  }
  async function send({to,subject,html,category='general',relatedId=null}){
    if(!isEmail(clean(to))||!safeHeader(subject)||typeof html!=='string'||
       !/^[a-z_-]{2,40}$/.test(category))throw Error('Invalid IDPS mail arguments');
    const recipient=clean(to);
    try{
      const refresh=await refreshToken();
      if(!refresh)throw Error('Gmail no está conectado. Reconéctalo desde Superadministrador.');
      const token=await oauthAccess(refresh);
      const raw=Buffer.from('To: '+safeHeader(recipient)+
        '\r\nSubject: '+encodeSubject(safeHeader(subject))+
        '\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n'+html,
        'utf8').toString('base64url');
      const r=await http('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({raw}),signal:AbortSignal.timeout(12000)});
      if(!r.ok)throw Error('Gmail rechazó el envío. Comprueba los permisos de la cuenta.');
      const result=await r.json();
      if(!result.id)throw Error('Gmail no confirmó un identificador de mensaje.');
      await record({category,recipient,subject,relatedId,status:'accepted',messageId:result.id});
      return {sent:true,via:'gmail',providerMessageId:result.id};
    }catch(e){
      await record({category,recipient,subject,relatedId,status:'failed'});
      // Never log email bodies, passwords, PINs, OAuth tokens or recovery URLs.
      throw e;
    }
  }
  return {send,available,status,history,init,escape};
}
module.exports=createMailer;
