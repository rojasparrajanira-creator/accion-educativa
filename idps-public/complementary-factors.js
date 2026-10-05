(()=>{
  const scale=['Nunca o casi nunca','A veces','Casi siempre','Siempre o casi siempre'];
  const common={
    basic:{
      attendance:[
        'Me resulta posible llegar al colegio y asistir con regularidad.',
        'En mi hogar recibo apoyo para asistir al colegio cuando corresponde.',
        'Cuando falto a clases, recibo apoyo para ponerme al día con lo que se trabajó.',
        'Siento que vale la pena venir al colegio y participar en las actividades escolares.',
        'Si tengo una dificultad para asistir, sé con qué adulto del establecimiento puedo conversar.'
      ],
      continuity:[
        'Siento que soy parte de mi curso y de mi colegio.',
        'Tengo al menos un adulto del establecimiento al que puedo pedir apoyo cuando tengo una dificultad.',
        'Creo que podré terminar adecuadamente este año escolar.',
        'Tengo motivos para seguir aprendiendo y continuar mis estudios.',
        'Si tuviera una dificultad importante, siento que el colegio intentaría ayudarme antes de que dejara de asistir.'
      ],
      gender:[
        'En mi curso se trata con el mismo respeto a estudiantes de cualquier género.',
        'Niñas y niños tienen las mismas oportunidades para participar y asumir responsabilidades.',
        'Los adultos del establecimiento esperan que todas y todos puedan aprender y progresar.',
        'Puedo elegir actividades o intereses sin sentir que existen cosas “solo para niñas” o “solo para niños”.',
        'Cuando aparecen burlas o comentarios ofensivos relacionados con el género, los adultos intervienen.'
      ]
    },
    secondary:{
      attendance:[
        'Me resulta posible asistir regularmente y llegar a tiempo al establecimiento.',
        'Cuento con apoyo familiar o de personas significativas para mantener una asistencia regular.',
        'Cuando falto, encuentro apoyo y estrategias para recuperar aprendizajes y mantenerme al día.',
        'Considero que asistir regularmente al establecimiento aporta a mis metas personales y educativas.',
        'Si enfrento una dificultad que afecta mi asistencia, sé a qué adulto o equipo del establecimiento recurrir.'
      ],
      continuity:[
        'Me siento vinculado/a con mi curso y con la comunidad educativa.',
        'Cuento con al menos un adulto del establecimiento a quien recurrir si tengo dificultades académicas, personales o familiares.',
        'Tengo expectativas de completar mi enseñanza media y continuar desarrollando mi trayectoria educativa.',
        'Reconozco metas o proyectos personales que me motivan a seguir estudiando.',
        'Si pensara en dejar de asistir o abandonar mis estudios, siento que el establecimiento buscaría alternativas de apoyo conmigo.'
      ],
      gender:[
        'En el establecimiento se promueve un trato respetuoso y equitativo entre estudiantes de distintos géneros.',
        'Las oportunidades de participación, liderazgo y representación estudiantil se ofrecen sin distinciones de género.',
        'Percibo expectativas académicas igualmente altas para estudiantes de distintos géneros.',
        'Puedo elegir asignaturas, áreas de interés o proyectos futuros sin sentir limitaciones por estereotipos de género.',
        'El establecimiento aborda burlas, discriminación o comentarios sexistas cuando se presentan.'
      ]
    }
  };
  function bank(level){return /medio/i.test(String(level||''))?common.secondary:common.basic;}
  window.IDPS_COMPLEMENTARY={
    version:'2026.10-complementary-v1',
    scale,
    modules:[
      {key:'attendance',title:'Factores asociados a la asistencia escolar',note:'Explora apoyos, motivación y condiciones percibidas que pueden favorecer la asistencia. No corresponde al indicador oficial de Asistencia escolar.'},
      {key:'continuity',title:'Factores asociados a la continuidad educativa',note:'Explora pertenencia, redes de apoyo y expectativas de continuidad. No corresponde al indicador oficial de Permanencia escolar.'},
      {key:'gender',title:'Percepción de equidad de género en la experiencia educativa',note:'Explora trato, oportunidades y expectativas percibidas. No corresponde al indicador oficial de Equidad de género en aprendizajes.'}
    ],
    questions(level){const b=bank(level);return [...b.attendance,...b.continuity,...b.gender];}
  };

  let installed=false;
  function install(){
    if(installed || typeof window.renderSurvey!=='function' || !document.getElementById('form')) return;
    installed=true;
    const originalRender=window.renderSurvey;
    window.renderSurvey=function(){
      originalRender.apply(this,arguments);
      const qs=document.getElementById('qs');
      if(!qs || qs.querySelector('[data-complementary="1"]')) return;
      const level=(window.student&&window.student.level)||'';
      const comp=window.IDPS_COMPLEMENTARY;
      const items=comp.questions(level);
      let offset=0;
      comp.modules.forEach((m,mi)=>{
        const intro=document.createElement('div');
        intro.className='card'; intro.dataset.complementary='1';
        intro.style.margin='22px 0 12px';
        intro.innerHTML=`<h2 style="margin-bottom:6px">Módulo complementario ${mi+1}</h2><h3 style="margin-bottom:7px">${m.title}</h3><p class="lead" style="margin-bottom:0">${m.note}</p>`;
        qs.appendChild(intro);
        items.slice(offset,offset+5).forEach((q,j)=>{
          const i=offset+j;
          const a=document.createElement('article'); a.className='q'; a.dataset.complementary='1';
          a.innerHTML=`<div class="qr"><div class="qn">${31+i}</div><div><div class="qt">${q}</div></div></div><div class="scale">${comp.scale.map((l,k)=>`<label><input type="radio" name="c${i}" value="${k+1}"><span>${l}</span></label>`).join('')}</div>`;
          qs.appendChild(a);
        });
        offset+=5;
      });
      const refresh=()=>{
        const core=[...qs.querySelectorAll('input[name^="q"]:checked')].length;
        const extra=[...qs.querySelectorAll('input[name^="c"]:checked')].length;
        const n=core+extra, total=45;
        const pt=document.getElementById('pt'),pb=document.getElementById('pb');
        if(pt)pt.textContent=`${n} de ${total}`;
        if(pb)pb.style.width=(n/total*100)+'%';
      };
      let saveTimer=null;
      const saveDraft=async()=>{
        const core=[...Array(30)].map((_,i)=>{const x=form.querySelector(`input[name="q${i}"]:checked`);return x?Number(x.value):null;});
        const extra=[...Array(15)].map((_,i)=>{const x=form.querySelector(`input[name="c${i}"]:checked`);return x?Number(x.value):null;});
        const payload=[...core,...extra];
        try{localStorage.setItem('idps_draft_'+(student?.rut||'session'),JSON.stringify(payload));}catch(_){}
        try{
          const token=sessionStorage.getItem('idps_student_session')||'';
          if(!token)return;
          const r=await fetch('https://idps-gestion-material-educativo.onrender.com/api/student/draft',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({answers:payload})});
          if(!r.ok)throw new Error('HTTP '+r.status);
        }catch(e){console.warn('Guardado automático pendiente',e);}
      };
      window.idpsSaveDraft=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,180);};
      let draft=Array.isArray(window.idpsServerDraft)?window.idpsServerDraft:[];
      if(!draft.some(v=>Number(v)>=1&&Number(v)<=4)){try{const local=JSON.parse(localStorage.getItem('idps_draft_'+(student?.rut||'session'))||'[]');if(Array.isArray(local))draft=local;}catch(_){}}
      window.idpsServerDraft=draft;
      for(let i=0;i<30;i++){const v=Number(draft[i]);if(v>=1&&v<=4){const x=form.querySelector(`input[name="q${i}"][value="${v}"]`);if(x){x.checked=true;if(Array.isArray(answers))answers[i]=v;}}}
      for(let i=0;i<15;i++){const v=Number(draft[30+i]);if(v>=1&&v<=4){const x=form.querySelector(`input[name="c${i}"][value="${v}"]`);if(x)x.checked=true;}}
      qs.addEventListener('change',()=>{setTimeout(refresh,0);window.idpsSaveDraft();});
      refresh();
      window.addEventListener('pagehide',()=>{try{window.idpsSaveDraft&&window.idpsSaveDraft();}catch(_){}},{once:false});
    };

    const form=document.getElementById('form');
    form.addEventListener('submit',async e=>{
      const extra=[...Array(15)].map((_,i)=>form.querySelector(`input[name="c${i}"]:checked`));
      if(extra.some(x=>!x)){
        e.preventDefault(); e.stopImmediatePropagation();
        const missing=extra.findIndex(x=>!x);
        const err=document.getElementById('formError');
        if(err)err.textContent='Faltan respuestas en los módulos complementarios.';
        const target=form.querySelector(`input[name="c${missing}"]`)?.closest('.q');
        if(target)target.scrollIntoView({behavior:'smooth',block:'center'});
        return;
      }
      const core=[...Array(30)].map((_,i)=>form.querySelector(`input[name="q${i}"]:checked`));
      if(core.some(x=>!x)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const answers=[...core,...extra].map(x=>Number(x.value));
      const err=document.getElementById('formError');
      const btn=form.querySelector('button[type="submit"]');
      if(err)err.textContent='Registrando tu respuesta…'; if(btn)btn.disabled=true;
      try{
        const token=sessionStorage.getItem('idps_student_session')||'';
        const r=await fetch('https://idps-gestion-material-educativo.onrender.com/api/student/submit',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({answers,instrument_version:'2026.10-complementary-v1'})});
        const j=await r.json();
        if(!r.ok||!j.ok)throw new Error(j.error||'No fue posible registrar la encuesta.');
        try{localStorage.removeItem('idps_draft_'+(student?.rut||'session'));}catch(_){}
        window.idpsServerDraft=[];
        if(typeof window.renderResult==='function')window.renderResult(j.result);
        sessionStorage.removeItem('idps_student_session');
      }catch(ex){if(err)err.textContent=ex.message||'No fue posible registrar la encuesta.';if(btn)btn.disabled=false;}
    },true);
  }
  setTimeout(install,0);
  document.addEventListener('DOMContentLoaded',install);
})();
