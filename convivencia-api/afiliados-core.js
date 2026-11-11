'use strict';
const MS_DAY=24*60*60*1000;
const REFERRAL_WINDOW_DAYS=30;
function normalizedSellerCode(code) {
  const value=String(code||'').trim().toUpperCase();
  return /^[A-Z0-9_-]{4,24}$/.test(value)?value:null;
}
function validAttribution({seenAt,now=new Date(),days=REFERRAL_WINDOW_DAYS}={}) {
  const seen=new Date(seenAt),current=new Date(now);
  if(!Number.isFinite(seen.getTime())||!Number.isFinite(current.getTime()))return false;
  const delta=current.getTime()-seen.getTime();
  return delta>=0&&delta<=days*MS_DAY;
}
function commissionCLP(saleAmount,rateBps=1000){
  if(!Number.isSafeInteger(saleAmount)||saleAmount<0||!Number.isInteger(rateBps)||rateBps<0||rateBps>10000)
    throw Error('invalid_commission_input');
  return Math.round(saleAmount*rateBps/10000);
}
function pickLastEligibleReferral(referrals,now=new Date()){
  if(!Array.isArray(referrals))return null;
  return referrals.filter(x=>normalizedSellerCode(x.code)&&validAttribution({seenAt:x.seenAt,now}))
    .sort((a,b)=>new Date(b.seenAt).getTime()-new Date(a.seenAt).getTime())[0]||null;
}
// Transacción atómica y repetible. Solo admite pedidos ya marcados paid por la confirmación verificada.
async function recordPaidOrderCommissions(client,orderId){
  if(!Number.isSafeInteger(Number(orderId))||Number(orderId)<1)throw Error('invalid_order_id');
  const order=await client.query('select id,status,total_clp from store_orders where id=$1 for update',[orderId]);
  if(!order.rowCount||order.rows[0].status!=='paid')return {recorded:0,reason:'not_paid'};
  const a=await client.query(
    'select a.seller_id,a.commission_bps_snapshot from store_affiliate_attributions a join store_affiliate_sellers s on s.id=a.seller_id where a.order_id=$1',
    [orderId]
  );
  if(!a.rowCount)return {recorded:0,reason:'not_attributed'};
  const {seller_id,commission_bps_snapshot}=a.rows[0];
  const items=await client.query('select id,product_title,unit_price_clp,quantity from store_order_items where order_id=$1',[orderId]);
  let recorded=0;
  for(const item of items.rows){
    const amount=Number(item.unit_price_clp)*Number(item.quantity);
    if(!Number.isSafeInteger(amount)||amount<0)throw Error('invalid_item_amount');
    const value=commissionCLP(amount,Number(commission_bps_snapshot));
    const result=await client.query(
      `insert into store_affiliate_commissions(order_id,order_item_id,seller_id,item_title,sale_amount_clp,rate_bps,commission_clp)
       values($1,$2,$3,$4,$5,$6,$7) on conflict(order_item_id) do nothing returning id`,
      [orderId,item.id,seller_id,item.product_title,amount,commission_bps_snapshot,value]
    );
    recorded+=result.rowCount;
  }
  return {recorded};
}
module.exports={REFERRAL_WINDOW_DAYS,normalizedSellerCode,validAttribution,commissionCLP,pickLastEligibleReferral,recordPaidOrderCommissions};
