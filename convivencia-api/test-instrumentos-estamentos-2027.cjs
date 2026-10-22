'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const bankSrc=fs.readFileSync(path.join(root,'convivencia-escolar/js/instrumentos-estamentos-2027.js'),'utf8');
const preview=fs.readFileSync(path.join(root,'convivencia-escolar/preview-encuestas-estamentos-2027.html'),'utf8');
const context={window:{}};
vm.runInNewContext(bankSrc,context,{timeout:1500});
const bank=context.window.MECEncuestasEstamentos2027;
const roles=['familia','docente','asistente','directivo'];
const clauses=new Set('abcdefg'.split('').map(x=>'16D-'+x));
const wantedDimensions=new Set(['SEG','RESP','ORG','CONF','PAR','BIE','DIG','FORM','GEST','FAM']);

test('el banco 2027 diferencia a las cuatro comunidades y contiene 77 ítems trazables',()=>{
 assert.equal(bank.status,'prototype_unvalidated');
 assert.equal(bank.schoolYear,2027);
 assert.deepEqual(Object.keys(bank.audiences).sort(),roles.slice().sort());
 assert.equal(roles.reduce((n,k)=>n+bank.audiences[k].items.length,0),77);
 assert.ok(roles.every(k=>bank.audiences[k].items.length>=18));
 const ids=new Set();
 for(const role of roles){
   const items=bank.audiences[role].items;
   const wordings=new Set();
   for(const q of items){
     assert.match(q.id,/^(FAMILIA|DOCENTE|ASISTENTE|DIRECTIVO)_\d{2}$/);
     assert.ok(!ids.has(q.id),'ID duplicado '+q.id);ids.add(q.id);
     assert.ok(wantedDimensions.has(q.dimension));
     assert.ok(clauses.has(q.legal_clause));
     assert.ok(q.wording.length>=25&&q.wording.length<=235,'Texto extraño: '+q.id);
     assert.ok(!wordings.has(q.wording),'Enunciado duplicado en '+role);
     wordings.add(q.wording);
   }
 }
 assert.ok(ids.size===77);
});

test('hay cobertura temática de las siete cláusulas de artículo 16 D, sin equipararla a acreditación',()=>{
 const all=roles.flatMap(x=>bank.audiences[x].items);
 const covered=new Set(all.map(x=>x.legal_clause));
 assert.deepEqual([...covered].sort(),[...clauses].sort());
 assert.ok(bank.audiences.familia.items.some(x=>x.legal_clause==='16D-g'));
 assert.ok(bank.audiences.directivo.items.some(x=>x.legal_clause==='16D-e'));
 assert.ok(bank.audiences.docente.items.some(x=>x.legal_clause==='16D-a'));
 for(const c of clauses)assert.ok(all.filter(x=>x.legal_clause===c).length>=2,'Sin triangulación diagnóstica de '+c);
 assert.match(bank.directions,/no reemplazan procesos participativos/);
});

test('No tengo información y No corresponde no son valores numéricos ni se confunden con omitido',()=>{
 const opts=bank.scale;
 assert.deepEqual(Array.from(opts.slice(0,5),x=>x.value),[1,2,3,4,5]);
 assert.equal(opts[5].value,'unknown');
 assert.equal(opts[6].value,'not_applicable');
 assert.ok(!opts.some(x=>x.value==='skipped'));
 assert.match(preview,/answers\[selected\(\)\.items\[i\]\.id\]='skipped'/);
 assert.match(preview,/typeof v==='number'/);
 assert.match(preview,/No deseo responder/);
});

test('la vista previa no captura identificación ni envía o persiste respuestas',()=>{
 assert.match(preview,/Vista previa 2027/);
 assert.match(preview,/No se envían ni almacenan/);
 for(const re of [/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bsendBeacon\b/,/\blocalStorage\b/,/\bsessionStorage\b/,/\bindexedDB\b/,/<form\b/i]){
   assert.ok(!re.test(preview),'Posible envío o persistencia detectada: '+re);
 }
 assert.match(preview,/answers=Object\.create\(null\)/);
 assert.match(preview,/el\('proposal'\)\.value=''/);
 assert.match(preview,/aria-pressed/);
 assert.match(preview,/role="radiogroup"/);
 assert.match(preview,/role="progressbar"/);
 assert.match(preview,/prefers-reduced-motion/);
 const script=preview.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(script);
 new vm.Script(script[1]);
});
