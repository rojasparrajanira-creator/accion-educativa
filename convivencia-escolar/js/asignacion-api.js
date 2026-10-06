window.MECAssign={
  API:'https://convivencia-escolar-api.onrender.com',
  students:[],

  levelForCourse(name){
    const n=String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/º/g,'°').replace(/\s+/g,' ');
    if(/^\s*(i|ii)\s*°?(?:\s|$)/.test(n)) return '1-2-medio';
    if(/^\s*(iii|iv)\s*°?(?:\s|$)/.test(n)) return '3-4-medio';

    const compact=n.replace(/\s+/g,'');
    const short=compact.match(/^([1-4])°?(m|em)(?:[a-z]{0,3})?$/);
    if(short){
      const g=Number(short[1]);
      return g<=2?'1-2-medio':'3-4-medio';
    }

    const m=n.match(/^\s*([1-8])\s*°?\s*(.*)$/);
    if(!m) return '';
    const grade=Number(m[1]),rest=m[2]||'';
    const medio=/^(m|em)\b|\b(medio|media|ensenanza media|humanista|cientifico|tecnico|tp|hc)\b/.test(rest);

    if(medio){
      if(grade===1||grade===2) return '1-2-medio';
      if(grade===3||grade===4) return '3-4-medio';
      return '';
    }
    if(grade<=2) return '1-2';
    if(grade<=4) return '3-4';
    if(grade<=6) return '5-6';
    if(grade<=8) return '7-8';
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

  syncLevel(){
    const studentSel=document.getElementById('pa-student');
    const levelSel=document.getElementById('pa-level');
    const msg=document.getElementById('pa-msg');
    const create=document.getElementById('pa-create');
    if(!studentSel||!levelSel||!create)return;

    const student=this.students.find(x=>Number(x.id)===Number(studentSel.value));
    const level=this.levelForCourse(student?.course);
    levelSel.value=level;

    if(!level){
      create.disabled=true;
      msg.textContent='No fue posible identificar el nivel del curso. Revise el nombre del curso antes de generar el acceso.';
      return;
    }
    create.disabled=false;
    msg.textContent='Instrumento asignado automáticamente según el curso: '+this.levelLabel(level)+'.';
  },

  async init(){
    const root=document.getElementById('pilot-assign');
    if(!root)return;
    const q=new URLSearchParams(location.search);
    const eid=Number(q.get('establishment_id')||0);
    if(!eid){root.textContent='Falta el contexto del establecimiento.';return}
    try{
      const [sr,mr]=await Promise.all([
        fetch(this.API+'/api/students?establishment_id='+encodeURIComponent(eid)+'&active=true').then(r=>r.json()),
        fetch(this.API+'/api/measurements?establishment_id='+encodeURIComponent(eid)).then(r=>r.json())
      ]);
      if(!sr.ok||!mr.ok)throw new Error('load_failed');
      this.students=sr.students||[];
      const measures=mr.measurements||[];

      root.innerHTML=
        '<h3>Asignación de instrumento</h3>'+
        '<label>Estudiante <select id="pa-student">'+
          this.students.map(x=>'<option value="'+Number(x.id)+'">'+this.escape(x.name)+' · '+this.escape(x.course||'Sin curso')+'</option>').join('')+
        '</select></label> '+
        '<label>Instrumento <select id="pa-level" disabled>'+
          '<option value="">Curso no reconocido</option>'+
          '<option value="1-2">1°–2° básico</option>'+
          '<option value="3-4">3°–4° básico</option>'+
          '<option value="5-6">5°–6° básico</option>'+
          '<option value="7-8">7°–8° básico</option>'+
          '<option value="1-2-medio">I°–II° medio</option>'+
          '<option value="3-4-medio">III°–IV° medio</option>'+
        '</select></label> '+
        '<label>Medición <select id="pa-measure">'+
          measures.map(x=>'<option value="'+Number(x.id)+'">'+this.escape(x.code)+' · '+this.escape(x.school_year)+'</option>').join('')+
        '</select></label> '+
        '<button id="pa-create">Preparar acceso</button>'+
        '<p id="pa-msg" role="status" aria-live="polite"></p>';

      if(q.get('student_id'))document.getElementById('pa-student').value=q.get('student_id');
      if(q.get('measurement_id'))document.getElementById('pa-measure').value=q.get('measurement_id');

      if(!this.students.length||!measures.length){
        document.getElementById('pa-create').disabled=true;
        document.getElementById('pa-msg').textContent='No hay estudiante o medición disponible para este establecimiento.';
        return;
      }

      document.getElementById('pa-student').addEventListener('change',()=>this.syncLevel());
      document.getElementById('pa-create').onclick=()=>this.create();
      this.syncLevel();
    }catch(e){
      root.textContent='No fue posible cargar los datos para la asignación.';
    }
  },

  async create(){
    const student_id=Number(document.getElementById('pa-student').value);
    const measurement_id=Number(document.getElementById('pa-measure').value);
    const survey_level=document.getElementById('pa-level').value;
    const msg=document.getElementById('pa-msg');
    if(!survey_level){
      msg.textContent='No fue posible determinar el instrumento correspondiente al curso.';
      return;
    }
    try{
      const r=await fetch(this.API+'/api/applications',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({measurement_id,student_id,survey_level})
      });
      const d=await r.json();
      if(!d.ok){
        if(d.error==='survey_level_course_mismatch')throw new Error('El instrumento no corresponde al curso del estudiante.');
        if(d.error==='course_level_unrecognized')throw new Error('El nombre del curso no permite determinar el instrumento.');
        if(d.error==='establishment_mismatch')throw new Error('El estudiante y la medición pertenecen a establecimientos distintos.');
        throw new Error('No fue posible crear la aplicación.');
      }
      if(!d.application||!d.application.id)throw new Error('No fue posible preparar la aplicación.');
      const eid=new URLSearchParams(location.search).get('establishment_id')||'';
      msg.innerHTML='Aplicación preparada correctamente. <a href="configurar-aplicacion.html?establishment_id='+encodeURIComponent(eid)+'&measurement_id='+encodeURIComponent(measurement_id)+'">Continuar configuración →</a><br><small>El enlace estudiantil se generará en la etapa “Accesos seguros”, después de revisar la configuración.</small>';
    }catch(e){
      msg.textContent=e.message||'No fue posible preparar la aplicación.';
    }
  }
};
document.addEventListener('DOMContentLoaded',()=>window.MECAssign.init());