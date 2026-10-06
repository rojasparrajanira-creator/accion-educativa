(()=>{
  const q=new URLSearchParams(location.search);
  const applicationId=q.get('application_id');
  const storageKey=applicationId?'mec_student_access_'+applicationId:'';
  const fromUrl=q.get('access');
  if(applicationId&&fromUrl){
    try{sessionStorage.setItem(storageKey,fromUrl)}catch(e){}
    q.delete('access');
    const clean=location.pathname+(q.toString()?'?'+q.toString():'')+location.hash;
    history.replaceState(null,'',clean);
  }
  const token=fromUrl||(storageKey?sessionStorage.getItem(storageKey):null);

  window.MECSurvey={
    API:'https://convivencia-escolar-api.onrender.com',
    applicationId,
    accessToken:token,

    async context(){
      if(!this.applicationId||!this.accessToken)throw new Error('student_access_missing');
      const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(this.applicationId)+'/context?access='+encodeURIComponent(this.accessToken),{
        cache:'no-store',
        referrerPolicy:'no-referrer'
      });
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'context_failed');
      return d;
    },

    async save(responses){
      if(!this.applicationId||!this.accessToken)throw new Error('student_access_missing');
      if(!Array.isArray(responses)||!responses.length)throw new Error('responses_missing');
      const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(this.applicationId)+'/responses',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        referrerPolicy:'no-referrer',
        body:JSON.stringify({access:this.accessToken,responses})
      });
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'save_failed');
      try{sessionStorage.removeItem(storageKey)}catch(e){}
      return {ok:true,application_id:this.applicationId,next:'encuesta-completada.html'};
    },

    async savePilot(level,value){
      const map={'1-2':'D01_01','3-4':'D01_01','5-6':'D01_01','7-8':'D01_01','1-2-medio':'D01_01','3-4-medio':'D01_01'};
      return this.save([{item_code:map[level]||'D01_01',value:Number(value)}]);
    }
  };
})();