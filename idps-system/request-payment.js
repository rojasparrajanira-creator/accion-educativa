'use strict';
const crypto=require('node:crypto');
const VALID_TYPES=['application/pdf','image/png','image/jpeg'];
const MAX_SIZE=5*1024*1024;
const escape=v=>String(v??'').trim().replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fields={
  holder:'IDPS_TRANSFER_HOLDER',
  rut:'IDPS_TRANSFER_RUT',
  bank:'IDPS_TRANSFER_BANK',
  type:'IDPS_TRANSFER_ACCOUNT_TYPE',
  number:'IDPS_TRANSFER_ACCOUNT_NUMBER',
  email:'IDPS_TRANSFER_EMAIL'
};
function details(env=process.env){
  const data={};
  for(const [k,envVar] of Object.entries(fields))data[k]=String(env[envVar]||'').trim();
  return {...data,ready:Object.values(data).every(v=>v.length>0),amount:15000,periodDays:30};
}
function validate(file){
  if(!file||!Buffer.isBuffer(file.buffer)||file.size===0||file.size>MAX_SIZE)
    throw Error('Debes adjuntar el comprobante de pago (PDF, JPG o PNG; máximo 5 MB).');
  const b=file.buffer;
  const isPdf=b.subarray(0,5).toString('latin1')==='%PDF-';
  const isJpg=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
  const isPng=b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const mime=isPdf?'application/pdf':isJpg?'image/jpeg':isPng?'image/png':null;
  if(!mime||!VALID_TYPES.includes(file.mimetype)||file.mimetype!==mime)
    throw Error('El archivo debe ser un PDF, JPG o PNG válido. No se permiten otros formatos.');
  // Return exactly the bytes and type, never trust the upload's content type or filename.
  return {filename:String(file.originalname||'comprobante').slice(-150),mime,size:b.length,content:b,sha256:crypto.createHash('sha256').update(b).digest('hex')};
}
function paymentInstruction(data){
  if(!data.ready)return '<section class="card" style="margin:18px 0"><h2>Datos de transferencia</h2>'+
    '<p>Los datos bancarios se publicarán aquí cuando estén confirmados por Material Educativo Chile.</p>'+
    '<p>Mientras tanto, no se solicitará que realices un pago.</p></section>';
  return '<section class="card" style="margin:18px 0;border:1px solid #a7d9ee">'+
    '<h2>1. Datos para realizar tu transferencia</h2>'+
    '<p><strong>Valor:</strong> $15.000 CLP por un período de 30 días.</p>'+
    '<p><strong>Titular:</strong> '+escape(data.holder)+'<br>'+
    '<strong>RUT:</strong> '+escape(data.rut)+'<br>'+
    '<strong>Banco:</strong> '+escape(data.bank)+'<br>'+
    '<strong>Tipo de cuenta:</strong> '+escape(data.type)+'<br>'+
    '<strong>Número de cuenta:</strong> '+escape(data.number)+'<br>'+
    '<strong>Correo:</strong> '+escape(data.email)+'</p>'+
    '<p><strong>2.</strong> Realiza la transferencia y guarda el comprobante.</p>'+
    '<p><strong>3.</strong> Completa tus datos y adjunta el comprobante.</p>'+
    '<p>La cuenta se habilitará únicamente después de que Acción Educativa SPA verifique el abono y apruebe la solicitud.</p></section>';
}
module.exports={details,validate,paymentInstruction,escape,MAX_SIZE};
