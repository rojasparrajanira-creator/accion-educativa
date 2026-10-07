(()=>{
  const API='https://convivencia-escolar-api.onrender.com';
  const nativeFetch=window.fetch.bind(window);

  window.fetch=(input,init={})=>{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(url.startsWith(API))init=Object.assign({},init,{credentials:'include'});
    return nativeFetch(input,init);
  };

  function roleOf(user){
    const r=String(user?.role||'').toLowerCase();
    return r==='professional'&&user?.rbd==='PILOTO-MEC'?'coordinador_convivencia':r;
  }

  async function me(){
    const r=await nativeFetch(API+'/api/auth/me',{credentials:'include'});
    const d=await r.json().catch(()=>({ok:false}));
    if(!r.ok||!d.ok)throw new Error('authentication_required');
    return d.user;
  }

  async function logout(){
    try{await nativeFetch(API+'/api/auth/logout',{method:'POST',credentials:'include'})}catch(e){}
    location.href='ingreso.html';
  }

  async function guard(options={}){
    try{
      const user=await me();
      window.MECProfessional=user;
      const role=roleOf(user);
      const page=location.pathname.split('/').pop()||'index.html';

      if(user.must_change_password&&page!=='cambiar-clave.html'){
        const next=page+location.search;
        location.replace('cambiar-clave.html?next='+encodeURIComponent(next));
        return new Promise(()=>{});
      }

      const allowed=options.roles||['coordinador_convivencia','dupla_psicosocial'];
      if(!options.allowAnyRole&&!allowed.includes(role)){
        location.replace('notificaciones.html');
        return new Promise(()=>{});
      }

      document.documentElement.dataset.auth='ok';
      const q=new URLSearchParams(location.search);
      const current=Number(q.get('establishment_id')||0);
      const expected=Number(user.establishment_id||0);
      if(options.bindEstablishment!==false&&expected&&current!==expected&&page!=='cambiar-clave.html'){
        q.set('establishment_id',String(expected));
        location.replace(page+'?'+q.toString());
        return new Promise(()=>{});
      }

      document.querySelectorAll('[data-professional-name]').forEach(x=>x.textContent=user.name||'Profesional');
      document.querySelectorAll('[data-establishment-name]').forEach(x=>x.textContent=user.establishment||'Establecimiento');
      const roleLabels={coordinador_convivencia:'Coordinación de Convivencia',dupla_psicosocial:'Dupla Psicosocial',profesor:'Profesor/a',asistente_educacion:'Asistente de la Educación',prevencionista:'Prevencionista',nutricionista:'Nutricionista',platform_admin:'Administración de Plataforma'};
      document.querySelectorAll('[data-professional-role]').forEach(x=>x.textContent=roleLabels[role]||role);
      document.querySelectorAll('[data-role-allow]').forEach(x=>{
        const allowed=String(x.dataset.roleAllow||'').split(',').map(v=>v.trim()).filter(Boolean);
        x.hidden=!allowed.includes(role);
      });
      return user;
    }catch(e){
      const next=location.pathname.split('/').pop()+location.search;
      location.replace('ingreso.html?next='+encodeURIComponent(next));
      return new Promise(()=>{});
    }
  }

  window.MECAuth={API,me,logout,guard,roleOf};
})();