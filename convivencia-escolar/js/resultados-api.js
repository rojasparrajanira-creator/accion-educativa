window.MECResults={
  API:'https://convivencia-escolar-api.onrender.com',
  labels:{
    D01:'Seguridad y protección',
    D02:'Buen trato y respeto',
    D03:'Relaciones entre pares',
    D04:'Violencia y victimización',
    D05:'Normas y justicia',
    D06:'Resolución de conflictos',
    D07:'Inclusión y diversidad',
    D08:'Pertenencia escolar',
    D09:'Participación estudiantil',
    D10:'Bienestar socioemocional',
    D11:'Regulación emocional',
    D12:'Autoestima académica y motivación',
    D13:'Apoyo adulto y búsqueda de ayuda',
    D14:'Respuesta institucional',
    D15:'Convivencia digital',
    D16:'Conducta prosocial y cuidado colectivo'
  },

  link(label,href,margin='16px 0 0 18px'){
    const a=document.createElement('a');
    a.href=href;
    a.textContent=label;
    a.style.display='inline-block';
    a.style.margin=margin;
    a.style.fontWeight='700';
    return a;
  },

  reviewLabel(status){
    return ({
      pending_review:'Pendiente de revisión',
      reviewed:'Revisión realizada',
      context_required:'Requiere más contexto'
    })[status]||status;
  },

  setPgceState(link,review){
    const allowed=review&&review.status==='reviewed';
    link.dataset.reviewReady=allowed?'1':'0';
    link.style.pointerEvents=allowed?'auto':'none';
    link.style.opacity=allowed?'1':'.45';
    link.setAttribute('aria-disabled',allowed?'false':'true');
    link.textContent=allowed?'Priorizar en PGCE':'PGCE disponible tras revisión';
  },

  async renderReview(container,id,pgLink){
    const section=document.createElement('div');
    section.style.marginTop='24px';
    section.style.paddingTop='18px';
    section.style.borderTop='1px solid #dcebe5';
    container.appendChild(section);

    const h=document.createElement('h3');
    h.textContent='Revisión profesional';
    section.appendChild(h);

    const info=document.createElement('p');
    info.textContent='Antes de crear una intervención PGCE, un profesional debe revisar los resultados en contexto y registrar su decisión.';
    section.appendChild(info);

    const status=document.createElement('p');
    status.textContent='Cargando estado de revisión…';
    section.appendChild(status);

    const label=document.createElement('label');
    label.textContent='Estado de revisión';
    label.style.display='block';
    label.style.fontWeight='700';
    label.style.marginTop='12px';
    section.appendChild(label);

    const select=document.createElement('select');
    select.style.width='100%';
    select.style.maxWidth='420px';
    select.style.padding='10px';
    select.style.border='1px solid #d7e8e2';
    select.style.borderRadius='10px';
    select.innerHTML='<option value="">Seleccionar…</option><option value="reviewed">Revisión realizada</option><option value="context_required">Requiere más contexto</option>';
    section.appendChild(select);

    const noteLabel=document.createElement('label');
    noteLabel.textContent='Observación profesional';
    noteLabel.style.display='block';
    noteLabel.style.fontWeight='700';
    noteLabel.style.marginTop='12px';
    section.appendChild(noteLabel);

    const note=document.createElement('textarea');
    note.rows=4;
    note.maxLength=2000;
    note.style.width='100%';
    note.style.maxWidth='720px';
    note.style.padding='10px';
    note.style.border='1px solid #d7e8e2';
    note.style.borderRadius='10px';
    note.placeholder='Registra antecedentes de contexto, observaciones o fundamentos de la revisión.';
    section.appendChild(note);

    const save=document.createElement('button');
    save.type='button';
    save.textContent='Guardar revisión profesional';
    save.className='btn primary';
    save.style.marginTop='12px';
    section.appendChild(save);

    const msg=document.createElement('p');
    msg.style.fontSize='12px';
    msg.style.color='#66788a';
    section.appendChild(msg);

    let current={status:'pending_review',note:null};

    const apply=review=>{
      current=review||{status:'pending_review',note:null};
      status.textContent='Estado: '+this.reviewLabel(current.status);
      if(current.status==='reviewed'||current.status==='context_required')select.value=current.status;
      else select.value='';
      note.value=current.note||'';
      if(current.reviewed_by_name&&current.reviewed_at){
        msg.textContent='Última revisión: '+current.reviewed_by_name+' · '+new Date(current.reviewed_at).toLocaleString('es-CL');
      }else{
        msg.textContent='Aún no existe una revisión profesional registrada.';
      }
      this.setPgceState(pgLink,current);
    };

    try{
      const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(id)+'/review');
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'review_load_failed');
      apply(d.review);
    }catch(e){
      status.textContent='No fue posible recuperar el estado de revisión.';
      save.disabled=true;
      this.setPgceState(pgLink,current);
    }

    save.onclick=async()=>{
      const reviewStatus=select.value;
      const reviewNote=note.value.trim();
      if(!reviewStatus){msg.textContent='Selecciona un estado de revisión.';return}
      if(reviewStatus==='context_required'&&!reviewNote){msg.textContent='Describe qué antecedente o contexto adicional se requiere.';return}

      save.disabled=true;
      msg.textContent='Guardando revisión…';
      try{
        const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(id)+'/review',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({status:reviewStatus,note:reviewNote})
        });
        const d=await r.json();
        if(!r.ok||!d.ok)throw new Error(d.error||'review_save_failed');
        apply(d.review);
        msg.textContent='Revisión profesional guardada correctamente'+(d.review.reviewed_by_name?' por '+d.review.reviewed_by_name:'')+'.';
      }catch(e){
        msg.textContent='No fue posible guardar la revisión profesional.';
      }finally{
        save.disabled=false;
      }
    };
  },

  async renderPicker(box){
    const params=new URLSearchParams(location.search),eid=Number(params.get('establishment_id')||0);
    if(!eid){box.textContent='Falta el contexto del establecimiento.';return}
    try{
      const r=await fetch(this.API+'/api/applications?establishment_id='+encodeURIComponent(eid)),d=await r.json();
      if(!r.ok||!d.ok)throw new Error('applications_failed');
      const completed=(d.applications||[]).filter(x=>x.status==='completed');
      box.replaceChildren();
      const h=document.createElement('h3');h.textContent='Aplicaciones completadas';box.appendChild(h);
      const p=document.createElement('p');p.textContent='Selecciona una aplicación para revisar resultados, informe individual y estado de revisión profesional.';box.appendChild(p);
      if(!completed.length){
        const empty=document.createElement('p');empty.textContent='Aún no existen aplicaciones completadas en este establecimiento.';box.appendChild(empty);return;
      }
      const wrap=document.createElement('div');
      completed.forEach(x=>{
        const card=document.createElement('div');card.style.border='1px solid #dcebe5';card.style.borderRadius='12px';card.style.padding='12px';card.style.margin='9px 0';card.style.display='flex';card.style.justifyContent='space-between';card.style.gap='12px';card.style.alignItems='center';card.style.flexWrap='wrap';
        const info=document.createElement('div');
        const b=document.createElement('b');b.textContent=x.student||'Estudiante';
        const meta=document.createElement('div');meta.style.fontSize='12px';meta.style.color='#66788a';
        const review=x.review_status==='reviewed'?'Revisión realizada':x.review_status==='context_required'?'Requiere más contexto':'Revisión pendiente';
        meta.textContent=(x.course||'Sin curso')+' · '+(x.measurement||'Medición')+' · '+(x.school_year||'')+' · '+review;
        info.append(b,meta);
        const a=document.createElement('a');a.className='btn secondary';a.textContent='Abrir resultados';a.href='resultados.html?establishment_id='+encodeURIComponent(eid)+'&application_id='+encodeURIComponent(x.id);
        card.append(info,a);wrap.appendChild(card);
      });
      box.appendChild(wrap);
    }catch(e){box.textContent='No fue posible cargar las aplicaciones completadas.'}
  },

  async load(){
    const box=document.getElementById('pilot-result');
    if(!box)return;

    const id=new URLSearchParams(location.search).get('application_id');
    if(!id){
      await this.renderPicker(box);
      return;
    }

    try{
      const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(id)+'/results');
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'result_failed');

      const panel=document.querySelector('a[href="pgce-panel.html"]');
      if(panel&&d.application.establishment_id){
        panel.href='pgce-panel.html?establishment_id='+encodeURIComponent(d.application.establishment_id);
      }

      const h=document.createElement('h3');
      h.textContent='Resultados · '+d.application.student;
      box.replaceChildren(h);

      const p=document.createElement('p');
      p.textContent=(d.application.course||'Sin curso')+' · '+d.application.measurement+' · '+d.application.survey_level;
      box.appendChild(p);

      const note=document.createElement('p');
      note.textContent='Perfil dimensional descriptivo. No constituye calificación ni diagnóstico clínico.';
      box.appendChild(note);

      const ul=document.createElement('ul');
      Object.entries(d.dimension_summary||{}).forEach(([code,x])=>{
        const li=document.createElement('li');
        li.textContent=code+' · '+(this.labels[code]||code)+' · '+x.answered+' respuestas · promedio descriptivo '+x.average;
        ul.appendChild(li);
      });
      box.appendChild(ul);

      if(!ul.children.length){
        const q=document.createElement('p');
        q.textContent='Aún no hay respuestas dimensionales suficientes para mostrar el perfil.';
        box.appendChild(q);
      }

      const report=this.link(
        'Abrir informe individual',
        'informe-individual.html?establishment_id='+encodeURIComponent(d.application.establishment_id)+'&application_id='+encodeURIComponent(id),
        '16px 0 0 0'
      );
      box.appendChild(report);

      const traj=this.link(
        'Ver trayectoria M1/M2/M3',
        'trayectorias.html?student_id='+encodeURIComponent(d.application.student_id)+'&establishment_id='+encodeURIComponent(d.application.establishment_id)
      );
      box.appendChild(traj);

      const pg=this.link(
        'PGCE disponible tras revisión',
        'pgce-priorizacion.html?establishment_id='+encodeURIComponent(d.application.establishment_id)+'&application_id='+encodeURIComponent(id)
      );
      this.setPgceState(pg,{status:'pending_review'});
      box.appendChild(pg);

      const course=this.link(
        'Informe del curso · '+d.application.measurement,
        'informe-curso.html?course_id='+encodeURIComponent(d.application.course_id)+'&measurement_id='+encodeURIComponent(d.application.measurement_id)+'&school_year='+encodeURIComponent(d.application.school_year)+'&application_id='+encodeURIComponent(id)
      );
      box.appendChild(course);

      const inst=this.link(
        'Informe institucional · '+d.application.measurement,
        'informe-institucional.html?establishment_id='+encodeURIComponent(d.application.establishment_id)+'&measurement_id='+encodeURIComponent(d.application.measurement_id)+'&school_year='+encodeURIComponent(d.application.school_year)+'&application_id='+encodeURIComponent(id)
      );
      box.appendChild(inst);

      await this.renderReview(box,id,pg);
    }catch(e){
      box.textContent=e.message==='application_not_completed'
        ?'Esta aplicación todavía no está completada. Los resultados se habilitan al finalizar la encuesta.'
        :'No fue posible recuperar este resultado.';
    }
  }
};

document.addEventListener('DOMContentLoaded',()=>window.MECResults.load());