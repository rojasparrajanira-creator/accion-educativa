'use strict';
const pay=require('./request-payment');
const FIELD_MAP={
  holder:'IDPS_TRANSFER_HOLDER',rut:'IDPS_TRANSFER_RUT',bank:'IDPS_TRANSFER_BANK',
  type:'IDPS_TRANSFER_ACCOUNT_TYPE',number:'IDPS_TRANSFER_ACCOUNT_NUMBER',
  email:'IDPS_TRANSFER_EMAIL'
};
function createSettings({pool,requireSuper,layout,env=process.env}){
  async function init(){
    if(!pool)return;
    await pool.query('CREATE TABLE IF NOT EXISTS idps_settings (key text PRIMARY KEY, value text NOT NULL)');
  }
  async function get(){
    const fallback=pay.details(env);
    if(!pool)return fallback;
    const r=await pool.query("SELECT value FROM idps_settings WHERE key='idps_transfer_info'");
    if(!r.rows[0])return fallback;
    try{
      const stored=JSON.parse(r.rows[0].value);
      const values={};
      for(const [field,envKey] of Object.entries(FIELD_MAP))
        values[envKey]=String(stored[field]||'').trim();
      return pay.details(values);
    }catch{return fallback;}
  }
  function register(app){
    app.get('/superadmin/datos-transferencia',requireSuper,async(req,res)=>{
      try{
        const data=await get(),esc=pay.escape;
        const controls=[
          ['holder','Titular de la cuenta','text'],['rut','RUT del titular','text'],
          ['bank','Banco','text'],['type','Tipo de cuenta','text'],
          ['number','Número de cuenta','text'],['email','Correo para transferencias','email']
        ].map(([name,label,type])=>
          '<div class="field"><label for="'+name+'">'+label+'</label>'+
          '<input id="'+name+'" name="'+name+'" type="'+type+'" value="'+esc(data[name])+
          '" maxlength="160" required></div>').join('');
        res.set('Cache-Control','no-store');
        res.send(layout('Datos bancarios IDPS','<div class="card" style="max-width:650px;margin:auto">'+
          '<h1>Datos para transferencias IDPS</h1>'+
          '<p>Esta información se mostrará en la página de solicitud de acceso. No introduzcas claves bancarias ni códigos de acceso.</p>'+
          '<p>Valor inicial publicado: <b>$15.000 CLP por 30 días</b>.</p>'+
          '<form method="post" action="/superadmin/datos-transferencia">'+controls+
          '<button class="btn primary">Guardar datos de transferencia</button></form>'+
          '<p><a href="/superadmin/dashboard">Volver al panel</a></p></div>',
          '<a href="/superadmin/dashboard">Panel</a>'));
      }catch(error){
        console.error('IDPS transfer settings display failed:',error.message);
        res.status(503).send(layout('No disponible','<div class="card">Datos bancarios temporalmente no disponibles.</div>'));
      }
    });
    app.post('/superadmin/datos-transferencia',requireSuper,async(req,res)=>{
      if(!pool)return res.sendStatus(503);
      try{
        const stored={};
        for(const field of Object.keys(FIELD_MAP)){
          const value=String(req.body[field]||'').trim();
          if(!value||value.length>160||/[\x00-\x1f\x7f]/.test(value))throw Error('Dato bancario no válido: '+field);
          stored[field]=value;
        }
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stored.email))
          throw Error('Correo de transferencia inválido.');
        await pool.query(
          "INSERT INTO idps_settings(key,value) VALUES('idps_transfer_info',$1) "+
          "ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
          [JSON.stringify(stored)]);
        res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Datos bancarios actualizados. Ya son visibles en el formulario público de solicitudes.'));
      }catch(error){
        console.error('IDPS transfer settings validation error:',error.message);
        res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se guardaron los datos bancarios. Completa todos los campos correctamente.'));
      }
    });
  }
  return {init,get,register};
}
module.exports=createSettings;
