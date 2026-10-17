'use strict';
// Readable voucher previews and manual payment confirmation, authenticated to Superadmin.
const payment=require('./request-payment');
function register(app,{pool,requireSuper,findRequest,layout}){
  app.get('/superadmin/comprobante/:id',requireSuper,async(req,res)=>{
    if(!pool)return res.sendStatus(503);
    try{
      const r=await pool.query('SELECT mimetype,content,filename FROM idps_request_vouchers WHERE request_id=$1',[req.params.id]);
      const doc=r.rows[0];
      if(!doc)return res.sendStatus(404);
      const valid=payment.validate({buffer:doc.content,size:doc.content.length,
        mimetype:doc.mimetype,originalname:doc.filename});
      const ext=valid.mime==='application/pdf'?'pdf':valid.mime==='image/jpeg'?'jpg':'png';
      res.set({'Cache-Control':'private, no-store, max-age=0',
        'X-Content-Type-Options':'nosniff',
        'Content-Type':valid.mime,
        'Content-Disposition':(valid.mime==='application/pdf'?'attachment':'inline')+'; filename="comprobante.'+ext+'"'});
      return res.end(doc.content);
    }catch(error){
      console.error('IDPS voucher download failed:',error.message);
      return res.sendStatus(404);
    }
  });
  app.get('/superadmin/pagos/:id',requireSuper,async(req,res)=>{
    try{
      const request=await findRequest(req.params.id);
      if(!request)return res.status(404).send(layout('Solicitud no encontrada','<div class="card">Solicitud no encontrada.</div>'));
      const doc=(await pool.query('SELECT filename,mimetype,file_size,uploaded_at FROM idps_request_vouchers WHERE request_id=$1',[request.id])).rows[0];
      const safe=payment.escape;
      const preview=!doc?'<p>No se conserva el comprobante. Si esta solicitud es anterior, la versión previa solo guardó el nombre del archivo.</p>':
        '<p><a class="btn secondary" href="/superadmin/comprobante/'+request.id+'" target="_blank" rel="noopener noreferrer">'+
        (doc.mimetype==='application/pdf'?'Descargar y revisar PDF':'Abrir fotografía del comprobante')+'</a></p>'+
        (doc.mimetype.startsWith('image/')?'<img alt="Comprobante de pago privado" src="/superadmin/comprobante/'+request.id+
        '" style="width:100%;max-height:700px;object-fit:contain;border:1px solid #ddd;border-radius:12px">':'');
      const confirmed=request.payment_status==='verified';
      const legacy=request.payment_status==='legacy';
      const verification=doc&&request.status==='pending'&&!confirmed?
        '<form method="post" action="/superadmin/pagos/'+request.id+'/confirmar">'+
        '<p><strong>Importante:</strong> la imagen no demuestra el abono. Debes confirmar que el dinero llegó a la cuenta bancaria.</p>'+
        '<label><input type="checkbox" name="confirmed" value="yes" required> Comprobé el abono de $15.000 en el banco y corresponde a este establecimiento.</label>'+
        '<p><button class="btn success">Confirmar pago</button></p></form>':'';
      res.set('Cache-Control','no-store');
      return res.send(layout('Revisar pago IDPS',
        '<div class="card" style="max-width:920px;margin:auto"><h1>Revisión de pago IDPS</h1>'+
        '<p><strong>Establecimiento:</strong> '+safe(request.establishment_name)+
        '<br><strong>RBD:</strong> '+safe(request.rbd)+
        '<br><strong>Responsable:</strong> '+safe(request.contact_name)+
        '<br><strong>Correo:</strong> '+safe(request.email)+
        '<br><strong>Monto del plan:</strong> $15.000 CLP / 30 días'+
        '<br><strong>Estado:</strong> '+(confirmed?'Abono confirmado':legacy?'Solicitud anterior a la revisión':'Pendiente de confirmación')+'</p>'+
        '<h2>Comprobante adjunto</h2>'+preview+
        (confirmed?'<p class="notice ok">Abono confirmado. Ahora puedes aprobar la solicitud desde el panel.</p>':'')+
        verification+'<p><a class="btn secondary" href="/superadmin/dashboard">Volver al panel</a></p></div>',
        '<a href="/superadmin/dashboard">Panel</a>'));
    }catch(error){
      console.error('IDPS payment review failed:',error.message);
      return res.status(400).send(layout('Solicitud no disponible','<div class="card">No se puede revisar esta solicitud.</div>'));
    }
  });
  app.post('/superadmin/pagos/:id/confirmar',requireSuper,async(req,res)=>{
    if(!pool||req.body?.confirmed!=='yes')
      return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('Debes revisar el abono bancario antes de confirmarlo.'));
    try{
      const result=await pool.query(
        "UPDATE idps_account_requests SET payment_status='verified',payment_verified_at=now() "+
        "WHERE id=$1 AND status='pending' AND payment_status='pending' "+
        "AND EXISTS(SELECT 1 FROM idps_request_vouchers v WHERE v.request_id=idps_account_requests.id) RETURNING id",
        [req.params.id]);
      if(!result.rowCount)throw Error('La solicitud ya fue procesada o no tiene un comprobante almacenado');
      return res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(
        'Abono confirmado manualmente. Ahora puedes aprobar la solicitud y enviar el PIN.'));
    }catch(error){
      console.error('IDPS bank payment confirmation failed:',error.message);
      return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se pudo confirmar el abono.'));
    }
  });
}
module.exports=register;
