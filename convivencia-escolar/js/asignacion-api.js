window.MECAssign={
  API:'https://convivencia-escolar-api.onrender.com',
  students:[],
  courses:[],
  measures:[],
  eid:0,

  levelForCourse(name){
    const n=String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/º/g,'°').replace(/\s+/g,' ');
    if(/^\s*(i|ii)\s*°?(?:\s|$)/.test(n)) return '1-2-medio';
    if(/^\s*(iii|iv)\s*°?(?:\s|$)/.test(n)) return '3-4-medio';
    const compact=n.replace(/\s+/g,'');
    const short=compact.match(/^([1-4])°?(m|em)(?:[a-z]{0,3})?$/);
    if(short){const g=Number(short[1]);return g<=2?'1-2-medio':'3-4-medio'}
    const m=n.match(/^\s*([1-8])\s*°?\s*(.*)$/);
    if(!m)return '';
    const grade=Number(m[1]),rest=m[2]||'';
    const medio=/^(m|em)\b|\b(medio|media|ensenanza media|humanista|cientifico|tecnico|tp|hc)\b/.test(rest);
    if(medio){
      if(grade===1||grade===2)return '1-2-medio';
      if(grade===3||grade===4)return '3-4-medio';
      return '';
    }
    if(grade<=2)return '1-2';
    if(grade<=4)return '3-4';
    if(grade<=6)return '5-6';
    if(grade<=8)return '7-8';
    return '';
  },

  levelLabel(level){
    return ({
      '1-2':'1°–2° básico',
      '3-4':'3°–4° básico',
      '5-6':'5°–6° básico',
      '7-8':'7°–8° básico',
      '1-2-medio':'I°–II° medio',
      '3-4-medio':'III°–IV° medio'
    })[level]||'Curso no reconocido';
  },

  escape(s){
    return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  },

  currentMeasure(){
    return Number(document.getElementById('pa-measure')?.value||0);
  },

  measurementOptions(selected){
    return this.measures.map(x=>'<option value="'+Number(x.id)+'"'+(Number(x.id)===Number(selected)?' selected':'')+'>'+this.escape(x.code)+' · '+this.escape(x.school_year)+' · '+this.escape(x.status)+'</option>').join('');
  },

  setMode(mode){
    const individual=document.getElementById('pa-individual-panel'),course=document.getElementById('pa-course-panel');
    if(!individual||!course)return;
    individual.hidden=mode!=='individual';
    course.hidden=mode!=='course';
    document.querySelectorAll('[data-mode]').forEach(b=>{
      b.classList.toggle('primary',b.dataset.mode===mode);
      b.classList.toggle('secondary',b.dataset.mode!==mode);
    });
    if(mode==='individual')this.syncIndividual();
    else this.syncCourse();
  },

  syncIndividual(){
    const studentSel=document.getElementById('pa-student'),level=document.getElementById('pa-individual-level'),msg=document.getElementById('pa-individual-msg'),btn=document.getElementById('pa-individual-create');
    if(!studentSel||!level||!msg||!btn)return;
    const student=this.students.find(x=>Number(x.id)===Number(studentSel.value));
    const survey=this.levelForCourse(student?.course);
    level.textContent=survey?this.levelLabel(survey):'Curso no reconocido';
    btn.disabled=!student||!survey||!this.currentMeasure();
    msg.textContent=survey?'Instrumento automático: '+this.levelLabel(survey)+'. El acceso seguro se genera después.':'No fue posible identificar el nivel de este curso.';
  },

  syncCourse(){
    const sel=document.getElementById('pa-course'),level=document.getElementById('pa-course-level'),count=document.getElementById('pa-course-count'),msg=document.getElementById('pa-course-msg'),btn=document.getElementById('pa-course-create');
    if(!sel||!level||!count||!msg||!btn)return;
    const course=this.courses.find(x=>Number(x.id)===Number(sel.value));
    const survey=this.levelForCourse(course?.name);
    const active=this.students.filter(x=>Number(x.course_id)===Number(course?.id)&&x.active!==false);
    level.textContent=survey?this.levelLabel(survey):'Curso no reconocido';
    count.textContent=active.length+' estudiante(s) activo(s)';
    btn.disabled=!course||!survey||!active.length||!this.currentMeasure();
    msg.textContent=!survey?'El nombre del curso no permite determinar el instrumento.':!active.length?'Este curso no tiene estudiantes activos.':'Se prepararán aplicaciones para '+active.length+' estudiante(s). Las aplicaciones existentes no se duplican ni reinician.';
  },

  async init(){
    const root=document.getElementById('pilot-assign');
    if(!root)return;
    const q=new URLSearchParams(location.search);
    this.eid=Number(q.get('establishment_id')||0);
    if(!this.eid){root.textContent='Falta el contexto del establecimiento.';return}

    try{
      const [sr,cr,mr]=await Promise.all([
        fetch(this.API+'/api/students?establishment_id='+encodeURIComponent(this.eid)+'&active=true').then(r=>r.json()),
        fetch(this.API+'/api/courses?establishment_id='+encodeURIComponent(this.eid)).then(r=>r.json()),
        fetch(this.API+'/api/measurements?establishment_id='+encodeURIComponent(this.eid)).then(r=>r.json())
      ]);
      if(!sr.ok||!cr.ok||!mr.ok)throw new Error('load_failed');
      this.students=sr.students||[];
      this.courses=cr.courses||[];
      this.measures=mr.measurements||[];

      const preferredMeasure=Number(q.get('measurement_id')||this.measures[0]?.id||0);
      const preferredStudent=Number(q.get('student_id')||0);
      const preferredCourse=Number(q.get('course_id')||this.students.find(x=>Number(x.id)===preferredStudent)?.course_id||this.courses[0]?.id||0);
      const defaultMode=preferredStudent?'individual':'course';

      root.innerHTML=
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">'+
          '<button type="button" class="btn" data-mode="course">Curso completo</button>'+
          '<button type="button" class="btn" data-mode="individual">Estudiante individual</button>'+
        '</div>'+
        '<div class="field" style="max-width:360px;margin-bottom:18px"><label>Medición</label><select id="pa-measure">'+this.measurementOptions(preferredMeasure)+'</select></div>'+
        '<section id="pa-course-panel">'+
          '<h3>Asignar a un curso completo</h3>'+
          '<p class="hint">Recomendado para la aplicación institucional. El instrumento se determina automáticamente según el curso.</p>'+
          '<div class="fields">'+
            '<div class="field"><label>Curso</label><select id="pa-course">'+this.courses.map(x=>'<option value="'+Number(x.id)+'"'+(Number(x.id)===preferredCourse?' selected':'')+'>'+this.escape(x.name)+' · '+this.escape(x.school_year)+'</option>').join('')+'</select></div>'+
            '<div class="field"><label>Instrumento automático</label><div id="pa-course-level" style="padding:12px;border:1px solid #cfdee4;border-radius:12px;background:#f7fbfc">—</div></div>'+
          '</div>'+
          '<p id="pa-course-count" class="hint" style="margin-top:12px"></p>'+
          '<button id="pa-course-create" class="btn primary" type="button">Preparar aplicaciones del curso</button>'+
          '<p id="pa-course-msg" role="status" aria-live="polite" class="hint" style="margin-top:12px"></p>'+
        '</section>'+
        '<section id="pa-individual-panel" hidden>'+
          '<h3>Asignación individual</h3>'+
          '<p class="hint">Utilízala para casos puntuales o para el piloto ficticio.</p>'+
          '<div class="fields">'+
            '<div class="field"><label>Estudiante</label><select id="pa-student">'+this.students.map(x=>'<option value="'+Number(x.id)+'"'+(Number(x.id)===preferredStudent?' selected':'')+'>'+this.escape(x.name)+' · '+this.escape(x.course||'Sin curso')+'</option>').join('')+'</select></div>'+
            '<div class="field"><label>Instrumento automático</label><div id="pa-individual-level" style="padding:12px;border:1px solid #cfdee4;border-radius:12px;background:#f7fbfc">—</div></div>'+
          '</div>'+
          '<button id="pa-individual-create" class="btn primary" type="button" style="margin-top:12px">Preparar aplicación individual</button>'+
          '<p id="pa-individual-msg" role="status" aria-live="polite" class="hint" style="margin-top:12px"></p>'+
        '</section>';

      if(!this.students.length||!this.courses.length||!this.measures.length){
        root.insertAdjacentHTML('beforeend','<p class="hint">Debes contar con matrícula, cursos y al menos una medición para realizar asignaciones.</p>');
      }

      document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>this.setMode(b.dataset.mode));
      document.getElementById('pa-measure').onchange=()=>{this.syncIndividual();this.syncCourse()};
      document.getElementById('pa-student').onchange=()=>this.syncIndividual();
      document.getElementById('pa-course').onchange=()=>this.syncCourse();
      document.getElementById('pa-individual-create').onclick=()=>this.createIndividual();
      document.getElementById('pa-course-create').onclick=()=>this.createCourse();
      this.setMode(defaultMode);
    }catch(e){
      root.textContent='No fue posible cargar los datos para la asignación.';
    }
  },

  async createIndividual(){
    const studentId=Number(document.getElementById('pa-student').value),measurementId=this.currentMeasure();
    const student=this.students.find(x=>Number(x.id)===studentId);
    const surveyLevel=this.levelForCourse(student?.course);
    const msg=document.getElementById('pa-individual-msg');
    if(!surveyLevel){msg.textContent='No fue posible determinar el instrumento correspondiente al curso.';return}
    const btn=document.getElementById('pa-individual-create');btn.disabled=true;
    try{
      const r=await fetch(this.API+'/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({measurement_id:measurementId,student_id:studentId,survey_level:surveyLevel})});
      const d=await r.json();
      if(!r.ok||!d.ok){
        if(d.error==='application_already_completed')throw new Error('Esta aplicación ya fue completada y se conserva sin cambios.');
        if(d.error==='application_already_started')throw new Error('Esta aplicación ya está en curso y se conserva sin cambios.');
        throw new Error('No fue posible preparar la aplicación.');
      }
      msg.innerHTML=(d.created?'Aplicación creada.':'La aplicación ya existía y se conservó.')+' <a href="configurar-aplicacion.html?establishment_id='+encodeURIComponent(this.eid)+'&measurement_id='+encodeURIComponent(measurementId)+'">Continuar configuración →</a><br><small>El acceso estudiantil se genera únicamente en “Accesos seguros”.</small>';
    }catch(e){msg.textContent=e.message||'No fue posible preparar la aplicación.'}finally{btn.disabled=false}
  },

  async createCourse(){
    const courseId=Number(document.getElementById('pa-course').value),measurementId=this.currentMeasure();
    const msg=document.getElementById('pa-course-msg'),btn=document.getElementById('pa-course-create');
    btn.disabled=true;msg.textContent='Preparando aplicaciones del curso…';
    try{
      const r=await fetch(this.API+'/api/applications/bulk-course',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({course_id:courseId,measurement_id:measurementId})});
      const d=await r.json();
      if(!r.ok||!d.ok){
        if(d.error==='course_without_active_students')throw new Error('El curso no tiene estudiantes activos.');
        if(d.error==='course_level_unrecognized')throw new Error('No fue posible reconocer el nivel del curso.');
        throw new Error('No fue posible preparar las aplicaciones del curso.');
      }
      msg.innerHTML='<strong>Asignación de curso preparada.</strong><br>'+d.created+' nueva(s) · '+d.existing+' ya existente(s) · '+d.preserved_locked+' en curso/completada(s) preservada(s).<br><a href="configurar-aplicacion.html?establishment_id='+encodeURIComponent(this.eid)+'&measurement_id='+encodeURIComponent(measurementId)+'">Continuar configuración →</a><br><small>Los accesos estudiantiles se generan después, sin duplicar ni reiniciar aplicaciones.</small>';
    }catch(e){msg.textContent=e.message||'No fue posible preparar las aplicaciones.'}finally{btn.disabled=false;this.syncCourse()}
  }
};
document.addEventListener('DOMContentLoaded',()=>window.MECAssign.init());