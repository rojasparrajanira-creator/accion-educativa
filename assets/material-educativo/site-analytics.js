/* Métricas propias y agregadas de Material Educativo Chile.
   Se registra un identificador aleatorio por navegador, no el nombre, correo o IP. */
(function(){
  'use strict';
  const API='https://convivencia-escolar-api.onrender.com';
  const VISITOR_KEY='mec_site_analytics_visitor_v1';
  const SESSION_KEY='mec_site_analytics_session_v1';
  let visitor=null,session=null,started=false,timer=null;
  const number=new Intl.NumberFormat('es-CL');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function identifier(storage,key){
    try{
      let value=storage.getItem(key);
      if(value&&uuid.test(value))return value;
      if(!window.crypto||!window.crypto.randomUUID)return null;
      value=window.crypto.randomUUID();
      storage.setItem(key,value);
      return value;
    }catch(_){return null}
  }
  function ids(){
    try{
      if(!visitor)visitor=identifier(window.localStorage,VISITOR_KEY);
      if(!session)session=identifier(window.sessionStorage,SESSION_KEY);
      return Boolean(visitor&&session);
    }catch(_){return false}
  }
  async function record(type,productId){
    if(!ids())return false;
    const data={visitor_id:visitor,session_id:session,type};
    if(type==='product_view'){
      const id=Number(productId);
      if(!Number.isSafeInteger(id)||id<1)return false;
      data.product_id=id;
    }
    try{
      const response=await fetch(API+'/api/site/analytics/event',{
        method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(data)
      });
      if(!response.ok)return false;
      const result=await response.json();
      return Boolean(result.ok&&result.recorded);
    }catch(_){return false}
  }
  async function refreshStats(){
    const nodes=document.querySelectorAll('[data-mec-stat]');
    if(!nodes.length)return;
    try{
      const response=await fetch(API+'/api/site/analytics/public',{cache:'no-store'});
      if(!response.ok)throw Error('stats_unavailable');
      const data=await response.json();
      if(!data.ok||!data.stats)throw Error('stats_unavailable');
      const allowed=['visitors','resource_views','explored_materials','online'];
      nodes.forEach(node=>{
        const key=node.getAttribute('data-mec-stat');
        if(!allowed.includes(key))return;
        const count=Number(data.stats[key]);
        node.textContent=Number.isSafeInteger(count)&&count>=0?number.format(count):'—';
      });
    }catch(_){
      // No se inventan datos: el guion inicial se mantiene cuando no hay respuesta del servidor.
    }
  }
  function heartbeat(){
    if(document.visibilityState==='visible')record('heartbeat');
  }
  function start(){
    if(started){refreshStats();return}
    started=true;
    record('visit').finally(refreshStats);
    timer=window.setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      heartbeat();
      refreshStats();
    },120000);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){heartbeat();refreshStats()}
    });
  }
  window.MECAnalytics={start,record,refreshStats,formatCount:n=>number.format(Number(n)||0)};
})();
