'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createStoreServiceAccountDriveAccess,configuredAccount}=require('./store-drive-service-account');
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const saEmail='material-store-test@test-project.iam.gserviceaccount.com';
const env={MEC_STORE_DRIVE_SERVICE_ACCOUNT_JSON:JSON.stringify({
 type:'service_account',client_email:saEmail,
 private_key:privateKey.export({type:'pkcs8',format:'pem'}),
 token_uri:'https://oauth2.googleapis.com/token'
})};
const folderId='1abcdefghijklmnOpqrstUVWxyz0123456';
const item={delivery_url_snapshot:'https://drive.google.com/drive/folders/'+folderId+'?usp=sharing'};
function mock(permissions=[{id:'owner',type:'user',role:'owner',emailAddress:'owner@example.org'},
 {id:'sa',type:'user',role:'writer',emailAddress:saEmail}],shareable=true){
 const calls=[];
 const fetchFn=async(url,init)=>{
  calls.push({url:String(url),method:init.method||'GET',headers:init.headers,body:init.body});
  if(String(url)==='https://oauth2.googleapis.com/token'){
   const form=new URLSearchParams(init.body),parts=String(form.get('assertion')).split('.');
   const [h,p,sig]=parts;
   assert.equal(JSON.parse(Buffer.from(p,'base64url').toString('utf8')).scope,'https://www.googleapis.com/auth/drive');
   assert.ok(crypto.verify('RSA-SHA256',Buffer.from(h+'.'+p),crypto.createPublicKey(privateKey),Buffer.from(sig,'base64url')));
   return {ok:true,json:async()=>({access_token:'test-sa-token',expires_in:3600})};
  }
  if(String(url).includes('/permissions?')&&(init.method||'GET')==='GET')return {ok:true,json:async()=>({permissions})};
  if(String(url).includes('/permissions?')&&(init.method||'GET')==='POST')
   return {ok:true,json:async()=>({id:'added',type:'user',role:'reader',emailAddress:'buyer@example.org'})};
  if(String(url).includes('/files/')&&(init.method||'GET')==='GET')
   return {ok:true,json:async()=>({id:folderId,mimeType:'application/vnd.google-apps.folder',capabilities:{canShare:shareable}})};
  throw Error('unexpected '+url);
 };
 return {calls,access:createStoreServiceAccountDriveAccess({env,fetchFn})};
}
test('service-account automation remains disabled until explicitly configured',()=>{
 assert.equal(createStoreServiceAccountDriveAccess({env:{},fetchFn:async()=>{}}).enabled,false);
 assert.equal(configuredAccount({MEC_STORE_DRIVE_SERVICE_ACCOUNT_JSON:'not-json'}).configured,false);
});
test('only the purchased folder gets buyer reader access, not public link access',async()=>{
 const {calls,access}=mock();
 const result=await access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item]});
 assert.deepEqual(result,{authorized:true,folders:1});
 const grant=calls.find(x=>x.method==='POST'&&x.url.includes('/permissions?'));
 assert.ok(grant);
 assert.deepEqual(JSON.parse(grant.body),{type:'user',role:'reader',emailAddress:'buyer@example.org'});
 assert.match(grant.url,/sendNotificationEmail=false/);
 assert.equal(calls.filter(x=>x.url.includes('oauth2.googleapis.com/token')).length,1);
});
test('already-authorized buyer does not create duplicate permission',async()=>{
 const {calls,access}=mock([{id:'owner',type:'user',role:'owner',emailAddress:'owner@example.org'},
 {id:'buyer',type:'user',role:'reader',emailAddress:'buyer@example.org'}]);
 await access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item,item]});
 assert.equal(calls.filter(x=>x.method==='POST'&&x.url.includes('/permissions?')).length,0);
});
test('publicly shared folders fail closed',async()=>{
 const {access,calls}=mock([{id:'public',type:'anyone',role:'reader'}]);
 await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item]}),/drive_folder_not_restricted/);
 assert.equal(calls.filter(x=>x.method==='POST'&&x.url.includes('/permissions?')).length,0);
});
test('service account without permission to share the folder fails closed',async()=>{
 const {access}=mock([],false);
 await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item]}),/drive_service_account_cannot_share_folder/);
});
test('service account does not authorize unknown external URLs or invalid buyer emails',async()=>{
 const {access}=mock();
 await assert.rejects(access.authorizeBuyer({buyerEmail:'invalid',items:[item]}),/drive_invalid_buyer_email/);
 await assert.rejects(access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[{delivery_url_snapshot:'https://evil.test/drive/folders/'+folderId}]}),/drive_private_product_invalid/);
});
test('service-account token is refreshed only as needed',async()=>{
 const {access,calls}=mock();
 await access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item]});
 await access.authorizeBuyer({buyerEmail:'buyer@example.org',items:[item]});
 assert.equal(calls.filter(x=>x.url==='https://oauth2.googleapis.com/token').length,1);
});

test('checkout preflight reads all private folders but never grants access before payment',async()=>{
 const {access,calls}=mock();
 const result=await access.validateProducts({items:[item,item]});
 assert.deepEqual(result,{ready:true,folders:1});
 assert.equal(calls.filter(x=>x.method==='POST'&&x.url.includes('/permissions?')).length,0);
});
test('checkout preflight stops when technical account is not a folder editor',async()=>{
 const {access,calls}=mock([{id:'owner',type:'user',role:'owner',emailAddress:'owner@example.org'}]);
 await assert.rejects(access.validateProducts({items:[item]}),/drive_service_account_not_folder_editor/);
 assert.equal(calls.filter(x=>x.method==='POST'&&x.url.includes('/permissions?')).length,0);
});
test('checkout preflight stops when Google cannot share the folder',async()=>{
 const {access}=mock([],false);
 await assert.rejects(access.validateProducts({items:[item]}),/drive_service_account_cannot_share_folder/);
});
test('checkout preflight refuses public delivery folders and external links',async()=>{
 const {access}=mock([{id:'public',type:'anyone',role:'reader'},
 {id:'sa',type:'user',role:'writer',emailAddress:saEmail}]);
 await assert.rejects(access.validateProducts({items:[item]}),/drive_folder_not_restricted/);
 await assert.rejects(access.validateProducts({items:[{delivery_url_snapshot:'https://example.com/123'}]}),/drive_private_product_invalid/);
});
test('checkout preflight cannot be performed with an unconfigured service account',async()=>{
 const access=createStoreServiceAccountDriveAccess({env:{},fetchFn:async()=>{throw Error('should not make network calls')}});
 await assert.rejects(access.validateProducts({items:[item]}),/drive_service_account_not_configured/);
});
