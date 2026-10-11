'use strict';
// Entrega privada: autoriza el correo del comprador tras pago Webpay confirmado.
// Los enlaces se mantienen restringidos. Nunca se usa "anyone with the link".
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function driveItemId(value){
  let u;
  try{u=new URL(String(value||'').trim())}catch{return ''}
  if(u.protocol!=='https:'||u.hostname!=='drive.google.com')return '';
  const m=u.pathname.match(/^\/(?:drive\/folders|file\/d)\/([a-zA-Z0-9_-]{10,})(?:\/(?:view)?)?\/?$/);
  if(m)return m[1];
  if(u.pathname==='/open'&&/^[a-zA-Z0-9_-]{10,}$/.test(u.searchParams.get('id')||''))return u.searchParams.get('id');
  return '';
}
function googleError(stage,status){
  const safeStage=String(stage).replace(/[^a-z_]/g,'');
  return Error('drive_'+safeStage+'_'+(Number(status)||0));
}
function createStoreDriveAccess({pool,decryptRefreshToken,fetchFn=fetch,env=process.env}){
  async function jsonRequest(url,options,stage){
    const response=await fetchFn(url,{...options,signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      // Only the Google API error code/reason is retained. Never log URLs, tokens, mailboxes or payloads.
      const data=await response.json().catch(()=>null);
      const raw=String(data?.error?.errors?.[0]?.reason||data?.error?.status||'unknown');
      const reason=raw.replace(/[^a-zA-Z0-9_]/g,'').slice(0,64)||'unknown';
      const error=googleError(stage,response.status);
      error.googleReason=reason;
      throw error;
    }
    const json=await response.json().catch(()=>null);
    if(!json||typeof json!=='object')throw Error('drive_invalid_'+stage+'_response');
    return json;
  }
  async function getToken(account){
    const clientId=String(env.MEC_GOOGLE_OAUTH_CLIENT_ID||'').trim();
    const clientSecret=String(env.MEC_GOOGLE_OAUTH_CLIENT_SECRET||'').trim();
    if(!clientId||!clientSecret||!account.oauth_refresh_token_encrypted||typeof decryptRefreshToken!=='function')
      throw Error('drive_oauth_not_configured');
    const refreshToken=decryptRefreshToken(account.oauth_refresh_token_encrypted);
    const response=await jsonRequest('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})
    },'token');
    if(!response.access_token)throw Error('drive_access_token_missing');
    return response.access_token;
  }
  async function permissionsFor(id,token){
    let pageToken='',permissions=[];
    for(let page=0;page<20;page++){
      const q=new URLSearchParams({fields:'nextPageToken,permissions(id,type,role,emailAddress)',pageSize:'100',supportsAllDrives:'true'});
      if(pageToken)q.set('pageToken',pageToken);
      const info=await jsonRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'/permissions?'+q,{
        method:'GET',headers:{Authorization:'Bearer '+token}
      },'permissions');
      if(!Array.isArray(info.permissions))throw Error('drive_permissions_unavailable');
      permissions.push(...info.permissions);
      pageToken=String(info.nextPageToken||'');
      if(!pageToken)return permissions;
    }
    throw Error('drive_permission_pages_exceeded');
  }
  async function authorizeBuyer({buyerEmail,items}){
    const buyer=String(buyerEmail||'').trim().toLowerCase();
    if(!EMAIL_RE.test(buyer))throw Error('drive_invalid_buyer_email');
    if(!Array.isArray(items)||!items.length)throw Error('drive_items_missing');
    const requested=items.map(item=>({
      id:driveItemId(item.delivery_url_snapshot),
      accountId:Number(item.drive_account_id_snapshot)
    }));
    if(requested.some(item=>!item.id||!Number.isSafeInteger(item.accountId)||item.accountId<1))
      throw Error('drive_private_product_invalid');
    const accountIds=[...new Set(requested.map(item=>item.accountId))];
    const q=await pool.query(
      "select id,google_email,status,oauth_refresh_token_encrypted,oauth_scope from store_drive_accounts where id=any($1::bigint[])",
      [accountIds]
    );
    const accounts=new Map(q.rows.map(x=>[Number(x.id),x]));
    const tokens=new Map(),done=new Set();
    for(const item of requested){
      const pair=item.accountId+':'+item.id;
      if(done.has(pair))continue;
      const account=accounts.get(item.accountId);
      if(!account||account.status!=='connected'||!account.oauth_refresh_token_encrypted)
        throw Error('drive_account_not_connected');
      if(!tokens.has(item.accountId))tokens.set(item.accountId,await getToken(account));
      const token=tokens.get(item.accountId);
      const headers={Authorization:'Bearer '+token};
      // The app must have been granted access to each private folder (e.g. Google Picker).
      const file=await jsonRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
        '?fields=id,mimeType,capabilities(canShare)&supportsAllDrives=true',{method:'GET',headers},'file');
      if(file.id!==item.id||file.capabilities?.canShare!==true)throw Error('drive_folder_not_authorized_for_app');
      const permissions=await permissionsFor(item.id,token);
      // A public, group or domain permission could bypass purchase-based access.
      if(permissions.some(p=>['anyone','domain','group'].includes(p.type)))
        throw Error('drive_folder_not_restricted');
      const existing=permissions.find(p=>p.type==='user'&&String(p.emailAddress||'').toLowerCase()===buyer);
      if(!existing&&String(account.google_email||'').toLowerCase()!==buyer){
        const payload={type:'user',role:'reader',emailAddress:buyer};
        const create=await jsonRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(item.id)+
          '/permissions?sendNotificationEmail=false&supportsAllDrives=true',{
          method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)
        },'grant');
        if(create.type!=='user'||create.role!=='reader'||!create.id)throw Error('drive_grant_not_confirmed');
      }
      done.add(pair);
    }
    return {authorized:true,folders:done.size};
  }
  return {authorizeBuyer};
}
module.exports={driveItemId,createStoreDriveAccess};