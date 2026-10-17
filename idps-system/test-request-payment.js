'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {details,validate,paymentInstruction}=require('./request-payment');

test('bank details must be complete before displaying them',()=>{
  let x=details({});
  assert.equal(x.ready,false);
  assert.doesNotMatch(paymentInstruction(x),/\d{10,}/);
  const env={
    IDPS_TRANSFER_HOLDER:'Acción Educativa SPA',
    IDPS_TRANSFER_RUT:'00.000.000-0',
    IDPS_TRANSFER_BANK:'Banco de prueba',
    IDPS_TRANSFER_ACCOUNT_TYPE:'Cuenta corriente',
    IDPS_TRANSFER_ACCOUNT_NUMBER:'123000456',
    IDPS_TRANSFER_EMAIL:'pagos@example.test'
  };
  x=details(env);
  assert.equal(x.ready,true);
  assert.equal(x.amount,15000);
  const html=paymentInstruction(x);
  assert.match(html,/\$15\.000/);
  assert.match(html,/123000456/);
  assert.match(html,/30 días/);
});
test('validates actual PDF, PNG and JPEG bytes and rejects files disguised with extension',()=>{
  const good=[
    ['application/pdf',Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],
    ['image/png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16)])],
    ['image/jpeg',Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(16)])]
  ];
  for(const [mimetype,buffer] of good){
    const result=validate({buffer,size:buffer.length,mimetype,originalname:'comprobante'});
    assert.equal(result.mime,mimetype);
    assert.ok(result.sha256.length===64);
  }
  assert.throws(()=>validate({buffer:Buffer.from('<html>script</html>'),size:18,mimetype:'image/png',originalname:'pago.png'}),/válido/);
  assert.throws(()=>validate({buffer:Buffer.from('%PDF-1.4'),size:8,mimetype:'image/jpeg',originalname:'pago.jpg'}),/válido/);
  assert.throws(()=>validate(null),/adjuntar/);
  assert.throws(()=>validate({buffer:Buffer.alloc(6*1024*1024),size:6*1024*1024,mimetype:'application/pdf'}),/máximo/);
});
test('escapes hostile banking text before showing it to visitors',()=>{
  const env={
    IDPS_TRANSFER_HOLDER:'<script>alert(1)</script>',
    IDPS_TRANSFER_RUT:'11',IDPS_TRANSFER_BANK:'Banco & Cia',
    IDPS_TRANSFER_ACCOUNT_TYPE:'Vista',IDPS_TRANSFER_ACCOUNT_NUMBER:'500',
    IDPS_TRANSFER_EMAIL:'admin@example.test'
  };
  const output=paymentInstruction(details(env));
  assert.ok(!output.includes('<script>'));
  assert.match(output,/&lt;script&gt;/);
  assert.match(output,/Banco &amp; Cia/);
});
