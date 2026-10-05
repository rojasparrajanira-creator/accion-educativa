document.write('<script src="questions-core.js?v=20261005-1418"><\/script>');
document.write('<script src="complementary-factors.js?v=20261005-1440"><\/script>');

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
        st.textContent='.mark{background:transparent!important;border:0!important;overflow:hidden}.mark img{width:50px;height:50px;border-radius:50%;display:block;object-fit:cover;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.16)}.roundlogo{background:transparent!important;border:0!important;box-shadow:none!important}.roundlogo img{width:min(260px,68vw);height:auto;aspect-ratio:1;border-radius:50%;object-fit:cover;display:block;box-shadow:0 18px 42px #0f2d5220}.mec-foot-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px}.mec-foot-brand img{width:42px;height:42px;border-radius:50%;object-fit:cover}.mec-foot-brand strong{color:#0F2D52}.mec-foot-tag{color:#19C2D1;font-weight:850;letter-spacing:.08em;font-size:9.5px}body{background:linear-gradient(180deg,#F7FAFC 0%,#EEF4F8 100%)!important}header{background:linear-gradient(135deg,#0F2D52 0%,#163C68 100%)!important;border-bottom:3px solid #19C2D1!important;box-shadow:0 8px 28px rgba(15,45,82,.14)!important}.brand{gap:12px!important}.brand strong{font-size:16px!important;letter-spacing:-.01em}.brand small{color:#C6EDF1!important}.card,.q{border:1px solid #DCE5EC!important;border-radius:16px!important;box-shadow:0 10px 28px rgba(15,45,82,.065)!important;background:#fff!important}.q{transition:box-shadow .15s ease,border-color .15s ease}.q:focus-within{border-color:#19C2D1!important;box-shadow:0 0 0 3px rgba(25,194,209,.10)!important}h1,h2,h3{letter-spacing:-.025em!important}.btn{border-radius:10px!important;min-height:42px!important;box-shadow:0 7px 18px rgba(25,194,209,.16)!important}.scale span{border-radius:9px!important;border-color:#C8D5DF!important;background:#FBFCFD!important}.scale input:checked+span{border-color:#19C2D1!important;background:#E8FAFC!important;box-shadow:0 0 0 2px rgba(25,194,209,.08)!important}.prog{height:8px!important;background:#DDE7ED!important}.prog i{background:linear-gradient(90deg,#19C2D1,#1E7FBC)!important}.qn{background:#0F2D52!important}.student .tag{background:#E7F6EC!important;color:#166534!important}.result-summary{background:#F4F9FC!important;border-color:#D8E7F0!important}.score{border-radius:14px!important;border-color:#DCE5EC!important;background:#fff!important}.score strong{letter-spacing:-.015em}footer{background:#fff!important;border-top:1px solid #E6E8EB!important;margin-top:18px!important}@media(max-width:700px){main{padding-top:20px!important}.card,.q{border-radius:14px!important}.mark img{width:46px;height:46px}}';
        document.head.appendChild(st);
      }
      const mark=document.querySelector('.mark'); if(mark) mark.innerHTML='<img alt="Logo oficial Material Educativo Chile">', mark.querySelector('img').src=src;
      const round=document.querySelector('.roundlogo'); if(round) round.innerHTML='<img alt="Logo oficial Material Educativo Chile">', round.querySelector('img').src=src;
      const footer=document.querySelector('footer');
      if(footer&&!footer.querySelector('.mec-foot-brand')){const original=footer.textContent;footer.innerHTML='<div class="mec-foot-brand"><img alt="Material Educativo Chile"><div><strong>Material Educativo Chile</strong><div class="mec-foot-tag">APRENDER · INCLUIR · TRANSFORMAR</div></div></div><div>'+original+'</div>';footer.querySelector('.mec-foot-brand img').src=src;}
    }catch(e){console.error('No fue posible cargar el logo oficial',e);}
  }
  function polishStudentResult(){
    const result=document.getElementById('resultView');
    if(!result)return;
    const notices=[...result.querySelectorAll('.notice')];
    for(const n of notices){
      if(/resultado oficial SIMCE|diagnóstico clínico|Agencia de Calidad|Ministerio de Educación/i.test(n.textContent||'')){
        n.className='notice info';
        n.innerHTML='<b>Resultado orientativo:</b> esta síntesis organiza las respuestas del estudiante para apoyar el acompañamiento educativo, la planificación de acciones y el seguimiento de su trayectoria escolar.';
      }
    }
  }
  function init(){applyOfficialBrand();polishStudentResult();const obs=new MutationObserver(polishStudentResult);obs.observe(document.body,{subtree:true,childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
