'use strict';
const crypto=require('crypto');
const PLANS=Object.freeze({'300':{code:'300',student_limit:300,price_clp:12990},'500':{code:'500',student_limit:500,price_clp:22990},'2000':{code:'2000',student_limit:2000,price_clp:35990}});
const PERIOD_MS=30*24*60*60*1000;
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function cipher(key){
 const raw=String(key||'');
 const k=raw?crypto.createHash('sha256').update(raw).digest():null;
 return {ready:!!k,encrypt(text){if(!k)throw Error('subscription_encryption_not_configured');const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',k,iv),data=Buffer.concat([c.update(String(text),'utf8'),c.final()]);return [iv,c.getAuthTag(),data].map(x=>x.toString('base64url')).join('.')},decrypt(text){if(!k)throw Error('subscription_encryption_not_configured');const [iv,tag,data]=String(text).split('.').map(x=>Buffer.from(x,'base64url'));const c=crypto.createDecipheriv('aes-256-gcm',k,iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString('utf8')}};
}
function authorized(result,payment,commerceCode){
 const d=Array.isArray(result?.details)?result.details:[];
 return result?.buy_order===payment.buy_order&&d.length===1&&d[0].buy_order===payment.buy_order&&String(d[0].commerce_code)===String(commerceCode)&&d[0].status==='AUTHORIZED'&&Number(d[0].response_code)===0&&Number(d[0].amount)===Number(payment.amount_clp);
}
function active(subscription,now=new Date()){return !subscription||!!(subscription.activated_at&&subscription.access_until&&new Date(subscription.access_until)>now)}
function temporaryExpired(user,now=new Date()){return !!(user.must_change_password&&user.temporary_password_expires_at&&new Date(user.temporary_password_expires_at)<=now)}
function nextPeriod(start){return new Date(new Date(start).getTime()+PERIOD_MS)}
module.exports={PLANS,PERIOD_MS,hash,cipher,authorized,active,temporaryExpired,nextPeriod};
