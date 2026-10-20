'use strict';
// Reparación controlada de permisos faltantes de la cuenta técnica de la tienda.
// Sólo carpetas de productos validados en diagnóstico del 2026-10-20.
// Nunca hace públicas las carpetas ni otorga permisos a compradores.
const {driveItemId}=require('./store-drive-access');
const TARGET_IDS=[36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52];
const FOLDER='application/vnd.google-apps.folder';
const safe=e=>String(e?.message||'unknown').replace(/[^a-z0-9_]/gi,'_').slice(0,80);
async function runFolderPermissionRepair({pool,decryptGoogleToken,serviceAccount}){
  const targetEmail=serviceAccount.configuration().service_account_email;
  const clientId=String(process.env.MEC_GOOGLE_OAUTH_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.MEC_GOOGLE_OAUTH_CLIENT_SECRET||'').trim();
  if(!serviceAccount.enabled||!targetEmail||!clientId||!clientSecret){
    console.log('MEC_FOLDER_REPAIR NOT_READY');
    return;
  }
  const products=await pool.query(
    "select id,title,drive_delivery_url,drive_account_id from store_products where status='published' and id=any($1::bigint[]) order by id",
    [TARGET_IDS]
  );
  const owners=await pool.query(
    "select id,google_email,status,oauth_refresh_token_encrypted from store_drive_accounts where id=any($1::bigint[])",
    [[...new Set(products.rows.map(p=>Number(p.drive_account_id)).filter(Boolean))]]
  );
  const accounts=new Map(owners.rows.map(a=>[Number(a.id),a]));
  const tokens=new Map();
  async function request(url,init){
    const res=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error('google_'+res.status);
    return await res.json();
  }
  async function tokenFor(account){
    if(tokens.has(Number(account.id)))return tokens.get(Number(account.id));
    if(account.status!=='connected'||!account.oauth_refresh_token_encrypted)throw Error('owner_oauth_not_connected');
    let refresh;
    try{refresh=decryptGoogleToken(account.oauth_refresh_token_encrypted)}
    catch(_){throw Error('owner_token_decryption_failed')}
    const d=await request('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'})
    });
    if(!d.access_token)throw Error('owner_oauth_missing_token');
    tokens.set(Number(account.id),d.access_token);
    return d.access_token;
  }
  let repaired=0,already=0,skipped=0;
  for(const p of products.rows){
    const productId=Number(p.id),folderId=driveItemId(p.drive_delivery_url),account=accounts.get(Number(p.drive_account_id));
    if(!folderId||!account){skipped++;console.log('MEC_FOLDER_REPAIR SKIP '+JSON.stringify({productId,reason:'folder_or_owner_missing'}));continue}
    try{
      // Antes de conceder permisos, comprobar si la cuenta técnica ya puede entregar.
      try{await serviceAccount.validateProducts({items:[{delivery_url_snapshot:p.drive_delivery_url}]});already++;continue}
      catch(e){if(safe(e)!=='drive_file_404')throw Error('unexpected_preflight_'+safe(e))}
      const token=await tokenFor(account);
      const base='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(folderId);
      const headers={Authorization:'Bearer '+token};
      const file=await request(base+'?fields=id,mimeType,capabilities(canShare)&supportsAllDrives=true',{headers});
      if(file.id!==folderId||file.mimeType!==FOLDER||file.capabilities?.canShare!==true)throw Error('owner_cannot_manage_folder');
      let next='',permissions=[];
      for(let page=0;page<20;page++){
        const qs=new URLSearchParams({fields:'nextPageToken,permissions(id,type,role,emailAddress)',pageSize:'100',supportsAllDrives:'true'});
        if(next)qs.set('pageToken',next);
        const result=await request(base+'/permissions?'+qs,{headers});
        permissions.push(...(result.permissions||[]));
        next=String(result.nextPageToken||'');
        if(!next)break;
        if(page===19)throw Error('permissions_exceed_limit');
      }
      if(permissions.some(x=>['anyone','domain','group'].includes(x.type)))throw Error('folder_broad_sharing_detected');
      const existing=permissions.find(x=>x.type==='user'&&String(x.emailAddress||'').toLowerCase()===targetEmail.toLowerCase());
      if(existing&&['writer','owner'].includes(existing.role))throw Error('account_has_write_but_preflight_failed');
      const params='?supportsAllDrives=true&fields=id,type,role,emailAddress';
      if(existing){
        await request(base+'/permissions/'+encodeURIComponent(existing.id)+params,{
          method:'PATCH',headers:{...headers,'Content-Type':'application/json'},
          body:JSON.stringify({role:'writer'})
        });
      }else{
        await request(base+'/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id,type,role,emailAddress',{
          method:'POST',headers:{...headers,'Content-Type':'application/json'},
          body:JSON.stringify({type:'user',role:'writer',emailAddress:targetEmail})
        });
      }
      await serviceAccount.validateProducts({items:[{delivery_url_snapshot:p.drive_delivery_url}]});
      repaired++;
      console.log('MEC_FOLDER_REPAIR OK '+JSON.stringify({productId,accountId:Number(account.id)}));
    }catch(e){
      skipped++;
      console.log('MEC_FOLDER_REPAIR SKIP '+JSON.stringify({productId,reason:safe(e),accountStatus:account.status}));
    }
  }
  console.log('MEC_FOLDER_REPAIR SUMMARY '+JSON.stringify({targeted:products.rows.length,repaired,already,skipped}));
}
module.exports={runFolderPermissionRepair};
