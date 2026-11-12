'use strict';
// Módulo aislado. Se registra desde server.js solo en el entorno de desarrollo.
const crypto=require('crypto');
const {normalizedSellerCode,recordPaidOrderCommissions}=require('./afiliados-core');
const hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0;
function registerAffiliateApi({app,pool,requireRole,verifyPassword,makePassword,loginRateLimit}){
  const admin=requireRole('platform_admin');
  async function seller(req,res,next){
    try{
      const token=String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
      if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({ok:false,error:'seller_login_required'});
      const q=await pool.query(`select s.id,s.code,s.display_name,s.contact_email,s.city,s.country
        from store_affiliate_sessions x join store_affiliate_sellers s on s.id=x.seller_id
        where x.token_hash=$1 and x.expires_at>now() and s.active=true`,[hash(token)]);
      if(!q.rowCount)return res.status(401).json({ok:false,error:'seller_login_required'});
      req.seller=q.rows[0];next();
    }catch(e){res.status(503).json({ok:false,error:'seller_auth_unavailable'})}
  }
  app.post('/api/store/affiliates/login',loginRateLimit,async(req,res)=>{
    try{
      const email=String(req.body?.email||'').trim().toLowerCase();
      const pw=String(req.body?.password||'');
      if(!email||!pw)return res.status(400).json({ok:false,error:'credentials_required'});
      const q=await pool.query('select * from store_affiliate_sellers where lower(contact_email)=$1 and active=true',[email]);
      if(!q.rowCount||!q.rows[0].password_hash||!(await verifyPassword(pw,q.rows[0].password_salt,q.rows[0].password_hash)))
        return res.status(401).json({ok:false,error:'invalid_credentials'});
      const token=crypto.randomBytes(32).toString('hex');
      await pool.query('insert into store_affiliate_sessions(seller_id,token_hash,expires_at) values($1,$2,now()+interval \'8 hours\')',[q.rows[0].id,hash(token)]);
      res.json({ok:true,token,expires_in_seconds:28800,seller:{id:q.rows[0].id,code:q.rows[0].code,name:q.rows[0].display_name}});
    }catch(e){res.status(503).json({ok:false,error:'seller_login_unavailable'})}
  });
  app.post('/api/store/affiliates/logout',seller,async(req,res)=>{
    try{
      const token=String(req.get('authorization')).replace(/^Bearer\s+/i,'');
      await pool.query('delete from store_affiliate_sessions where token_hash=$1',[hash(token)]);
      res.json({ok:true});
    }catch(e){res.status(503).json({ok:false,error:'logout_failed'})}
  });
  app.get('/api/store/affiliates/me',seller,async(req,res)=>{
    try{
      const q=await pool.query(`select count(distinct a.order_id)::int as paid_orders,
        coalesce(sum(c.sale_amount_clp),0)::bigint as sales_clp,
        coalesce(sum(c.commission_clp) filter(where c.status='pending'),0)::bigint as pending_clp,
        coalesce(sum(c.commission_clp) filter(where c.status='paid'),0)::bigint as paid_clp
        from store_affiliate_commissions c join store_affiliate_attributions a on a.order_id=c.order_id
        where c.seller_id=$1 and c.status<>'reversed'`,[req.seller.id]);
      const p=await pool.query(`select id,period_start,period_end,total_clp,paid_at,transfer_reference
        from store_affiliate_payouts where seller_id=$1 order by period_end desc limit 48`,[req.seller.id]);
      res.json({ok:true,seller:req.seller,summary:q.rows[0],payouts:p.rows,referral_url:'https://www.materialeducativochile.cl/tienda.html?ref='+encodeURIComponent(req.seller.code)});
    }catch(e){res.status(503).json({ok:false,error:'seller_dashboard_unavailable'})}
  });
  // El vendedor puede descargar solamente sus propios comprobantes.
  app.get('/api/store/affiliates/payouts/:id/receipt',seller,async(req,res)=>{
    try{
      if(!validId(req.params.id))return res.sendStatus(400);
      const q=await pool.query(
        'select receipt_mime,receipt_data from store_affiliate_payouts where id=$1 and seller_id=$2 and paid_at is not null',
        [req.params.id,req.seller.id]
      );
      if(!q.rowCount||!q.rows[0].receipt_data)return res.sendStatus(404);
      const mime=q.rows[0].receipt_mime;
      if(!['application/pdf','image/png','image/jpeg'].includes(mime))return res.sendStatus(404);
      res.setHeader('Content-Type',mime);
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('Content-Disposition','attachment; filename="comprobante-'+req.params.id+'.'+(mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg')+'"');
      res.send(q.rows[0].receipt_data);
    }catch(e){res.sendStatus(503)}
  });
  app.get('/api/store/affiliates/me/monthly',seller,async(req,res)=>{
    try{
      const q=await pool.query(`select to_char(o.paid_at at time zone 'America/Santiago','YYYY-MM') as month,
        count(distinct o.id)::int paid_orders,
        coalesce(sum(c.sale_amount_clp),0)::bigint sales_clp,
        coalesce(sum(c.commission_clp) filter(where c.status<>'reversed'),0)::bigint eligible_commissions_clp
        from store_affiliate_commissions c join store_orders o on o.id=c.order_id
        where c.seller_id=$1 and o.status='paid' and o.paid_at is not null
        group by 1 order by 1 desc limit 24`,[req.seller.id]);
      res.json({ok:true,months:q.rows});
    }catch(e){res.status(503).json({ok:false,error:'seller_monthly_unavailable'})}
  });
  app.get('/api/store/affiliates/referral/:code',async(req,res)=>{
    try{
      const code=normalizedSellerCode(req.params.code);
      if(!code)return res.status(404).json({ok:false,error:'seller_not_found'});
      const q=await pool.query('select code,display_name from store_affiliate_sellers where code=$1 and active=true',[code]);
      if(!q.rowCount)return res.status(404).json({ok:false,error:'seller_not_found'});
      res.json({ok:true,code:q.rows[0].code});
    }catch(e){res.status(503).json({ok:false,error:'referral_unavailable'})}
  });
  app.get('/api/store/admin/affiliates',...admin,async(req,res)=>{
    try{
      const q=await pool.query(`select s.id,s.code,s.display_name,s.contact_email,s.city,s.country,s.active,s.created_at,
       coalesce(sum(c.sale_amount_clp) filter(where c.status<>'reversed'),0)::bigint as sales_clp,
       coalesce(sum(c.commission_clp) filter(where c.status='pending'),0)::bigint as pending_clp,
       coalesce(sum(c.commission_clp) filter(where c.status='paid'),0)::bigint as paid_clp
       from store_affiliate_sellers s left join store_affiliate_commissions c on c.seller_id=s.id
       group by s.id order by s.display_name`);
      res.json({ok:true,sellers:q.rows});
    }catch(e){res.status(503).json({ok:false,error:'affiliate_list_unavailable'})}
  });
  app.post('/api/store/admin/affiliates',...admin,async(req,res)=>{
    try{
      const b=req.body||{},code=normalizedSellerCode(b.code),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),city=String(b.city||'').trim(),country=String(b.country||'Chile').trim();
      const password=String(b.temporary_password||'');
      if(!code||name.length<3||name.length>160||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||city.length<2||city.length>100||country.length<2||country.length>100||password.length<12)
        return res.status(400).json({ok:false,error:'invalid_seller_data'});
      const credential=await makePassword(password);
      const q=await pool.query(`insert into store_affiliate_sellers(code,display_name,contact_email,city,country,password_hash,password_salt)
       values($1,$2,$3,$4,$5,$6,$7) returning id,code,display_name,contact_email,city,country,active`,
       [code,name,email,city,country,credential.hash,credential.salt]);
      res.status(201).json({ok:true,seller:q.rows[0]});
    }catch(e){res.status(e.code==='23505'?409:503).json({ok:false,error:e.code==='23505'?'seller_already_exists':'seller_create_failed'})}
  });
  app.post('/api/store/admin/affiliates/:id/status',...admin,async(req,res)=>{
    try{
      if(!validId(req.params.id)||typeof req.body?.active!=='boolean')return res.status(400).json({ok:false,error:'invalid_status'});
      const q=await pool.query('update store_affiliate_sellers set active=$1,updated_at=now() where id=$2 returning id,active',[req.body.active,req.params.id]);
      if(!q.rowCount)return res.status(404).json({ok:false,error:'seller_not_found'});
      if(!req.body.active)await pool.query('delete from store_affiliate_sessions where seller_id=$1',[req.params.id]);
      res.json({ok:true,seller:q.rows[0]});
    }catch(e){res.status(503).json({ok:false,error:'seller_status_failed'})}
  });
  app.post('/api/store/admin/affiliates/:id/reset-password',...admin,async(req,res)=>{
    try{
      if(!validId(req.params.id))return res.status(400).json({ok:false,error:'invalid_seller_id'});
      const password=String(req.body?.temporary_password||'');
      if(password.length<12||password.length>128||!/[0-9]/.test(password)||!/[A-Za-z]/.test(password))
        return res.status(400).json({ok:false,error:'weak_temporary_password'});
      const credential=await makePassword(password);
      const q=await pool.query('update store_affiliate_sellers set password_hash=$1,password_salt=$2,updated_at=now() where id=$3 returning id',
        [credential.hash,credential.salt,req.params.id]);
      if(!q.rowCount)return res.status(404).json({ok:false,error:'seller_not_found'});
      await pool.query('delete from store_affiliate_sessions where seller_id=$1',[req.params.id]);
      res.json({ok:true,password_reset:true});
    }catch(e){res.status(503).json({ok:false,error:'seller_password_reset_failed'})}
  });
  app.get('/api/store/admin/affiliates/:id',...admin,async(req,res)=>{
    try{
      if(!validId(req.params.id))return res.status(400).json({ok:false,error:'invalid_seller_id'});
      const s=await pool.query('select id,code,display_name,contact_email,city,country,active from store_affiliate_sellers where id=$1',[req.params.id]);
      if(!s.rowCount)return res.status(404).json({ok:false,error:'seller_not_found'});
      const c=await pool.query(`select c.id,c.order_id,c.item_title,c.sale_amount_clp,c.commission_clp,c.status,c.created_at,
        o.paid_at,o.status as order_status,i.quantity
        from store_affiliate_commissions c join store_orders o on o.id=c.order_id
        join store_order_items i on i.id=c.order_item_id
        where c.seller_id=$1 order by c.created_at desc limit 1000`,[req.params.id]);
      const p=await pool.query('select id,period_start,period_end,total_clp,paid_at,transfer_reference,receipt_filename from store_affiliate_payouts where seller_id=$1 order by period_end desc',[req.params.id]);
      res.json({ok:true,seller:s.rows[0],commissions:c.rows,payouts:p.rows});
    }catch(e){res.status(503).json({ok:false,error:'seller_detail_failed'})}
  });
  app.get('/api/store/admin/affiliates/:id/monthly',...admin,async(req,res)=>{
    try{
      if(!validId(req.params.id))return res.status(400).json({ok:false,error:'invalid_seller_id'});
      const q=await pool.query(`select to_char(o.paid_at at time zone 'America/Santiago','YYYY-MM') as month,
        count(distinct o.id)::int as orders,
        coalesce(sum(i.quantity),0)::int as products_sold,
        coalesce(sum(c.sale_amount_clp) filter(where c.status<>'reversed'),0)::bigint as sales_clp,
        coalesce(sum(c.commission_clp) filter(where c.status='pending'),0)::bigint as pending_clp,
        coalesce(sum(c.commission_clp) filter(where c.status='paid'),0)::bigint as paid_clp
        from store_affiliate_commissions c
        join store_orders o on o.id=c.order_id and o.status='paid'
        join store_order_items i on i.id=c.order_item_id
        where c.seller_id=$1 and o.paid_at is not null
        group by 1 order by 1 desc limit 36`,[req.params.id]);
      res.json({ok:true,months:q.rows});
    }catch(e){res.status(503).json({ok:false,error:'affiliate_monthly_failed'})}
  });
  // Conciliación manual de pagos confirmados para recuperarse de un fallo temporal del módulo.
  app.post('/api/store/admin/affiliates/reconcile',...admin,async(req,res)=>{
    try{
      const q=await pool.query(`select distinct a.order_id
        from store_affiliate_attributions a
        join store_orders o on o.id=a.order_id and o.status='paid'
        join store_order_items i on i.order_id=o.id
        left join store_affiliate_commissions c on c.order_item_id=i.id
        where c.id is null order by a.order_id limit 200`);
      let recovered=0,failed=0;
      for(const {order_id} of q.rows){
        const client=await pool.connect();
        try{await client.query('begin');const result=await recordPaidOrderCommissions(client,Number(order_id));
          recovered+=result.recorded;await client.query('commit');
        }catch(e){failed++;await client.query('rollback').catch(()=>{})}
        finally{client.release()}
      }
      // Las devoluciones anteriores al pago de comisión se anulan automáticamente.
      const reversed=await pool.query(`update store_affiliate_commissions c
        set status='reversed',reversed_at=now(),reversal_reason='order_refunded'
        from store_orders o where c.order_id=o.id and o.status='refunded' and c.status='pending'
        returning c.id`);
      // Las devoluciones de una comisión ya transferida requieren revisión humana.
      const postpaid=await pool.query(`select count(*)::int as total from store_affiliate_commissions c
        join store_orders o on o.id=c.order_id where o.status='refunded' and c.status='paid'`);
      res.json({ok:true,recovered_commissions:recovered,failed_orders:failed,reversed_pending:reversed.rowCount,
        refunded_after_payout:postpaid.rows[0].total,review_required:Number(postpaid.rows[0].total)>0});
    }catch(e){res.status(503).json({ok:false,error:'affiliate_reconciliation_failed'})}
  });
  // Nunca acepta importes indicados por el cliente: liquida comisiones reales pendientes.
  app.post('/api/store/admin/affiliates/:id/payouts',...admin,async(req,res)=>{
    const client=await pool.connect();
    try{
      const sellerId=Number(req.params.id),b=req.body||{},start=String(b.period_start||''),end=String(b.period_end||'');
      const reference=String(b.transfer_reference||'').trim(),filename=String(b.receipt_filename||'').trim(),receipt=String(b.receipt_base64||'');
      if(!validId(sellerId)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end)||start>end||
       reference.length<4||reference.length>120||!/^[-\w. ]{5,150}\.(pdf|png|jpg|jpeg)$/i.test(filename)||receipt.length>1500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(receipt))
        return res.status(400).json({ok:false,error:'invalid_payout_evidence'});
      const bytes=Buffer.from(receipt,'base64');
      if(bytes.length<100||bytes.length>1000000)return res.status(400).json({ok:false,error:'invalid_receipt_size'});
      const pdf=bytes.subarray(0,5).toString()==='%PDF-',png=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),jpeg=bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
      if(!((pdf&&/\.pdf$/i.test(filename))||(png&&/\.png$/i.test(filename))||(jpeg&&/\.jpe?g$/i.test(filename))))return res.status(400).json({ok:false,error:'receipt_type_mismatch'});
      await client.query('begin');
      const s=await client.query('select id from store_affiliate_sellers where id=$1 for update',[sellerId]);
      if(!s.rowCount){await client.query('rollback');return res.status(404).json({ok:false,error:'seller_not_found'})}
      const c=await client.query(`select c.id,c.commission_clp from store_affiliate_commissions c
       join store_orders o on o.id=c.order_id and o.status='paid'
       where c.seller_id=$1 and c.status='pending' and (c.created_at at time zone 'America/Santiago')::date between $2::date and $3::date
       order by c.id for update of c`,[sellerId,start,end]);
      if(!c.rowCount){await client.query('rollback');return res.status(409).json({ok:false,error:'no_pending_commissions'})}
      const total=c.rows.reduce((sum,x)=>sum+Number(x.commission_clp),0);
      const p=await client.query(`insert into store_affiliate_payouts
       (seller_id,period_start,period_end,total_clp,transfer_reference,paid_at,created_by,receipt_filename,receipt_mime,receipt_data)
       values($1,$2,$3,$4,$5,now(),$6,$7,$8,$9) returning id,total_clp,paid_at`,
       [sellerId,start,end,total,reference,req.auth.id,filename,pdf?'application/pdf':png?'image/png':'image/jpeg',bytes]);
      for(const item of c.rows){
        await client.query('insert into store_affiliate_payout_lines(payout_id,commission_id) values($1,$2)',[p.rows[0].id,item.id]);
        await client.query("update store_affiliate_commissions set status='paid' where id=$1 and status='pending'",[item.id]);
      }
      await client.query('commit');
      res.status(201).json({ok:true,payout:p.rows[0],commissions:c.rowCount});
    }catch(e){await client.query('rollback').catch(()=>{});res.status(e.code==='23505'?409:503).json({ok:false,error:e.code==='23505'?'payout_already_exists':'payout_failed'})}finally{client.release()}
  });
  app.get('/api/store/admin/affiliates/payouts/:id/receipt',...admin,async(req,res)=>{
    try{
      if(!validId(req.params.id))return res.sendStatus(400);
      const q=await pool.query('select receipt_filename,receipt_mime,receipt_data from store_affiliate_payouts where id=$1',[req.params.id]);
      if(!q.rowCount||!q.rows[0].receipt_data)return res.sendStatus(404);
      res.setHeader('Content-Type',q.rows[0].receipt_mime);
      res.setHeader('Content-Disposition','attachment; filename="comprobante-'+req.params.id+'.'+(q.rows[0].receipt_mime==='application/pdf'?'pdf':q.rows[0].receipt_mime==='image/png'?'png':'jpg')+'"');
      res.send(q.rows[0].receipt_data);
    }catch(e){res.sendStatus(503)}
  });
}
module.exports={registerAffiliateApi};
