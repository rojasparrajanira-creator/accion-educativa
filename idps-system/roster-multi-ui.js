const express = require('express');

// Make the SIGE roster uploader explicit and easy to use: users can add
// files one-by-one (up to 10), while the existing backend receives all
// fields under the same `roster` name via upload.array('roster', 10).
const originalSend = express.response.send;

express.response.send = function rosterMultiFileUi(body) {
  try {
    const path = this.req && (this.req.originalUrl || this.req.url || '');
    if (typeof body === 'string' && /^\/panel\/estudiantes(?:[?#]|$)/.test(path)) {
      body = body
        .replace(
          /<p>Puede actualizar la nómina mediante el archivo <b>\.xls exportado desde SIGE<\/b>\.<\/p>/i,
          '<p>Puedes cargar <b>hasta 10 archivos .xls exportados desde SIGE</b> en una sola importación.</p>'
        )
        .replace(
          /<p>La plataforma permite seleccionar y cargar <b>hasta 10 archivos \.xls exportados desde SIGE en una sola importación<\/b>\.<\/p>/i,
          '<p>Puedes cargar <b>hasta 10 archivos .xls exportados desde SIGE</b> en una sola importación.</p>'
        )
        .replace(
          /<input\s+type="file"\s+name="roster"\s+accept="\.xls,\.html"[^>]*>/i,
          `<div id="rosterFileList" style="display:grid;gap:10px;max-width:760px">
            <div class="roster-file-row"><input type="file" name="roster" accept=".xls,.html" required></div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:12px 0 4px">
            <button type="button" class="btn secondary" id="addRosterFile">+ Agregar otro archivo</button>
            <span class="muted" id="rosterFileCount">1 de 10 archivos</span>
          </div>
          <script>
          (function(){
            const list=document.getElementById('rosterFileList');
            const add=document.getElementById('addRosterFile');
            const count=document.getElementById('rosterFileCount');
            if(!list||!add||!count) return;
            function refresh(){
              const n=list.querySelectorAll('input[type=file][name=roster]').length;
              count.textContent=n+' de 10 archivos';
              add.disabled=n>=10;
              add.style.opacity=n>=10?'.55':'1';
            }
            add.addEventListener('click',function(){
              const n=list.querySelectorAll('input[type=file][name=roster]').length;
              if(n>=10) return;
              const row=document.createElement('div');
              row.className='roster-file-row';
              row.style.display='flex';
              row.style.gap='8px';
              row.style.alignItems='center';
              row.innerHTML='<input type="file" name="roster" accept=".xls,.html" style="flex:1"><button type="button" class="btn secondary" style="padding:9px 12px">Quitar</button>';
              row.querySelector('button').addEventListener('click',function(){row.remove();refresh();});
              list.appendChild(row);
              refresh();
            });
            refresh();
          })();
          </script>`
        )
        .replace(
          /<p class="muted">Puedes seleccionar hasta 10 archivos a la vez\.[\s\S]*?<\/p>/i,
          '<p class="muted">Agrega los archivos uno por uno con “+ Agregar otro archivo”. Puedes cargar hasta 10 nóminas antes de presionar “Importar nómina”.</p>'
        )
        .replace(
          /<p class="muted">Se importan únicamente datos necesarios para identificar estudiante, curso y nivel\.[\s\S]*?<\/p>/i,
          '<p class="muted">Agrega los archivos uno por uno con “+ Agregar otro archivo”. Puedes cargar hasta 10 nóminas antes de presionar “Importar nómina”.</p>'
        );
    }
  } catch (err) {
    console.error('[ROSTER_MULTI_UI]', err.message);
  }
  return originalSend.call(this, body);
};
