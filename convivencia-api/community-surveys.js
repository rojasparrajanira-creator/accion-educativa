'use strict';
// Módulo opt-in: nunca registrar rutas si la variable de habilitación no es "1".
// Las personas adultas reciben un código aleatorio + PIN de 8 dígitos.
// La relación apoderado/estudiante se acredita previamente por el equipo autorizado.
const crypto=require('node:crypto');
const C=require('./community-surveys-core.cjs');
const PGCE=require('./pgce-dimensions-integrated-2027.cjs');
const studentDimensions=require('./student-dimensions-adapter-2027.cjs');
const pgceDrafts=require('./pgce-planning-drafts-2027.cjs');
const pgceFollowup=require('./pgce-follow-up-2027.cjs');
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const sendError=(res,status,error)=>res.status(status).json({ok:false,error});
const noStore=(req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');next()};
const goodCode=v=>/^[a-zA-Z0-9_-]{32}$/.test(v);
const goodPin=v=>/^\d{8}$/.test(v);
function registerCommunitySurveys({app,pool,requireRole,rateLimit,accessStatus,allowedOrigins}){
 if(process.env.MEC_COMMUNITY_SURVEYS_ENABLED!=='1')return false;
 const admin=requireRole('coordinador_convivencia','dupla_psicosocial','director','directora');
 const publicRate=rateLimit({windowMs:60000,max:8});
 const adminRate=rateLimit({windowMs:60000,max:25});
 const active=async inv=>!accessStatus||await accessStatus(inv.establishment_id);
 // Evitar cambios desde sitios ajenos mediante cookies de sesión del profesional.
 const trustedOrigin=(req,res,next)=>{
  const origin=String(req.headers.origin||'');
  if(origin && !(allowedOrigins instanceof Set && allowedOrigins.has(origin)))
   return sendError(res,403,'origin_forbidden');
  next();
 };


 // Consulta exclusiva del equipo responsable. Nunca expone RUN ni claves.
 app.get('/api/community-surveys/targets',...admin,adminRate,noStore,async(req,res)=>{
  const establishmentId=C.safePositiveInt(req.auth.establishment_id);
  const audience=String(req.query.audience||'');
  if(!establishmentId||!C.audienceKeys.has(audience))return sendError(res,400,'invalid_audience');
  try{
   if(audience==='familia'){
    const q=await pool.query("select s.id,s.name,c.name as course from students s left join courses c on c.id=s.course_id and c.establishment_id=s.establishment_id where s.establishment_id=$1 and s.active=true order by s.name limit 1000",[establishmentId]);
    return res.json({ok:true,audience,targets:q.rows.map(x=>({id:x.id,name:x.name,extra:x.course||''}))});
   }
   const q=await pool.query('select id,name,role from users where establishment_id=$1 and active=true order by name limit 1000',[establishmentId]);
   return res.json({ok:true,audience,targets:q.rows.filter(x=>C.assignedRole(x.role,audience)).map(x=>({id:x.id,name:x.name,extra:x.role}))});
  }catch(e){return sendError(res,503,'targets_unavailable')}
 });

 app.post('/api/community-surveys/invitations',...admin,adminRate,trustedOrigin,noStore,async(req,res)=>{
  const b=req.body||{},est=C.safePositiveInt(req.auth.establishment_id),audience=String(b.audience||'');
  const studentId=audience==='familia'?C.safePositiveInt(b.student_id):null;
  const staffId=audience!=='familia'?C.safePositiveInt(b.staff_user_id):null;
  const slot=audience==='familia'?Number(b.guardian_slot):null;
  const evidence=typeof b.verification_reference==='string'?b.verification_reference.trim():'';
  if(!est||Number(b.school_year)!==2027||!C.audienceKeys.has(audience))return sendError(res,400,'invalid_invitation');
  if(audience==='familia'&&(!studentId||![1,2].includes(slot)||b.relation_verified!==true||evidence.length<6||evidence.length>150))
    return sendError(res,400,'verified_family_link_required');
  if(audience!=='familia'&&!staffId)return sendError(res,400,'staff_assignment_required');
  try{
   if(audience==='familia'){
    const q=await pool.query('select id from students where id=$1 and establishment_id=$2 and active=true',[studentId,est]);
    if(!q.rowCount)return sendError(res,404,'target_not_found');
   }else{
    const q=await pool.query('select role from users where id=$1 and establishment_id=$2 and active=true',[staffId,est]);
    if(!q.rowCount||!C.assignedRole(q.rows[0].role,audience))return sendError(res,404,'target_not_found');
   }
   const code=C.randomCode(),pin=C.randomPin(),salt=crypto.randomBytes(16).toString('hex');
   const hash=await C.hashPin(pin,salt);
   const client=await pool.connect();
   try{
    await client.query('begin');
    const q=await client.query('insert into community_survey_invitations (establishment_id,school_year,audience,student_id,guardian_slot,staff_user_id,link_verified_by,link_evidence_ref,code_hash,pin_salt,pin_hash,expires_at,issued_by) values($1,2027,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval \'30 days\',$11) returning id,expires_at',
     [est,audience,studentId,slot,staffId,audience==='familia'?req.auth.id:null,audience==='familia'?evidence:null,
      C.sha(code),salt,hash,req.auth.id]);
    await client.query("insert into community_survey_audit_events(establishment_id,performed_by,invitation_id,action) values($1,$2,$3,'issued')",[est,req.auth.id,q.rows[0].id]);
    await client.query('commit');
    return res.status(201).json({ok:true,invitation_id:q.rows[0].id,invite_code:code,pin,expires_at:q.rows[0].expires_at,delivery_note:'Entregar código y PIN en comunicaciones separadas. Solo se muestran una vez.'});
   }catch(e){await client.query('rollback');return sendError(res,e.code==='23505'?409:503,e.code==='23505'?'existing_active_invitation':'invitation_unavailable')}
   finally{client.release()}
  }catch(e){return sendError(res,503,'invitation_unavailable')}
 });

 app.post('/api/community-surveys/invitations/:id/revoke',...admin,adminRate,trustedOrigin,noStore,async(req,res)=>{
  const id=C.safePositiveInt(req.params.id),est=C.safePositiveInt(req.auth.establishment_id);
  if(!id||!est)return sendError(res,400,'invalid_invitation');
  const client=await pool.connect();
  try{
   await client.query('begin');
   const q=await client.query('update community_survey_invitations set revoked_at=now() where id=$1 and establishment_id=$2 and revoked_at is null returning id',[id,est]);
   if(!q.rowCount){await client.query('rollback');return sendError(res,404,'invitation_not_found')}
   await client.query('delete from community_survey_sessions where invitation_id=$1',[id]);
   await client.query("insert into community_survey_audit_events(establishment_id,performed_by,invitation_id,action) values($1,$2,$3,'revoked')",[est,req.auth.id,id]);
   await client.query('commit');return res.json({ok:true,revoked:true});
  }catch(e){await client.query('rollback');return sendError(res,503,'revocation_unavailable')}
  finally{client.release()}
 });

 app.post('/api/community-surveys/redeem',publicRate,noStore,async(req,res)=>{
  const code=String(req.body?.invite_code||'').trim(),pin=String(req.body?.pin||'').trim();
  if(!goodCode(code)||!goodPin(pin))return sendError(res,401,'invalid_credentials');
  const client=await pool.connect();
  try{
   await client.query('begin');
   const q=await client.query('select * from community_survey_invitations where code_hash=$1 for update',[C.sha(code)]);
   const inv=q.rows[0];
   if(!inv||inv.revoked_at||new Date(inv.expires_at)<=new Date()||(inv.locked_until&&new Date(inv.locked_until)>new Date())){
    await client.query('rollback');return sendError(res,401,'invalid_credentials');
   }
   if(!(await active(inv))){await client.query('rollback');return sendError(res,403,'access_unavailable')}
   const actual=Buffer.from(await C.hashPin(pin,inv.pin_salt),'hex'),stored=Buffer.from(inv.pin_hash,'hex');
   if(actual.length!==stored.length||!crypto.timingSafeEqual(actual,stored)){
    await client.query('update community_survey_invitations set failed_attempts=case when failed_attempts+1>=5 then 0 else failed_attempts+1 end, locked_until=case when failed_attempts+1>=5 then now()+interval \'15 minutes\' else locked_until end where id=$1',[inv.id]);
    await client.query('commit');return sendError(res,401,'invalid_credentials');
   }
   const done=await client.query('select 1 from community_survey_submissions where invitation_id=$1',[inv.id]);
   if(done.rowCount){await client.query('rollback');return sendError(res,409,'already_submitted')}
   await client.query('update community_survey_invitations set failed_attempts=0,locked_until=null where id=$1',[inv.id]);
   const token=C.randomCode();
   await client.query("insert into community_survey_sessions(session_hash,invitation_id,expires_at) values($1,$2,now()+interval '25 minutes')",[C.sha(token),inv.id]);
   await client.query('commit');
   return res.json({ok:true,session_token:token,audience:inv.audience,school_year:inv.school_year,
    bank_version:C.bank.version,expires_minutes:25,
    questions:C.bank.audiences[inv.audience].items.map(x=>({id:x.id,wording:x.wording,dimension:x.dimension})),
    scale:C.bank.scale});
  }catch(e){try{await client.query('rollback')}catch(_){}return sendError(res,503,'login_unavailable')}
  finally{client.release()}
 });

 app.post('/api/community-surveys/submit',publicRate,noStore,async(req,res)=>{
  const token=String(req.headers['x-community-access']||'').trim();
  if(!goodCode(token))return sendError(res,401,'invalid_access');
  const client=await pool.connect();
  try{
   await client.query('begin');
   const q=await client.query('select i.id,i.establishment_id,i.school_year,i.audience,i.expires_at,i.revoked_at from community_survey_sessions s join community_survey_invitations i on i.id=s.invitation_id where s.session_hash=$1 and s.expires_at>now() for update of i',[C.sha(token)]);
   const inv=q.rows[0];
   if(!inv||inv.revoked_at||new Date(inv.expires_at)<=new Date()){await client.query('rollback');return sendError(res,401,'invalid_access')}
   if(!(await active(inv))){await client.query('rollback');return sendError(res,403,'access_unavailable')}
   try{C.validateAnswers(inv.audience,req.body?.answers)}
   catch(e){await client.query('rollback');return sendError(res,400,'invalid_answers')}
   const inserted=await client.query('insert into community_survey_submissions (invitation_id,establishment_id,school_year,audience,bank_version,answers) values($1,$2,$3,$4,$5,$6::jsonb) on conflict(invitation_id) do nothing returning id',
    [inv.id,inv.establishment_id,inv.school_year,inv.audience,C.bank.version,JSON.stringify(req.body.answers)]);
   if(!inserted.rowCount){await client.query('rollback');return sendError(res,409,'already_submitted')}
   await client.query('delete from community_survey_sessions where invitation_id=$1',[inv.id]);
   await client.query("insert into community_survey_audit_events(establishment_id,invitation_id,action) values($1,$2,'submitted')",[inv.establishment_id,inv.id]);
   await client.query('commit');return res.status(201).json({ok:true,submitted:true});
  }catch(e){try{await client.query('rollback')}catch(_){}return sendError(res,503,'submission_unavailable')}
  finally{client.release()}
 });

 app.get('/api/community-surveys/report',...admin,noStore,async(req,res)=>{
  const est=C.safePositiveInt(req.auth.establishment_id),audience=String(req.query.audience||'');
  if(!est||Number(req.query.school_year)!==2027||!C.audienceKeys.has(audience))return sendError(res,400,'invalid_report');
  try{
   const q=await pool.query('select answers from community_survey_submissions where establishment_id=$1 and school_year=2027 and audience=$2 and bank_version=$3',[est,audience,C.bank.version]);
   return res.json({ok:true,school_year:2027,...C.makeAggregate(q.rows,audience)});
  }catch(e){return sendError(res,503,'report_unavailable')}
 });

 // Preinforme estrictamente agregado; no contiene respuestas por persona.
 app.get('/api/community-surveys/diagnostic-draft',...admin,noStore,async(req,res)=>{
  const est=C.safePositiveInt(req.auth.establishment_id);
  if(!est||Number(req.query.school_year)!==2027)return sendError(res,400,'invalid_diagnostic_request');
  try{
   const q=await pool.query(
    'select audience,answers from community_survey_submissions where establishment_id=$1 and school_year=2027 and bank_version=$2',
    [est,C.bank.version]);
   const reports=Object.create(null);
   for(const audience of C.audienceKeys)
    reports[audience]=C.makeAggregate(q.rows.filter(x=>x.audience===audience),audience);
   return res.json({ok:true,diagnostic:C.makeDiagnosticDraft(reports)});
  }catch(e){return sendError(res,503,'diagnostic_unavailable')}
 });

 // Dimensiones y plan 2027 exclusivamente desde agregados del mismo establecimiento.
 // Nunca aceptar filas, recuentos o resultados estudiantiles desde parámetros del cliente.
 async function getInstitutionDimensionReport(req){
   const establishmentId=C.safePositiveInt(req.auth.establishment_id);
   const measurementCode=String(req.query.measurement_code||'');
   if(!establishmentId||Number(req.query.school_year)!==2027||
      !studentDimensions.PERIODS.includes(measurementCode))throw Error('invalid_reporting_window');
   // No unimos M1/M2/M3 ni escalas de distintos niveles.
   const [adults,students]=await Promise.all([
    pool.query('select audience,answers from community_survey_submissions where establishment_id=$1 and school_year=2027 and bank_version=$2',
      [establishmentId,C.bank.version]),
    studentDimensions.loadStudentDimensionAggregates(pool,{
     establishmentId,schoolYear:2027,measurementCode})
   ]);
   const report=PGCE.buildDimensionReport(adults.rows,students);
   report.student_measurement_code=measurementCode;
   report.student_interpretation='Proporción de respuestas favorables por nivel y área temática, no puntaje DIA/SIMCE. Los niveles usan escalas distintas. Prohibido promediar o comparar entre niveles; NT1/NT2 pendientes.';
   return report;
 }
 app.get('/api/community-surveys/dimensions',...admin,noStore,async(req,res)=>{
  if(Number(req.query.school_year)!==2027||!studentDimensions.PERIODS.includes(String(req.query.measurement_code||'')))return sendError(res,400,'invalid_reporting_window');
  try{return res.json({ok:true,report:await getInstitutionDimensionReport(req)})}
  catch(e){return sendError(res,503,'dimensions_unavailable')}
 });
 app.get('/api/community-surveys/pgce-scaffold',...admin,noStore,async(req,res)=>{
  if(Number(req.query.school_year)!==2027||!studentDimensions.PERIODS.includes(String(req.query.measurement_code||'')))return sendError(res,400,'invalid_reporting_window');
  try{
   const report=await getInstitutionDimensionReport(req);
   const plan=PGCE.buildPgceScaffold(report);
   const saved=await pgceDrafts.loadPgceDraft(pool,C.safePositiveInt(req.auth.establishment_id));
   if(saved){
    plan.draft=saved.draft;
    plan.preflight=inspectPgceDraft(saved.draft);
    plan.saved_revision=saved.revision;
    plan.saved_at=saved.updated_at;
   }else{plan.saved_revision=0;plan.saved_at=null}
   // Aun si el editor está completo, esta ruta no aprueba planes.
   return res.json({ok:true,dimensions:report,plan});
  }catch(e){return sendError(res,503,'pgce_scaffold_unavailable')}
 });
 // Edición profesional del único borrador anual por establecimiento.
 // Sin aceptar establecimiento, RUN o respuestas individuales desde el navegador.
 app.put('/api/community-surveys/pgce-draft',...admin,adminRate,trustedOrigin,noStore,async(req,res)=>{
  const est=C.safePositiveInt(req.auth.establishment_id);
  const actor=C.safePositiveInt(req.auth.id);
  if(!est||!actor||Number(req.query.school_year)!==2027)
   return sendError(res,400,'invalid_pgce_scope');
  try{
   const saved=await pgceDrafts.savePgceDraft(pool,{
    establishmentId:est,actorId:actor,
    expectedRevision:req.body?.expected_revision,draft:req.body?.draft
   });
   if(saved.conflict)return sendError(res,409,'pgce_draft_revision_conflict');
   return res.json({ok:true,saved_revision:saved.revision,saved_at:saved.updated_at,
    preflight:saved.preflight,can_publish:false,can_certify_compliance:false});
  }catch(e){
   if(e.message==='invalid_pgce_draft')return sendError(res,400,'invalid_pgce_draft');
   if(e.message==='invalid_pgce_action_identity')return sendError(res,409,'pgce_action_identity_changed');
   if(e.message==='invalid_pgce_actor')return sendError(res,403,'pgce_actor_forbidden');
   return sendError(res,503,'pgce_draft_unavailable');
  }
 });
 // Seguimiento manual: resultados históricos por acción y período, sin mezclar
 // automáticamente encuestas M1, M2 y M3 ni publicar datos individuales.
 app.get('/api/community-surveys/pgce-followup',...admin,noStore,async(req,res)=>{
  const est=C.safePositiveInt(req.auth.establishment_id);
  if(!est||Number(req.query.school_year)!==2027)
   return sendError(res,400,'invalid_pgce_scope');
  try{
   const records=await pgceFollowup.listFollowups(pool,est);
   return res.json({ok:true,school_year:2027,records,can_approve_pgce:false});
  }catch(e){return sendError(res,503,'pgce_followup_unavailable')}
 });
 app.put('/api/community-surveys/pgce-followup',...admin,adminRate,trustedOrigin,noStore,async(req,res)=>{
  const est=C.safePositiveInt(req.auth.establishment_id);
  const actor=C.safePositiveInt(req.auth.id);
  if(!est||!actor||Number(req.query.school_year)!==2027)
   return sendError(res,400,'invalid_pgce_scope');
  try{
   const saved=await pgceFollowup.saveFollowup(pool,{
    establishmentId:est,actorId:actor,
    expectedRevision:req.body?.expected_revision,input:req.body?.followup
   });
   if(saved.notFound)return sendError(res,404,'pgce_action_not_planned');
   if(saved.conflict)return sendError(res,409,'pgce_followup_revision_conflict');
   return res.json({ok:true,...saved});
  }catch(e){
   if(e.message==='invalid_pgce_followup')return sendError(res,400,'invalid_pgce_followup');
   if(e.message==='invalid_pgce_actor')return sendError(res,403,'pgce_actor_forbidden');
   return sendError(res,503,'pgce_followup_unavailable');
  }
 });
 return true;
}
module.exports={registerCommunitySurveys};
