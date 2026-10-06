window.MECInstitution={
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
  async load(){
    const params=new URLSearchParams(location.search);
    const id=params.get('establishment_id');
    const mid=params.get('measurement_id');
    const year=params.get('school_year');
    const box=document.getElementById('institution-real');
    if(!box)return;

    if(!id||!mid||!year){
      box.textContent='Selecciona establecimiento, medición y año para generar el informe. M1, M2 y M3 se analizan por separado.';
      return;
    }

    try{
      const r=await fetch(this.API+'/api/establishments/'+encodeURIComponent(id)+'/results?measurement_id='+encodeURIComponent(mid)+'&school_year='+encodeURIComponent(year));
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'institution_results_failed');

      document.getElementById('meta-school').textContent=d.establishment.name+(d.establishment.rbd?' · RBD '+d.establishment.rbd:'');
      document.getElementById('meta-courses').textContent=d.courses;
      document.getElementById('meta-students').textContent=d.completed_students;
      document.getElementById('meta-apps').textContent=d.applications;

      const measureLabel=(d.measurement?.code||'Medición seleccionada')+' · '+(d.measurement?.school_year||year);
      const measure=document.getElementById('meta-measurement');
      const head=document.getElementById('head-measurement');
      if(measure)measure.textContent=measureLabel;
      if(head)head.textContent=measureLabel;

      box.replaceChildren();
      const h=document.createElement('h3');
      h.textContent='Resultados institucionales reales';
      box.appendChild(h);

      const p=document.createElement('p');
      p.textContent='Estudiantes con aplicación completada: '+d.completed_students+' · Cursos con resultados: '+d.courses+' · Aplicaciones completadas: '+d.applications+'.';
      box.appendChild(p);

      const note=document.createElement('div');
      note.className='call';
      const nb=document.createElement('b');
      nb.textContent='Lectura descriptiva institucional';
      const np=document.createElement('p');
      np.textContent='Los promedios corresponden a respuestas agregadas de la medición seleccionada. No constituyen un puntaje global de convivencia, diagnóstico clínico ni activación automática de protocolos. Su interpretación y priorización corresponden al equipo profesional.';
      note.append(nb,np);
      box.appendChild(note);

      const entries=Object.entries(d.dimension_summary||{});
      if(!entries.length){
        const empty=document.createElement('p');
        empty.textContent='No existen resultados dimensionales suficientes para esta medición.';
        box.appendChild(empty);
        return;
      }

      const ul=document.createElement('ul');
      entries.forEach(([code,v])=>{
        const li=document.createElement('li');
        li.textContent=code+' · '+(this.labels[code]||code)+' · '+v.answered+' respuestas · promedio descriptivo '+v.average;
        ul.appendChild(li);
      });
      box.appendChild(ul);

      const caution=document.createElement('p');
      caution.style.fontSize='11px';
      caution.style.color='#66788a';
      caution.textContent='Para comparar M1, M2 y M3 se recomienda revisar trayectoria, cobertura, condiciones de aplicación y evidencia de implementación antes de atribuir cambios a una intervención.';
      box.appendChild(caution);

      const a=document.createElement('a');
      a.className='btn primary';
      a.href='pgce-panel.html?establishment_id='+encodeURIComponent(id);
      a.textContent='Abrir Panel PGCE →';
      box.appendChild(a);
    }catch(e){
      box.textContent='No fue posible cargar los resultados institucionales.';
    }
  }
};
document.addEventListener('DOMContentLoaded',()=>MECInstitution.load());