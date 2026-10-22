'use strict';
/**
 * Editor de borradores PGCE 2027: sin publicación ni aprobación automática.
 * Identidad de la escuela desde req.auth, no del cuerpo enviado por cliente.
 */
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const {buildPgceScaffold}=require('./pgce-dimensions-integrated-2027.cjs');
const YEAR=2027;
const ALLOWED_CLAUSES=new Set('abcdefg');
const AUDIENCES=new Set(['estudiantes','familia','docente','asistente','directivo','institutional_records']);
const EVIDENCE=/^[A-Za-z0-9][A-Za-z0-9_.:/-]{5,95}$/;
const NAME=/^[A-Za-z0-9_-]{1,32}$/;
const TEXT_LIMIT=1200;
const safeId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const error=(code)=>{const e=new Error(code);e.code=code;throw e;};
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function guardPrivacy(s){
 // Evitar identificadores personales evidentes en un plan de difusión amplia.
 // No puede detectar todos los nombres: es necesario control institucional adicional.
 if(/\b\d{1,2}[. ]?\d{3}[. ]?\d{3}-[\dkK]\b/.test(s)||
    /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/.test(s))error('personal_identifiers_not_allowed');
 return s;
}
function string(v,max=TEXT_LIMIT){
 if(v===undefined||v===null)return '';
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000e-\u001f]/.test(v))error('invalid_text_field');
 return guardPrivacy(v.trim());
}
function textObj(value,keys){
 if(value!==undefined&&!isObj(value))error('invalid_section');
 const x=value||{},o={};
 for(const k of keys)o[k]=string(x[k]);
 for(const k of Object.keys(x))if(!keys.includes(k))error('unsupported_field');
 return o;
}
function refs(arr,max=20){
 if(arr===undefined)return [];
 if(!Array.isArray(arr)||arr.length>max||arr.some(x=>typeof x!=='string'||!EVIDENCE.test(x)))error('invalid_evidence_reference');
 return [...new Set(arr)];
}
function boundedArray(x,max){
 if(x===undefined)return [];
 if(!Array.isArray(x)||x.length>max)error('too_many_plan_items');
 return x;
}
function validDate(v){
 const s=string(v,10);
 if(s&&!/^\d{4}-\d{2}-\d{2}$/.test(s))error('invalid_date');
 return s;
}
function normalizeDraft(input,school){
 if(!isObj(input))error('invalid_plan');
 if(input.school_year!==YEAR)error('invalid_year');
 if(input.director_approval!==undefined&&input.director_approval!==null)error('approval_not_editable');
 const validTop=new Set([
  'school_year','establishment_name','rbd','director','responsible','version',
  'findings','actions','diagnostic_sources','participation','council_school',
  'policy_alignment','pei_alignment','rie_alignment','pme_alignment',
  'diffusion','follow_up','director_approval'
 ]);
 for(const k of Object.keys(input))if(!validTop.has(k))error('unsupported_field');
 const findings=boundedArray(input.findings,70).map(f=>{
  if(!isObj(f))error('invalid_finding');
  for(const k of Object.keys(f))if(!['id','need','evidence_refs'].includes(k))error('unsupported_field');
  const id=string(f.id,32);
  if(id&&!NAME.test(id))error('invalid_finding_id');
  return {id,need:string(f.need),evidence_refs:refs(f.evidence_refs)};
 });
 const actions=boundedArray(input.actions,70).map(a=>{
  if(!isObj(a))error('invalid_action');
  const fields=['title','objective','strategy','responsible','indicator','baseline',
   'target','place','resources','expected_evidence'];
  for(const k of Object.keys(a))if(!['clause',...fields,'start_date','end_date','finding_ids'].includes(k))error('unsupported_field');
  if(!ALLOWED_CLAUSES.has(a.clause))error('invalid_clause');
  const o={clause:a.clause};
  for(const k of fields)o[k]=string(a[k]);
  o.start_date=validDate(a.start_date);
  o.end_date=validDate(a.end_date);
  o.finding_ids=boundedArray(a.finding_ids,20).map(v=>{
   const id=string(v,32);if(!NAME.test(id))error('invalid_finding_id');return id;
  });
  o.finding_ids=[...new Set(o.finding_ids)];
  return o;
 });
 const diagnostic_sources=boundedArray(input.diagnostic_sources,70).map(s=>{
  if(!isObj(s))error('invalid_source');
  for(const k of Object.keys(s))if(!['audience','method','evidence_ref'].includes(k))error('unsupported_field');
  if(!AUDIENCES.has(s.audience))error('invalid_audience');
  const ref=string(s.evidence_ref,96);
  if(ref&&!EVIDENCE.test(ref))error('invalid_evidence_reference');
  return {audience:s.audience,method:string(s.method),evidence_ref:ref};
 });
 const participation=boundedArray(input.participation,120).map(p=>{
  if(!isObj(p))error('invalid_participation');
  for(const k of Object.keys(p))if(!['audience','date','summary','evidence_ref'].includes(k))error('unsupported_field');
  if(!AUDIENCES.has(p.audience)||p.audience==='institutional_records')error('invalid_audience');
  const ref=string(p.evidence_ref,96);
  if(ref&&!EVIDENCE.test(ref))error('invalid_evidence_reference');
  return {audience:p.audience,date:validDate(p.date),summary:string(p.summary),evidence_ref:ref};
 });
 const council_school=textObj(input.council_school,['report_ref','feedback_or_justification']);
 const diffusion=textObj(input.diffusion,['channels','calendar','delivery_record_plan']);
 const follow_up=textObj(input.follow_up,['frequency','responsible','evaluation_method']);
 const normalized={
  school_year:YEAR,
  establishment_name:school.name,
  rbd:school.rbd,
  version:string(input.version,120)||'Borrador de trabajo',
  director:string(input.director,120),
  responsible:string(input.responsible,120),
  findings,actions,diagnostic_sources,participation,
  council_school,
  policy_alignment:string(input.policy_alignment),
  pei_alignment:string(input.pei_alignment),
  rie_alignment:string(input.rie_alignment),
  pme_alignment:string(input.pme_alignment),
  diffusion,follow_up,director_approval:null
 };
 if(JSON.stringify(normalized).length>140000)error('plan_too_large');
 return normalized;
}
function defaultDraft(school){
 const source=buildPgceScaffold(null,{establishment_name:school.name,rbd:school.rbd}).draft;
 return normalizeDraft(source,school);
}
function registerPgceDraftEditor({app,pool,requireRole,rateLimit,allowedOrigins}){
 if(process.env.MEC_COMMUNITY_SURVEYS_ENABLED!=='1')return false;
 const guard=requireRole('coordinador_convivencia','dupla_psicosocial','director','directora');
 const limit=rateLimit({windowMs:60000,max:20});
 const noCache=(req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');next();
 };
 const trusted=(req,res,next)=>{
  const origin=String(req.headers.origin||'');
  if(!(allowedOrigins instanceof Set)||!allowedOrigins.has(origin))
   return res.status(403).json({ok:false,error:'origin_forbidden'});
  next();
 };
 const getSchool=async est=>{
  const q=await pool.query('select id,name,rbd from establishments where id=$1',[est]);
  return q.rows[0]||null;
 };
 const fail=(res,status,error)=>res.status(status).json({ok:false,error});
 app.get('/api/community-surveys/pgce-draft',...guard,noCache,async(req,res)=>{
  const establishmentId=safeId(req.auth.establishment_id);
  if(!establishmentId||Number(req.query.school_year)!==YEAR)return fail(res,400,'invalid_request');
  try{
   const school=await getSchool(establishmentId);
   if(!school)return fail(res,404,'establishment_not_found');
   const q=await pool.query('select revision,draft,updated_at from pgce_2027_draft_current where establishment_id=$1 and school_year=$2',[establishmentId,YEAR]);
   const row=q.rows[0];
   const draft=row?row.draft:defaultDraft(school);
   return res.json({ok:true,revision:row?row.revision:0,draft,preflight:inspectPgceDraft(draft),
    last_updated:row?.updated_at||null,editable:true,can_publish:false,
    disclaimer:'Borrador interno. No es aprobación, certificación o autorización de difusión.'});
  }catch(e){return fail(res,503,'draft_unavailable')}
 });
 app.post('/api/community-surveys/pgce-draft',...guard,limit,trusted,noCache,async(req,res)=>{
  const establishmentId=safeId(req.auth.establishment_id),editorId=safeId(req.auth.id);
  const expected=req.body?.expected_revision;
  if(!establishmentId||!editorId||Number(req.body?.school_year)!==YEAR||
     !Number.isSafeInteger(expected)||expected<0)return fail(res,400,'invalid_request');
  const client=await pool.connect();
  try{
   await client.query('begin');
   const schoolResult=await client.query('select id,name,rbd from establishments where id=$1',[establishmentId]);
   const school=schoolResult.rows[0];
   if(!school){await client.query('rollback');return fail(res,404,'establishment_not_found')}
   let plan;
   try{plan=normalizeDraft(req.body?.draft,school)}
   catch(e){await client.query('rollback');return fail(res,400,e.code||'invalid_plan')}
   await client.query("insert into pgce_2027_draft_current(establishment_id,school_year) values($1,2027) on conflict(establishment_id,school_year) do nothing",[establishmentId]);
   const q=await client.query('select revision from pgce_2027_draft_current where establishment_id=$1 and school_year=2027 for update',[establishmentId]);
   const revision=Number(q.rows[0].revision);
   if(revision!==expected){await client.query('rollback');return fail(res,409,'revision_conflict')}
   const next=revision+1;
   await client.query('update pgce_2027_draft_current set revision=$3,draft=$4::jsonb,updated_by=$5,updated_at=now() where establishment_id=$1 and school_year=$2',
    [establishmentId,YEAR,next,JSON.stringify(plan),editorId]);
   await client.query('insert into pgce_2027_draft_revisions(establishment_id,school_year,revision,draft,edited_by) values($1,$2,$3,$4::jsonb,$5)',
    [establishmentId,YEAR,next,JSON.stringify(plan),editorId]);
   await client.query('commit');
   return res.json({ok:true,revision:next,preflight:inspectPgceDraft(plan),
    status:'saved_working_draft',can_publish:false});
  }catch(e){try{await client.query('rollback')}catch(_){}return fail(res,503,'save_unavailable')}
  finally{client.release()}
 });
 app.get('/api/community-surveys/pgce-draft/revisions',...guard,noCache,async(req,res)=>{
  const establishmentId=safeId(req.auth.establishment_id);
  if(!establishmentId||Number(req.query.school_year)!==YEAR)return fail(res,400,'invalid_request');
  try{
   const q=await pool.query('select revision,created_at from pgce_2027_draft_revisions where establishment_id=$1 and school_year=2027 order by revision desc limit 20',[establishmentId]);
   return res.json({ok:true,revisions:q.rows});
  }catch(e){return fail(res,503,'revision_history_unavailable')}
 });
 return true;
}
module.exports={YEAR,normalizeDraft,defaultDraft,registerPgceDraftEditor};
