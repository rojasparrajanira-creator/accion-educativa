'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.resolve(__dirname,'../convivencia-escolar');
const read=p=>fs.readFileSync(path.join(dir,p),'utf8');
test('centro abre secciones de administración sin marcos activos',()=>{
 const s=read('admin-centro.html');
 assert.match(s,/location\.assign\(s\.src\)/);
 assert.match(s,/<section class="panel" hidden>/);
 assert.match(s,/src="about:blank"/);
 for(const dest of ['admin-pedidos.html','admin-tienda.html','admin-contenidos.html?seccion=consultas','admin-plataforma.html','admin-suscripciones.html']){
  assert.ok(s.includes(dest),dest);
 }
});
test('pedidos nunca confunde falta de datos o errores de sesión con cero ventas',()=>{
 const s=read('admin-pedidos.html');
 assert.match(s,/no confirma que no existan ventas realizadas en Mercado Pago/);
 assert.match(s,/No fue posible consultar los pedidos del servidor/);
 assert.match(s,/Registros de esta API:/);
 assert.match(s,/authentication_required/);
 assert.match(s,/\.disabled=false/);
});
test('respuestas a consultas abren correo y permiten copiar dirección sin enviar desde la web',()=>{
 const s=read('admin-contenidos.html');
 assert.match(s,/Abrir correo para responder/);
 assert.match(s,/mailto:\$\{esc\(x\.sender_email\)\}/);
 assert.match(s,/data-copy-email/);
 assert.match(s,/navigator\.clipboard\.writeText/);
 assert.match(s,/el panel todavía no envía respuestas por sí solo/);
});
test('únicamente interfaces de administración, no checkout ni entrega',()=>{
 const s=read('admin-centro.html');
 assert.ok(!s.includes('MEC_ENABLE_PILOT=true'));
});
