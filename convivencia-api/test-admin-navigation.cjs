'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../convivencia-escolar');
test('Centro de Superadministración enlaza módulos sin incrustaciones',()=>{
 const html=fs.readFileSync(path.join(root,'admin-centro.html'),'utf8');
 assert.doesNotMatch(html,/<iframe\b/i);
 for(const address of ['admin-tienda.html','admin-pedidos.html','admin-contenidos.html?seccion=blog',
  'admin-contenidos.html?seccion=consultas','admin-plataforma.html','admin-suscripciones.html']){
  assert.ok(html.includes('href="'+address+'"'),'Módulo ausente: '+address);
 }
 assert.match(html,/role|Superadministración/i);
});
test('Pedidos nunca informan cero ante fallo de autenticación',()=>{
 const html=fs.readFileSync(path.join(root,'admin-pedidos.html'),'utf8');
 assert.match(html,/NO SE PUDIERON CARGAR LOS PEDIDOS/);
 assert.match(html,/authentication_required/);
 assert.match(html,/statRevenue','statSent','statPending/);
 assert.match(html,/Los datos no se han borrado/);
});
