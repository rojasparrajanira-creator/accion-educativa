'use strict';
// Centralized mail delivery for IDPS. First try the Gmail account explicitly
// connected by the administrator, otherwise use a verified Resend sender.
const crypto=require('node:crypto');
const DEFAULT_ADMIN='accioneducativaspa@gmail.com';

const clean=v=>String(v??'').trim();
const isEmail=v=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)&&v.length<=254;
const encodeSubject=v=>'=?UTF-8?B?'+Buffer.from(v,'utf8').toString('base64')+'?=';
const safeHeader=v=>String(v).replace(/[\r\n]/g,' ').trim();
const escape=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function createMailer({pool,env=process.env,http=fetch}={}){
  const gmailConfigured=()=>Boolean(pool&&env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
  const resendConfigured=()=>Boolean(env.RESEND_API_KEY&&env.RESEND_FROM);
  async function gmailRefreshToken(){
    if(!gmailConfigured())return null;
    const r=await pool.query("SELECT value FROM idps_settings WHERE key='gmail_refresh_token'");
    return r.rows[0]?.value||null;
  }
  async function available(){
    if(resendConfigured())return true;
    try{return Boolean(await gmailRefreshToken());}catch{return false;}
  }
  async function viaGmail(to,subject,html,refreshToken){
    const tokenResponse=await http('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,
        refresh_token:refreshToken,grant_type:'refresh_token'}),
      signal:AbortSignal.timeout(12000)
    });
    if(!tokenResponse.ok)throw Error('Gmail OAuth token refresh failed');
    const token=await tokenResponse.json();
    if(!token.access_token)throw Error('Gmail OAuth returned no access token');
    // Gmail itself controls the verified From account. Never forge sender headers.
    const email='To: '+safeHeader(to)+'\r\nSubject: '+encodeSubject(safeHeader(subject))+
      '\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n'+html;
    const raw=Buffer.from(email,'utf8').toString('base64url');
    const response=await http('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
      method:'POST',headers:{Authorization:'Bearer '+token.access_token,
        'Content-Type':'application/json'},
      body:JSON.stringify({raw}),signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error('Gmail API rejected message');
  }
  async function viaResend(to,subject,html){
    if(!resendConfigured())throw Error('Verified sender missing');
    const response=await http('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.RESEND_FROM,to:[to],subject,html}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error('Resend API rejected message');
  }
  async function send({to,subject,html}){
    if(!isEmail(clean(to))||!subject||typeof html!=='string')throw Error('Invalid mail arguments');
    let lastError;
    try{
      const refresh=await gmailRefreshToken();
      if(refresh){
        try{await viaGmail(to,subject,html,refresh);return {sent:true,via:'gmail'};}
        catch(e){lastError=e;}
      }
    }catch(e){lastError=e;}
    if(resendConfigured()){
      try{await viaResend(to,subject,html);return {sent:true,via:'resend'};}
      catch(e){lastError=e;}
    }
    // Never log OAuth tokens, API keys, full provider payloads or personal data.
    throw Error('No hay un canal de correo operativo'+(lastError?' (comprobación fallida)':''));
  }
  return {send,available,escape};
}
module.exports=createMailer;
