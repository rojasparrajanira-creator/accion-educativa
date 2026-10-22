'use strict';
// Comprobación del ingreso estudiantil, sin navegador externo, datos reales ni red.
// La prueba ejecuta la función original de navegación en un contexto VM simulado.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const loginPage=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/acceso-estudiante.html'),'utf8');
const welcomePage=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/encuesta-bienvenida.html'),'utf8');
const start=loginPage.indexOf('function goWelcome(data){');
const end=loginPage.indexOf('\nasync function login(',start);
assert.ok(start>=0&&end>start,'No se encontró la función de ingreso estudiantil');
const fnSource=loginPage.slice(start,end);

function attempt(data,{blocked=false,pinVisible=false}={}){
  const saved=new Map();
  const location={href:'sin-redireccion'};
  const loginStatus={textContent:''};
  const pinStatus={textContent:''};
  const loginBtn={disabled:true};
  const savePin={disabled:true};
  const document={getElementById(id){
    if(id==='pin-step')return {classList:{contains:()=>!pinVisible}};
    if(id==='pin-status')return pinStatus;
    if(id==='save-pin')return savePin;
    throw Error('elemento de prueba inesperado: '+id);
  }};
  const sessionStorage={setItem(k,v){
    if(blocked)throw Error('sessionStorage bloqueado');
    saved.set(k,v);
  }};
  const context={location,loginStatus,loginBtn,document,sessionStorage,Number,String,encodeURIComponent};
  vm.runInNewContext(fnSource+'\ngoWelcome(pilotData);',{...context,pilotData:data},{timeout:2000});
  return {location,saved,loginStatus,pinStatus,loginBtn,savePin};
}

test('el ingreso guarda la credencial en la sesión y jamás la incluye en la URL',()=>{
  const token='TOKEN-FICTICIO-NO-REAL';
  const p=attempt({application:{id:2027},access_token:token});
  assert.equal(p.saved.get('mec_student_access_2027'),token);
  assert.equal(p.location.href,'encuesta-bienvenida.html?application_id=2027');
  assert.ok(!p.location.href.includes('access='));
  assert.ok(!p.location.href.includes(token));
});

test('si el almacenamiento de sesión está bloqueado no se redirige ni se pierde el error visible',()=>{
  const p=attempt({application:{id:2027},access_token:'TOKEN-DE-PRUEBA'},{blocked:true,pinVisible:true});
  assert.equal(p.location.href,'sin-redireccion');
  assert.match(p.pinStatus.textContent,/navegador/);
  assert.equal(p.savePin.disabled,false);
  assert.equal(p.saved.size,0);
});

test('un login sin credencial válida no lleva a la encuesta',()=>{
  const p=attempt({application:{id:2027},access_token:''});
  assert.equal(p.location.href,'sin-redireccion');
  assert.match(p.loginStatus.textContent,/acceso seguro/);
  assert.equal(p.loginBtn.disabled,false);
});

test('los enlaces heredados con token en bienvenida no se propagan por Referrer',()=>{
  assert.match(welcomePage,/<meta name="referrer" content="no-referrer">/);
  assert.match(welcomePage,/sessionStorage\.setItem\(key,urlAccess\)/);
  assert.match(welcomePage,/history\.replaceState\(/);
});
