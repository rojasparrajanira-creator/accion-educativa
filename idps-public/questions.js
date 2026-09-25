document.write('<script src="questions-core.js"><\/script>');

(()=>{
  async function applyOfficialBrand(){
    try{
      const r=await fetch('logo-base64.txt?v=3',{cache:'no-store'});
      if(!r.ok) throw new Error('logo no disponible');
      const b64=(await r.text()).trim();
      if(!b64 || b64.length % 4 !== 0) throw new Error('logo invalido');
      const src='data:image/jpeg;base64,'+b64;
      let icon=document.querySelector('link[data-mec-favicon]');
      if(!icon){icon=document.createElement('link');icon.rel='icon';icon.type='image/jpeg';icon.dataset.mecFavicon='1';document.head.appendChild(icon);} icon.href=src;
      if(!document.getElementById('mecBrandFix')){
        const st=document.createElement('style');st.id='mecBrandFix';
        st.textContent='.mark{background:transparent!important;border:0!important;overflow:hidden}.mark img{width:46px;height:46px;border-radius:50%;display:block;object-fit:cover}.roundlogo{background:transparent!important;border:0!important;box-shadow:none!important}.roundlogo img{width:min(290px,72vw);height:auto;aspect-ratio:1;border-radius:50%;object-fit:cover;display:block;box-shadow:0 18px 42px #0f2d5222}.mec-foot-brand{display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:8px}.mec-foot-brand img{width:38px;height:38px;border-radius:50%;object-fit:cover}.mec-foot-brand strong{color:#0F2D52}.mec-foot-tag{color:#19C2D1;font-weight:800;letter-spacing:.05em;font-size:10px}';
        document.head.appendChild(st);
      }
      const mark=document.querySelector('.mark'); if(mark) mark.innerHTML='<img alt="Logo oficial Material Educativo Chile">', mark.querySelector('img').src=src;
      const round=document.querySelector('.roundlogo'); if(round) round.innerHTML='<img alt="Logo oficial Material Educativo Chile">', round.querySelector('img').src=src;
      const footer=document.querySelector('footer');
      if(footer&&!footer.querySelector('.mec-foot-brand')){const original=footer.textContent;footer.innerHTML='<div class="mec-foot-brand"><img alt="Material Educativo Chile"><div><strong>Material Educativo Chile</strong><div class="mec-foot-tag">APRENDER · INCLUIR · TRANSFORMAR</div></div></div><div>'+original+'</div>';footer.querySelector('.mec-foot-brand img').src=src;}
    }catch(e){console.error('No fue posible cargar el logo oficial',e);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyOfficialBrand);else applyOfficialBrand();
})();
