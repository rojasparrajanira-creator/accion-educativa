'use strict';
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const roles=['coordinador_convivencia','dupla_psicosocial','director','directora'];
const send=(res,status,error)=>res.status(status).json({ok:false,error});
const noStore=(req,res,next)=>{res.setHeader('Cache-Control','no-store');next()};
function validateDocument(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_plan');
 const str=JSON.stringify(input);
 if(str.length>90000||str.length<15)throw Error('invalid_plan_size');
 let count=0;
 function walk(v,depth=0){
  if(depth>9||++count>6000)throw Error('invalid_plan_structure');
  if(Array.isArray(v)){if(v.length>100)throw Error('invalid_plan_structure');v.forEach(x=>walk(x,depth+1));return}
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('invalid_plan_structure');return}
  if(typeof v==='string'){if(v.length>2300)throw Error('invalid_plan_structure');return}
  if(typeof v==='object'){for(const [key,x] of Object.entries(v)){
   if(/^(rut|run|student_id|student_name|health_record|medical_diagnosis|access_token|pin|password)$/i.test(key))
    throw Error('identifiable_data_forbidden');
   walk(x,depth+1);
  }return}
  throw Error('invalid_plan_structure');
 }
 walk(input);
 const d=JSON.parse(str);
 if(d.school_year!==2027||!Array.isArray(d.actions)||d.actions.length>60||
 !Array.isArray(d.findings)||d.findings.length>60||
 !Array.isArray(d.participation)||d.participation.length>100||
 !Array.isArray(d.diagnostic_sources)||d.diagnostic_sources.length>100)
  throw Error('invalid_plan_structure');
 d.director_approval=null; // El cliente no puede atribuirse aprobación.
 return d;
}
function registerPgcePlanEditor({app,pool,requireRole,allowedOrigins}){
 if(process.env.MEC_COMMUNITY_SURVEYS_ENABLED!=='1')return false;
 const editor=requireRole(...roles),director=requireRole('director','directora');
 const trustedOrigin=(req,res,next)=>{
  const origin=String(req.headers.origin||'');
  if(!origin||!allowedOrigins?.has(origin))return send(res,403,'origin_forbidden');
  next();
 };
 const year=req=>Number(req.query.school_year||req.body?.school_year)===2027;
 const est=req=>Number(req.auth.establishment_id)||0;
 app.get('/api/community-surveys/pgce-plan',...editor,noStore,async(req,res)=>{
  if(!year(req))return send(res,400,'invalid_year');
  try{
   const q=await pool.query('select revision,status,document,approved_at,approval_ref from community_pgce_plans_2027 where establishment_id=$1 and school_year=2027',[est(req)]);
   if(!q.rowCount)return res.json({ok:true,exists:false,school_year:2027});
   const p=q.rows[0];
   return res.json({ok:true,exists:true,school_year:2027,revision:p.revision,status:p.status,
    document:p.document,approved_at:p.approved_at,approval_ref:p.approval_ref,
    preflight:inspectPgceDraft(p.document)});
  }catch(e){return send(res,503,'plan_unavailable')}
 });
 app.post('/api/community-surveys/pgce-plan',...editor,trustedOrigin,noStore,async(req,res)=>{
  if(!year(req)||!Number.isSafeInteger(Number(req.body?.expected_revision))||
   Number(req.body?.expected_revision)<0)return send(res,400,'invalid_revision_or_year');
  let document;
  try{document=validateDocument(req.body.document)}catch(e){return send(res,400,e.message)}
  const expected=Number(req.body.expected_revision),establishment=est(req),actor=Number(req.auth.id);
  // No permitir que un editor cambie el RBD/nombre de otro establecimiento
  // en el expediente oficial, aunque conozca su identificador.
  try{
   const school=await pool.query('select name,rbd from establishments where id=$1',[establishment]);
   if(!school.rowCount)return send(res,404,'establishment_not_found');
   document.establishment_name=school.rows[0].name;
   document.rbd=school.rows[0].rbd||'SIN-RBD-VERIFICAR';
  }catch(e){return send(res,503,'establishment_unavailable')}
  const review=inspectPgceDraft(document),status=review.status==='ready_for_human_review'?'ready_for_review':'draft';
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const prev=await client.query('select id,revision,status from community_pgce_plans_2027 where establishment_id=$1 and school_year=2027 for update',[establishment]);
   let planId,revision,action;
   if(!prev.rowCount){
    if(expected!==0){await client.query('ROLLBACK');return send(res,409,'revision_conflict')}
    const q=await client.query('insert into community_pgce_plans_2027(establishment_id,school_year,revision,status,document,created_by,updated_by) values($1,2027,1,$2,$3::jsonb,$4,$4) returning id',
     [establishment,status,JSON.stringify(document),actor]);
    planId=q.rows[0].id;revision=1;action='created';
   }else{
    const current=prev.rows[0];
    if(current.status==='approved'){await client.query('ROLLBACK');return send(res,409,'approved_plan_immutable')}
    if(Number(current.revision)!==expected){await client.query('ROLLBACK');return send(res,409,'revision_conflict')}
    planId=current.id;revision=expected+1;action='edited';
    await client.query('update community_pgce_plans_2027 set revision=$2,status=$3,document=$4::jsonb,updated_by=$5,updated_at=now() where id=$1',
     [planId,revision,status,JSON.stringify(document),actor]);
   }
   await client.query('insert into community_pgce_plan_revisions_2027(plan_id,establishment_id,revision,status,document,performed_by,action) values($1,$2,$3,$4,$5::jsonb,$6,$7)',
    [planId,establishment,revision,status,JSON.stringify(document),actor,action]);
   await client.query('COMMIT');
   return res.json({ok:true,revision,status,preflight:review,approved:false});
  }catch(e){try{await client.query('ROLLBACK')}catch(_){}return send(res,503,'save_unavailable')}
  finally{client.release()}
 });
 app.post('/api/community-surveys/pgce-plan/approve',...director,trustedOrigin,noStore,async(req,res)=>{
  if(!year(req)||!Number.isSafeInteger(Number(req.body?.expected_revision))||
   Number(req.body?.expected_revision)<1)return send(res,400,'invalid_revision_or_year');
  const ref=String(req.body?.approval_document_ref||'').trim();
  if(!/^[A-Za-z0-9_./-]{6,120}$/.test(ref))return send(res,400,'invalid_approval_reference');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const q=await client.query('select id,revision,status,document from community_pgce_plans_2027 where establishment_id=$1 and school_year=2027 for update',[est(req)]);
   if(!q.rowCount){await client.query('ROLLBACK');return send(res,404,'plan_not_found')}
   const p=q.rows[0];
   if(p.status==='approved'){await client.query('ROLLBACK');return send(res,409,'already_approved')}
   if(Number(p.revision)!==Number(req.body.expected_revision)){await client.query('ROLLBACK');return send(res,409,'revision_conflict')}
   const check=inspectPgceDraft(p.document);
   if(check.status!=='ready_for_human_review'){
    await client.query('ROLLBACK');return res.status(422).json({ok:false,error:'incomplete_plan',missing:check.missing});
   }
   const now=new Date(),document={...p.document,director_approval:{approval_document_ref:ref,date:now.toISOString().slice(0,10)}};
   const revision=Number(p.revision)+1;
   await client.query("update community_pgce_plans_2027 set revision=$2,status='approved',document=$3::jsonb,approved_by=$4,approved_at=now(),approval_ref=$5,updated_by=$4,updated_at=now() where id=$1",
    [p.id,revision,JSON.stringify(document),req.auth.id,ref]);
   await client.query("insert into community_pgce_plan_revisions_2027(plan_id,establishment_id,revision,status,document,performed_by,action) values($1,$2,$3,'approved',$4::jsonb,$5,'approved')",
    [p.id,est(req),revision,JSON.stringify(document),req.auth.id]);
   await client.query('COMMIT');
   return res.json({ok:true,status:'approved',revision,
    notice:'Aprobación registrada por perfil de Dirección. No constituye certificación de conformidad legal.'});
  }catch(e){try{await client.query('ROLLBACK')}catch(_){}return send(res,503,'approval_unavailable')}
  finally{client.release()}
 });
 app.get('/api/community-surveys/pgce-plan/history',...editor,noStore,async(req,res)=>{
  if(!year(req))return send(res,400,'invalid_year');
  try{
   const q=await pool.query('select r.revision,r.status,r.action,r.happened_at,r.performed_by from community_pgce_plan_revisions_2027 r join community_pgce_plans_2027 p on p.id=r.plan_id where p.establishment_id=$1 and p.school_year=2027 and r.establishment_id=$1 order by r.revision desc limit 100',[est(req)]);
   return res.json({ok:true,history:q.rows});
  }catch(e){return send(res,503,'history_unavailable')}
 });
 return true;
}
module.exports={registerPgcePlanEditor,validateDocument};
