window.MECReportExport={
  unicodeRtf(text){
    return String(text??'').replace(/\\/g,'\\\\').replace(/[{}]/g,m=>'\\'+m).replace(/[^\x00-\x7F]/g,ch=>{
      const code=ch.charCodeAt(0);
      const signed=code>32767?code-65536:code;
      return '\\u'+signed+'?';
    });
  },
  filename(base){
    const clean=String(base||'informe').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
    const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    return (clean||'informe')+'-'+date+'.rtf';
  },
  installPrivacyLifecycle(){
    // El navegador puede restaurar una página con datos escolares desde su historial.
    // Ocultamos el informe al salir y forzamos comprobar la sesión si vuelve desde BFCache.
    window.addEventListener('pagehide',()=>{
      this.setReady(false);
      const report=document.querySelector('.report');
      if(report)report.style.visibility='hidden';
    });
    window.addEventListener('pageshow',event=>{
      if(event.persisted)window.location.reload();
    });
  },
  setReady(ready){
    const root=document.querySelector('.report');
    if(root)root.dataset.reportReady=ready?'true':'false';
    for(const button of document.querySelectorAll('[data-report-action]')){
      button.disabled=!ready;
      button.title=ready?'': 'Espera a que se validen y carguen los resultados del informe.';
    }
    const note=document.getElementById('report-export-status');
    if(note)note.textContent=ready
      ?'Informe listo para imprimir o descargar. Verifica los antecedentes antes de compartirlo.'
      :'La descarga y la impresión se habilitarán al cargar los resultados del informe.';
  },
  ready(root){
    return !!root&&root.dataset.reportReady==='true';
  },
  print(){
    if(!this.ready(document.querySelector('.report'))){
      alert('No es posible imprimir: el informe aún no tiene resultados verificados.');
      return false;
    }
    window.print();
    return true;
  },
  download(options={}){
    const root=document.querySelector(options.root||'.report');
    if(!this.ready(root)){alert('No es posible descargar: espera a que se validen y carguen los resultados del informe.');return false}
    const lines=String(root.innerText||root.textContent||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    if(!lines.length){alert('El informe todavía no contiene información para descargar.');return false}

    const body=lines.map((line,index)=>{
      const text=this.unicodeRtf(line);
      if(index===0)return '\\pard\\qc\\b\\fs28 '+text+'\\b0\\fs24\\par';
      return '\\pard\\qj\\sl360\\slmult1\\fs24 '+text+'\\par';
    }).join('\n');

    const rtf='{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\viewkind4\\uc1\n'+
      '\\f0\\fs24 '+body+'\n}';
    const blob=new Blob([rtf],{type:'application/rtf;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=this.filename(options.filename||document.title||'informe');
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
    return true;
  }
};
document.addEventListener('DOMContentLoaded',()=>MECReportExport.installPrivacyLifecycle());
