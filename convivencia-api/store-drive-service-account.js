'use strict';
// Service-account automation for buyer-specific access. Activated ONLY when configured in Render.
// The account has access only to folders owners explicitly share with its technical address.
// Existing personal Google OAuth accounts and Google Picker remain unchanged.
const crypto=require('node:crypto');
const {driveItemId}=require('./store-drive-access');

const AUTH_URL='https://oauth2.googleapis.com/token';
const DRIVE_API='https://www.googleapis.com/drive/v3/files/';
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FOLDER_TYPE='application/vnd.google-apps.folder';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive';
function configuredAccount(env){
  const raw=String(env.MEC_STORE_DRIVE_SERVICE_ACCOUNT_JSON||'').trim();
  if(!raw)return {configured:false,email:''};
  try{
    const key=JSON.parse(raw);
    const email=String(key.client_email||'').trim().toLowerCase();
    if(key.type!=='service_account'||!email.endsWith('.gserviceaccount.com')||
      !EMAIL_RE.test(email)||typeof key.private_key!=='string'||
      !key.private_key.includes('-----BEGIN PRIVATE KEY-----')||
      (key.token_uri&&key.token_uri!==AUTH_URL))return {configured:false,email:''};
    return {configured:true,email,key};
  }catch{return {configured:false,email:''}}
}
function googleError(stage,status,reason=''){
  const error=new Error('drive_'+stage.replace(/[^a-z]/g,'')+'_'+(Number(status)||0));
  error.googleReason=String(reason||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,50);
  return error;
}
function createStoreServiceAccountDriveAccess({env=process.env,fetchFn=fetch,now=()=>Date.now(),pool}={}){
  const conf=configuredAccount(env);
  let cachedToken='',expiresAt=0;
  async function request(url,opts,stage){
    const response=await fetchFn(url,{...opts,signal:AbortSignal.timeout(15000)});
    if(!response.ok){
      const errorBody=await response.json().catch(()=>({}));
      throw googleError(stage,response.status,errorBody?.error?.errors?.[0]?.reason||errorBody?.error?.status);
    }
    const body=await response.json().catch(()=>null);
    if(!body||typeof body!=='object')throw new Error('drive_invalid_'+stage+'_response');
    return body;
  }
  async function accessToken(){
    if(!conf.configured)throw new Error('drive_service_account_not_configured');
    if(cachedToken&&expiresAt>now()+60000)return cachedToken;
    const time=Math.floor(now()/1000);
    const encoded=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned=encoded({alg:'RS256',typ:'JWT'})+'.'+encoded({
      iss:conf.email,scope:DRIVE_SCOPE,aud:AUTH_URL,iat:time,exp:time+3500
    });
    const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),conf.key.private_key).toString('base64url');
    const info=await request(AUTH_URL,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature})
    },'serviceaccounttoken');
    if(!info.access_token)throw Error('drive_service_account_token_missing');
    cachedToken=String(info.access_token);
    expiresAt=now()+Math.min(Math.max(Number(info.expires_in)||3600,120),3600)*1000;
    return cachedToken;
  }
  async function listPermissions(folderId,token){
    let cursor='',list=[];
    for(let page=0;page<20;page++){
      const params=new URLSearchParams({fields:'nextPageToken,permissions(id,type,role,emailAddress,view)',pageSize:'100',supportsAllDrives:'true'});
      if(cursor)params.set('pageToken',cursor);
      const r=await request(DRIVE_API+encodeURIComponent(folderId)+'/permissions?'+params,{
        method:'GET',headers:{Authorization:'Bearer '+token}
      },'permissions');
      if(!Array.isArray(r.permissions))throw Error('drive_permissions_unavailable');
      list.push(...r.permissions);
      cursor=String(r.nextPageToken||'');
      if(!cursor)return list;
    }
    throw Error('drive_permission_pages_exceeded');
  }

  // Solo descendientes de la carpeta del producto comprado; nunca otras carpetas de Drive.
  // En Drive una subcarpeta con acceso limitado NO hereda el permiso del padre.
  async function limitedSubfolders(rootId,token){
    const pending=[{id:rootId,depth:0,canListChildren:true}],seen=new Set([rootId]),limited=[];
    for(let at=0;at<pending.length;at++){
      const folder=pending[at];
      if(folder.canListChildren===false)throw Error('drive_subfolder_not_readable');
      let cursor='';
      for(let page=0;page<15;page++){
        const params=new URLSearchParams({
          q:"'"+folder.id+"' in parents and mimeType = '"+FOLDER_TYPE+"' and trashed = false",
          fields:'nextPageToken,files(id,mimeType,inheritedPermissionsDisabled,capabilities(canShare,canListChildren))',
          pageSize:'100',supportsAllDrives:'true',includeItemsFromAllDrives:'true'
        });
        if(cursor)params.set('pageToken',cursor);
        const response=await request('https://www.googleapis.com/drive/v3/files?'+params,{
          method:'GET',headers:{Authorization:'Bearer '+token}
        },'children');
        if(!Array.isArray(response.files))throw Error('drive_subfolders_unavailable');
        for(const child of response.files){
          if(child.mimeType!==FOLDER_TYPE||!/^[a-zA-Z0-9_-]{10,}$/.test(String(child.id||'')))
            throw Error('drive_subfolder_invalid');
          if(seen.has(child.id))continue;
          if(seen.size>=250||folder.depth>=12)throw Error('drive_folder_tree_limit');
          seen.add(child.id);
          if(child.inheritedPermissionsDisabled===true){
            if(child.capabilities?.canShare!==true)throw Error('drive_subfolder_not_shareable');
            limited.push(child.id);
          }
          pending.push({id:child.id,depth:folder.depth+1,
            canListChildren:child.capabilities?.canListChildren});
        }
        cursor=String(response.nextPageToken||'');
        if(!cursor)break;
        if(page===14)throw Error('drive_folder_tree_limit');
      }
    }
    return limited;
  }
  function buyerCanOpen(permission,email){
    return permission.type==='user'&&
      String(permission.emailAddress||'').trim().toLowerCase()===email&&
      permission.view!=='metadata'&&
      ['reader','commenter','writer','owner','organizer','fileOrganizer'].includes(permission.role);
  }
  async function grantReader(folderId,email,token){
    const created=await request(DRIVE_API+encodeURIComponent(folderId)+
      '/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id,type,role,emailAddress',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({type:'user',role:'reader',emailAddress:email})
    },'grant');
    if(!created.id||created.type!=='user'||created.role!=='reader'||
      (created.emailAddress&&String(created.emailAddress).toLowerCase()!==email))
      throw Error('drive_grant_not_confirmed');
  }
  // Preflight before opening Webpay: the app must be able to share EVERY purchased private folder.
  // No buyer permission is created here; unpaid visitors cannot access the materials.
  async function validateProducts({items}={}){
    if(!conf.configured)throw Error('drive_service_account_not_configured');
    if(!Array.isArray(items)||!items.length)throw Error('drive_items_missing');
    const ids=items.map(item=>driveItemId(item.delivery_url_snapshot));
    if(ids.some(id=>!id))throw Error('drive_private_product_invalid');
    const token=await accessToken();
    for(const id of new Set(ids)){
      const headers={Authorization:'Bearer '+token};
      const file=await request(DRIVE_API+encodeURIComponent(id)+
        '?fields=id,mimeType,capabilities(canShare)&supportsAllDrives=true',{
        method:'GET',headers
      },'file');
      if(file.id!==id||file.mimeType!==FOLDER_TYPE)throw Error('drive_invalid_delivery_folder');
      if(file.capabilities?.canShare!==true)throw Error('drive_service_account_cannot_share_folder');
      const permissions=await listPermissions(id,token);
      if(permissions.some(p=>['anyone','domain','group'].includes(p.type)))
        throw Error('drive_folder_not_restricted');
      const editor=permissions.some(p=>p.type==='user'&&
        String(p.emailAddress||'').trim().toLowerCase()===conf.email&&
        ['writer','owner'].includes(p.role));
      if(!editor)throw Error('drive_service_account_not_folder_editor');
      await limitedSubfolders(id,token); // Detecta subcarpetas que el comprador no heredaría.
    }
    return {ready:true,folders:new Set(ids).size};
  }
  async function authorizeBuyer({buyerEmail,items}){
    if(!conf.configured)throw Error('drive_service_account_not_configured');
    const email=String(buyerEmail||'').trim().toLowerCase();
    if(!EMAIL_RE.test(email))throw Error('drive_invalid_buyer_email');
    if(!Array.isArray(items)||!items.length)throw Error('drive_items_missing');
    const ids=items.map(item=>driveItemId(item.delivery_url_snapshot));
    if(ids.some(id=>!id))throw Error('drive_private_product_invalid');
    const token=await accessToken(),done=new Set();
    for(const id of ids){
      if(done.has(id))continue;
      const headers={Authorization:'Bearer '+token};
      const file=await request(DRIVE_API+encodeURIComponent(id)+
        '?fields=id,mimeType,capabilities(canShare)&supportsAllDrives=true',{
        method:'GET',headers
      },'file');
      if(file.id!==id||file.mimeType!==FOLDER_TYPE)throw Error('drive_invalid_delivery_folder');
      if(file.capabilities?.canShare!==true)throw Error('drive_service_account_cannot_share_folder');
      const permissions=await listPermissions(id,token);
      if(permissions.some(p=>['anyone','domain','group'].includes(p.type)))
        throw Error('drive_folder_not_restricted');
      // Comprobar antes TODAS las subcarpetas (sin conceder permisos fuera del producto).
      const limited=await limitedSubfolders(id,token);
      const explicit=new Map();
      for(const childId of limited){
        const subPermissions=await listPermissions(childId,token);
        if(subPermissions.some(p=>['anyone','domain','group'].includes(p.type)))
          throw Error('drive_folder_not_restricted');
        const existing=subPermissions.find(p=>p.type==='user'&&String(p.emailAddress||'').trim().toLowerCase()===email);
        if(existing?.view==='metadata')throw Error('drive_subfolder_metadata_only');
        explicit.set(childId,!!existing&&buyerCanOpen(existing,email));
      }
      const existing=permissions.find(p=>p.type==='user'&&String(p.emailAddress||'').trim().toLowerCase()===email);
      if(existing?.view==='metadata')throw Error('drive_folder_metadata_only');
      if(!existing||!buyerCanOpen(existing,email))await grantReader(id,email,token);
      // Permiso directo SOLO en subcarpetas con acceso limitado, cuando están dentro del producto comprado.
      for(const childId of limited){
        if(!explicit.get(childId))await grantReader(childId,email,token);
      }
      done.add(id);
    }
    return {authorized:true,folders:done.size};
  }
  return {enabled:conf.configured,validateProducts,configuration:()=>({
    configured:conf.configured,
    service_account_email:conf.email,
    model:'service_account_folder_editor',
    requires_per_folder_owner_share:true
  }),authorizeBuyer};
}
module.exports={configuredAccount,createStoreServiceAccountDriveAccess};
