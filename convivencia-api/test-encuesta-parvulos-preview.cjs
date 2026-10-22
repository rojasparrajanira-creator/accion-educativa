'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'convivencia-escolar/preview-encuesta-parvulos.html'),'utf8');
const dataSrc=fs.readFileSync(path.join(root,'convivencia-escolar/js/instrumento-parvulos-preview.js'),'utf8');
const context={window:{}};
vm.runInNewContext(dataSrc,context,{timeout:1000});
const data=context.window.MECParvulosPreview;

test('NT1 y NT2 son cuestionarios distintos, breves y exclusivamente ficticios',()=>{
  assert.ok(data);
  assert.equal(data.nt1.length,8);
  assert.equal(data.nt2.length,10);
  const codes=new Set();
  for(const [level,items] of [['nt1',data.nt1],['nt2',data.nt2]]){
    for(const item of items){
      assert.match(item.code,new RegExp('^D(0[1-9]|1[0-6])_'+level.toUpperCase()+'_01$'));
      assert.ok(!codes.has(item.code),'Código duplicado: '+item.code);
      codes.add(item.code);
      assert.ok(item.text.length>=20&&item.text.length<=110,'Pregunta demasiado compleja: '+item.code);
      assert.ok(item.text.startsWith('¿')&&item.text.endsWith('?'),'Pregunta sin puntuación: '+item.code);
    }
  }
  assert.ok(!dataSrc.includes('RUT')&&!dataSrc.includes('RUN'));
});

test('la escala ofrece tres caritas y la opción de no responder',()=>{
  assert.equal(data.scale.length,3);
  assert.deepEqual(Array.from(data.scale,x=>x.value),['yes','sometimes','no']);
  assert.deepEqual(Array.from(data.scale,x=>x.label),['Sí','A veces','No']);
  assert.equal(data.skip.value,'skip');
  assert.ok(data.scale.every(x=>x.face&&x.spoken));
});

test('ninguna respuesta sale del navegador o se conserva en su almacenamiento',()=>{
  const forbidden=[
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\blocalStorage\b/,
    /\bsessionStorage\b/, /\bsendBeacon\b/, /\bindexedDB\b/,
    /<form\b/i, /<input\b/i
  ];
  for(const re of forbidden){
    assert.ok(!re.test(html),'Vista previa requiere no persistir información: '+String(re));
    assert.ok(!re.test(dataSrc),'Instrumento requiere no persistir información: '+String(re));
  }
  assert.match(html,/answers\s*=\s*\[\]/);
  assert.match(html,/answers\s*=\s*\[\];\s*\/\/ No retener respuestas/);
  assert.match(html,/No solicita nombres ni RUN/);
  assert.match(html,/No es una encuesta oficial/);
});

test('interfaz accesible y audio separados para preguntas y opciones',()=>{
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/lang="es-CL"/);
  assert.match(html,/src="js\/voz-cl\.js"/);
  assert.match(html,/src="js\/instrumento-parvulos-preview\.js"/);
  assert.match(html,/id="listen-question"/);
  assert.match(html,/hear\.onclick=\(\)=>speak\(option\.spoken\)/);
  assert.match(html,/choose\.onclick=/);
  assert.match(html,/id="skip"/);
  assert.match(html,/aria-pressed/);
  assert.match(html,/role="progressbar"/);
  assert.match(html,/prefers-reduced-motion/);
  const inline=html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(inline,'Falta lógica del prototipo');
  new vm.Script(inline[1]);
});
