'use strict';
// Renders the institutional welcome message without persisting its temporary PIN.
function escapeHtml(value){
  return String(value??'').trim().replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function activationEmail(est,pin){
  if(!est||typeof est!=='object'||!est.rbd||!est.name||!pin)throw Error('Incomplete institutional credentials');
  const contact=escapeHtml(est.contact_name||'responsable del establecimiento');
  const institution=escapeHtml(est.name);
  const rbd=escapeHtml(est.rbd);
  const password=escapeHtml(pin);
  const until=est.expires_at?new Date(est.expires_at):null;
  const expiration=until&&Number.isFinite(until.getTime())
    ?escapeHtml(until.toLocaleDateString('es-CL',{timeZone:'America/Santiago'}))
    :'Por confirmar';
  const url='https://idps-gestion-material-educativo.onrender.com/';
  const html=
    '<div style="margin:0;padding:24px 16px;background:#F5F9FC;font-family:Arial,Helvetica,sans-serif;color:#173957;line-height:1.6">'+
      '<div style="max-width:620px;margin:auto;background:#FFFFFF;border:1px solid #DEEBF3;border-radius:16px;overflow:hidden">'+
        '<div style="background:#0979C7;padding:22px 28px;color:#FFFFFF">'+
          '<div style="font-size:14px;letter-spacing:.03em;font-weight:700">MATERIAL EDUCATIVO CHILE 🇨🇱</div>'+
          '<div style="font-size:25px;font-weight:700;margin-top:6px">¡Bienvenida a IDPS!</div>'+
        '</div>'+
        '<div style="padding:26px 28px">'+
          '<p style="margin:0 0 16px;font-size:18px"><strong>¡Hola, '+contact+'!</strong> 💙</p>'+
          '<p>Te damos la bienvenida a la <strong>Plataforma de Indicadores de Desarrollo Personal y Social (IDPS) de Material Educativo Chile</strong>.</p>'+
          '<p>Tu cuenta institucional ya se encuentra habilitada.</p>'+
          '<p>Nuestra plataforma te permitirá <strong>evaluar, analizar y realizar seguimiento de los indicadores de desarrollo personal y social</strong>, facilitando la toma de decisiones y la planificación de acciones de mejora para tu comunidad educativa.</p>'+
          '<div style="background:#EEF8FC;border-radius:12px;padding:16px 20px;margin:22px 0">'+
            '<div style="font-weight:700;font-size:16px;margin-bottom:8px">Tus datos de acceso</div>'+
            '<div><strong>Establecimiento:</strong> '+institution+'</div>'+
            '<div><strong>RBD:</strong> '+rbd+'</div>'+
            '<div><strong>PIN:</strong> '+password+'</div>'+
            '<div><strong>Vigencia:</strong> '+expiration+'</div>'+
          '</div>'+
          '<p style="margin:22px 0"><a href="'+url+'" style="background:#0084CC;color:#FFFFFF;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700;display:inline-block">Ingresar a la plataforma IDPS</a></p>'+
          '<p style="font-size:13px;color:#60768B">Conserva tu PIN de acceso de manera privada y segura.</p>'+
          '<p>¡Gracias por confiar en nosotros!</p>'+
          '<p style="margin-bottom:0"><strong>Material Educativo Chile</strong> 🇨🇱<br><span style="font-size:13px;color:#60768B">Recursos y soluciones para la educación.</span></p>'+
        '</div>'+
      '</div>'+
    '</div>';
  return {subject:'¡Te damos la bienvenida a la Plataforma IDPS! · Material Educativo Chile',html};
}
module.exports=activationEmail;
