'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {driveItemId,createStoreDriveAccess}=require('./store-drive-access');

const FOLDER='1TAbcdefghijKLMNOpqrstuvXYZ1234';
const API_ENV={MEC_GOOGLE_OAUTH_CLIENT_ID:'test-client',MEC_GOOGLE_OAUTH_CLIENT_SECRET:'test-secret'};
const ITEM={product_title:'Taller de prueba',delivery_url_snapshot:'https://drive.google.com/drive/folders/'+FOLDER+'?usp=sharing',drive_account_id_snapshot:7};
function setup(permissions=[{id:'owner',type:'user',role:'owner',emailAddress:'owner@example.org'}],connected=true){
  const requests=[];
  const pool={async query(sql,vals){
    assert.match(sql,/store_drive_accounts/);
    assert.deepEqual(vals,[[7]]);
    return {rows:[{id:7,google_email:'owner@example.org',status:connected?'connected':'pending',oauth_refresh_token_encrypted:'ciphertext',oauth_scope:'https://www.googleapis.com/auth/drive.file'}]};
  }};
  async function fetchFn(url,options){
    requests.push({url:String(url),method:options.method,headers:options.headers,
      payload:options.body&&options.headers['Content-Type']==='application/json'?JSON.parse(options.body):null});
    if(String(url).includes('oauth2.googleapis.com/token'))return {ok:true,json:async()=>({access_token:'fake-access-token'})};
    if(String(url).includes('/permissions?')&&options.method==='GET')
      return {ok:true,json:async()=>({permissions})};
    if(String(url).includes('/permissions?')&&options.method==='POST')
      return {ok:true,json:async()=>({id:'new-share',type:'user',role:'reader'})};
    if(String(url).includes('/files/')&&options.method==='GET')
      return {ok:true,json:async()=>({id:FOLDER,capabilities:{canShare:true},mimeType:'application/vnd.google-apps.folder'})};
    throw Error('Unexpected URL: '+url);
  }
  return {requests,pool,fetchFn,access:createStoreDriveAccess({pool,fetchFn,decryptRefreshToken:x=>x,env:API_ENV})};
}
test('Drive ID parsing rejects external domains and accepts private folders',()=>{
  assert.equal(driveItemId('https://drive.google.com/drive/folders/'+FOLDER+'?usp=sharing'),FOLDER);
  assert.equal(driveItemId('https://drive.google.com.evil.test/drive/folders/'+FOLDER),'');
  assert.equal(driveItemId('http://drive.google.com/drive/folders/'+FOLDER),'');
  assert.equal(driveItemId('https://drive.google.com/drive/folders/../../test'),'');
});
test('after payment grant only individual buyer reader access, without Google notification',async()=>{
  const {access,requests}=setup();
  const result=await access.authorizeBuyer({buyerEmail:'Buyer@Example.org',items:[ITEM]});
  assert.equal(result.authorized,true);
  assert.equal(result.folders,1);
  const grant=requests.find(r=>r.method==='POST'&&r.url.includes('/permissions?'));
  assert.ok(grant);
  assert.deepEqual(grant.payload,{type:'user',role:'reader',emailAddress:'buyer@example.org'});
  assert.match(grant.url,/sendNotificationEmail=false/);
  assert.ok(!requests.some(r=>r.payload?.type==='anyone'));
});
test('existing buyer permissions avoid duplicate share',async()=>{
  const {access,requests}=setup([{id:'owner',type:'user',role:'owner',emailAddress:'owner@example.org'},{id:'buyer',type:'user',role:'reader',emailAddress:'buyer@example.org'}]);
  await access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[ITEM,ITEM]});
  assert.ok(!requests.some(r=>r.method==='POST'&&r.url.includes('/permissions?')));
});
test('folders shared with anyone are rejected as unsafe',async()=>{
  const {access,requests}=setup([{id:'public',type:'anyone',role:'reader'}]);
  await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[ITEM]}),/drive_folder_not_restricted/);
  assert.ok(!requests.some(r=>r.method==='POST'&&r.url.includes('/permissions?')));
});
test('inactive Drive account blocks link delivery',async()=>{
  const {access,requests}=setup([],false);
  await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[ITEM]}),/drive_account_not_connected/);
  assert.equal(requests.length,0);
});
test('missing folder rights block delivery rather than send unusable link',async()=>{
  const {pool}=setup();const access=createStoreDriveAccess({pool,env:API_ENV,decryptRefreshToken:x=>x,
    fetchFn:async(url,options)=>{
      if(String(url).includes('oauth2.googleapis.com/token'))return {ok:true,json:async()=>({access_token:'token'})};
      return {ok:false,status:404,json:async()=>({error:'notFound'})};
    }});
  await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[ITEM]}),/drive_file_404/);
});
test('only valid product drive IDs and account snapshot are accepted',async()=>{
  const {access}=setup();
  await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[{...ITEM,drive_account_id_snapshot:null}]}),/drive_private_product_invalid/);
  await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[{...ITEM,delivery_url_snapshot:'https://evil.example/file'}]}),/drive_private_product_invalid/);
});
