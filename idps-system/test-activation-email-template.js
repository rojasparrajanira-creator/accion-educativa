'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const render=require('./activation-email-template');

test('correo personalizado presenta saludo, ventajas y datos del establecimiento',()=>{
  const {subject,html}=render({
    name:'Colegio Ficticio',rbd:'1234-5',contact_name:'Ana Paola',
    expires_at:'2026-11-16T15:00:00Z'
  },'123456');
  assert.match(subject,/bienvenida.*Plataforma IDPS/i);
  for(const text of ['¡Hola, Ana Paola!','Material Educativo Chile','Indicadores de Desarrollo Personal y Social',
    'evaluar, analizar y realizar seguimiento','planificación de acciones de mejora','Colegio Ficticio',
    '1234-5','123456','16-11-2026','https://idps-gestion-material-educativo.onrender.com/'])
    assert.ok(html.includes(text),'Missing '+text);
  assert.equal(typeof subject,'string');
});
test('datos introducidos por cliente se muestran escapados; nunca se pierden datos dinámicos',()=>{
  const {html}=render({name:'Escuela <script>alert(1)</script>',rbd:'RBD&123',contact_name:'Claudia <img>',expires_at:null},'991122');
  assert.ok(html.includes('Escuela &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Claudia &lt;img&gt;'));
  assert.ok(html.includes('RBD&amp;123'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('991122'));
});
test('no se pueden producir mensajes vacíos sin claves o sin institución',()=>{
  assert.throws(()=>render({name:'Colegio',rbd:'45'},''),/Incomplete/);
});
