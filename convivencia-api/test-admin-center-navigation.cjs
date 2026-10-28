'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pages=path.resolve(__dirname,'../convivencia-escolar');
function read(name){return fs.readFileSync(path.join(pages,name),'utf8')}
function scripts(html){return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(Boolean)}
test('Centro: navegación a páginas completas y sin iframes ocultando información',()=>{
 const src=read('admin-centro.html');
 assert.doesNotMatch(src,/<iframe\b/i);
 for(const file of ['admin-tienda.html','admin-pedidos.html','admin-plataforma.html','admin-suscripciones.html','admin-contenidos.html?seccion=blog','admin-contenidos.html?seccion=consultas']){
   assert.ok(src.includes(file),'Sección no accesible: '+file);
 }
 assert.match(src,/if\(section\)location\.href=section\.src/);
 assert.match(src,/adminHealthReload/);
 assert.match(src,/Una lista vacía no demuestra que no existan ventas/);
 assert.match(src,/NO realiza cambios por sí solo/);
 for(const script of scripts(src))new Function(script);
});
test('Centro: diagnóstico usa solo GET, credenciales y distingue sesión, permisos, conexión',()=>{
 const src=read('admin-centro.html');
 for(const route of ['/api/auth/me','/api/store/admin/orders','/api/site/admin/blog','/api/site/admin/contacts','/api/subscriptions/admin']){
  assert.ok(src.includes(route),'Falta diagnóstico de '+route);
 }
 assert.match(src,/credentials:'include'/);
 assert.match(src,/response\.status===401/);
 assert.match(src,/response\.status===403/);
 assert.doesNotMatch(src,/(?:method:\s*['"]POST['"]|\/delivery\/retry|\/drive-access|\/api\/store\/admin\/orders\/.+POST)/);
});
test('Consultas: responder por correo o copiar destinatario sin enviar mensajes',()=>{
 const src=read('admin-contenidos.html');
 assert.match(src,/Responder por correo/);
 assert.match(src,/data-copy-contact/);
 assert.match(src,/navigator\.clipboard\.writeText/);
 for(const script of scripts(src))new Function(script);
});
