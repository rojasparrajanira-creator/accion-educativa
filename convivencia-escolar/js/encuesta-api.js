(()=>{
  const q=new URLSearchParams(location.search);
  window.MECSurvey={
    API:'https://convivencia-escolar-api.onrender.com',
    applicationId:q.get('application_id'),
    accessToken:q.get('access'),

    async context(){
      if(!this.applicationId||!this.accessToken)throw new Error('student_access_missing');
      const r=await fetch(this.API+'/api/applications/'+encodeURIComponent(this.applicationId)+'/context?access='+encodeURIComponent(this.accessToken));
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
        body:JSON.stringify({access:this.accessToken,responses})
      });
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||'save_failed');
      return {ok:true,application_id:this.applicationId,next:'encuesta-completada.html'};
    },

    async savePilot(level,value){
      const map={'1-2':'D01_01','3-4':'D01_01','5-6':'D01_01','7-8':'D01_01','1-2-medio':'D01_01','3-4-medio':'D01_01'};
      return this.save([{item_code:map[level]||'D01_01',value:Number(value)}]);
    }
  };
})();