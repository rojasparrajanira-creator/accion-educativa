const express = require('express');

// Mobile-safe SIGE uploader. Instead of relying on the browser's native
// multi-file picker (which is inconsistent on iPhone), render ten explicit
// file slots. The existing backend already accepts upload.array('roster', 10).
const previousListen = express.application.listen;

function fileSlotsHtml(){
  const slots=[];
  for(let i=1;i<=10;i++){
    slots.push(`<label style="display:block;font-weight:800;color:#0F2D52">Archivo ${i}${i===1?' *':''}<input type="file" name="roster" accept=".xls,.html" ${i===1?'required':''} style="display:block;width:100%;margin-top:6px"></label>`);
  }
  return `<div id="rosterTenSlots" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;max-width:980px;margin:14px 0">${slots.join('')}</div>`;
}

express.application.listen=function rosterMultiUiListen(...args){
  if(!this.__rosterMultiUiMiddleware){
    this.__rosterMultiUiMiddleware=true;
    this.use((req,res,next)=>{
      const path=req.originalUrl||req.url||'';
      if(!/^\/panel\/estudiantes(?:[/?#]|$)/.test(path)) return next();

      const originalSend=res.send.bind(res);
      res.send=function(body){
        try{
          if(typeof body==='string' && !body.includes('id="rosterTenSlots"')){
            body=body
              .replace(
                /<p>La plataforma permite seleccionar y cargar <b>hasta 10 archivos \.xls exportados desde SIGE en una sola importación<\/b>\.<\/p>/i,
                '<p>Puedes cargar <b>entre 1 y 10 archivos .xls exportados desde SIGE</b> en una sola importación.</p>'
              )
              .replace(
                /<input[^>]*type="file"[^>]*name="roster"[^>]*>/i,
                fileSlotsHtml()
              )
              .replace(
                /<p class="muted">Puedes seleccionar hasta 10 archivos a la vez\.[\s\S]*?<\/p>/i,
                '<p class="muted">Usa un espacio por cada nómina SIGE. El primer archivo es obligatorio y los demás son opcionales. Puedes adjuntar hasta 10 antes de presionar “Importar nómina”.</p>'
              );
          }
        }catch(err){
          console.error('[ROSTER_MULTI_UI]',err.message);
        }
        return originalSend(body);
      };
      next();
    });
  }
  return previousListen.apply(this,args);
};
