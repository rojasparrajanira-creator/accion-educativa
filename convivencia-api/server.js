const express=require('express');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Pool}=require('pg');
const multer=require('multer');
const ExcelJS=require('@ayocore/exceljs');
const app=express();
app.use(express.json({limit:'5mb'}));
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-site');
  next();
});
const publicRateBuckets=new Map();
function publicRateLimit({windowMs=60000,max=30}={}){
  return (req,res,next)=>{
    const now=Date.now();
    const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
    const key=(forwarded||req.ip||'unknown')+'|'+req.path;
    let bucket=publicRateBuckets.get(key);
    if(!bucket||bucket.resetAt<=now){bucket={count:0,resetAt:now+windowMs};publicRateBuckets.set(key,bucket)}
    bucket.count++;
    res.setHeader('RateLimit-Limit',String(max));
    res.setHeader('RateLimit-Remaining',String(Math.max(0,max-bucket.count)));
    if(bucket.count>max)return res.status(429).json({ok:false,error:'too_many_requests'});
    if(publicRateBuckets.size>5000){
      for(const [k,v] of publicRateBuckets)if(v.resetAt<=now)publicRateBuckets.delete(k);
    }
    next();
  };
}
const studentLoginRateLimit=publicRateLimit({windowMs:60000,max:20});
const studentPinRateLimit=publicRateLimit({windowMs:60000,max:15});
const storeOrderRateLimit=publicRateLimit({windowMs:60000,max:10});
const storeStatusRateLimit=publicRateLimit({windowMs:60000,max:30});
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.path.startsWith('/api/')){
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.setHeader('Pragma','no-cache');
  }
  next();
});
const DEFAULT_WEB_ORIGIN='https://convivencia-escolar-material-educativo.onrender.com';
const allowedOrigins=new Set([
  DEFAULT_WEB_ORIGIN,
  ...String(process.env.MEC_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)
]);
app.use((req,res,next)=>{
  const origin=String(req.headers.origin||'');
  if(origin&&allowedOrigins.has(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Student-Access');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  }
  if(req.method==='OPTIONS'){
    if(origin&&!allowedOrigins.has(origin))return res.sendStatus(403);
    return res.sendStatus(204);
  }
  next();
});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const storeImageUpload=multer({
  storage:multer.memoryStorage(),
  limits:{files:1,fileSize:5*1024*1024},
  fileFilter:(req,file,cb)=>{
    const type=String(file.mimetype||'').toLowerCase();
    const name=String(file.originalname||'').toLowerCase();
    cb(null,(type==='image/jpeg'||type==='image/png')&&/\.(jpe?g|png)$/.test(name));
  }
});
const matrículaUpload=multer({
  storage:multer.memoryStorage(),
  limits:{files:20,fileSize:10*1024*1024},
  fileFilter:(req,file,cb)=>{
    const n=String(file.originalname||'').toLowerCase();
    cb(null,/\.(xlsx|csv)$/.test(n));
  }
});
async function initDatabase(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL no configurada');
  await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await pool.query("delete from auth_sessions where expires_at<=now()");
  await pool.query(`delete from response_drafts d using survey_applications a,measurement_settings ms
    where d.application_id=a.id and ms.measurement_id=a.measurement_id
      and ms.end_date < ((now() at time zone 'America/Santiago')::date - 7)`);
  await pool.query(`update survey_applications a set access_token_hash=null,access_token_created_at=null
    from measurement_settings ms where ms.measurement_id=a.measurement_id
      and ms.end_date < (now() at time zone 'America/Santiago')::date
      and a.status<>'completed'`);

  const platformEmail=String(process.env.MEC_PLATFORM_ADMIN_EMAIL||'').trim().toLowerCase();
  const platformPassword=String(process.env.MEC_PLATFORM_ADMIN_PASSWORD||'');
  if(platformEmail&&platformPassword.length>=12){
    const est=await pool.query("insert into establishments(name,rbd) values('Material Educativo Chile','MEC-PLATFORM') on conflict(rbd) do update set name=excluded.name returning id");
    const existing=await pool.query("select id,password_hash,password_salt,role from users where establishment_id=$1 and lower(email)=lower($2) limit 1",[est.rows[0].id,platformEmail]);
    if(!existing.rowCount){
      const cred=await makePassword(platformPassword);
      await pool.query("insert into users(establishment_id,email,name,role,password_hash,password_salt,must_change_password,active) values($1,$2,'Administración de Plataforma','platform_admin',$3,$4,false,true)",[est.rows[0].id,platformEmail,cred.hash,cred.salt]);
      console.log('Platform administrator initialized.');
    }else if(existing.rows[0].role!=='platform_admin'||!existing.rows[0].password_hash){
      const cred=await makePassword(platformPassword);
      await pool.query("update users set role='platform_admin',password_hash=coalesce(password_hash,$1),password_salt=coalesce(password_salt,$2),active=true where id=$3",[cred.hash,cred.salt,existing.rows[0].id]);
      console.log('Platform administrator role verified.');
    }
  }
  const q=await pool.query("select current_database() database");
  console.log('Convivencia DB connected:',q.rows[0].database);
}
const ok=(res,data)=>res.json({ok:true,...data});
function studentErrorStatus(message){
  if(message==='invalid_student_access')return 403;
  if(message==='application_not_found')return 404;
  if(['application_not_started','application_already_completed','student_inactive','measurement_not_active','measurement_not_configured','application_not_open','application_closed','application_context_mismatch'].includes(message))return 409;
  return 400;
}
async function auditProfessional(req,action,entityType,entityId,metadata={}){
  try{
    if(!req.auth?.establishment_id)return;
    await pool.query(
      "insert into professional_audit_events(establishment_id,user_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5,$6::jsonb)",
      [req.auth.establishment_id,req.auth.id||null,String(action),String(entityType),entityId==null?null:String(entityId),JSON.stringify(metadata||{})]
    );
  }catch(e){
    console.error('Audit event failed:',e.message);
  }
}
const scrypt=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve(key)));
async function makePassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const key=await scrypt(String(password),salt);
  return {salt,hash:key.toString('hex')};
}
async function verifyPassword(password,salt,hash){
  if(!salt||!hash)return false;
  try{
    const a=await scrypt(String(password),salt),b=Buffer.from(hash,'hex');
    return a.length===b.length&&crypto.timingSafeEqual(a,b);
  }catch(e){return false}
}
function sha256(v){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function newStudentAccessToken(){return crypto.randomBytes(32).toString('base64url')}
function studentAccessValid(hash,token){
  if(!hash||!token)return false;
  const a=Buffer.from(String(hash)),b=Buffer.from(sha256(token));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function cookieValue(req,name){
  const raw=String(req.headers.cookie||'');
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0)continue;
    if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());
  }
  return '';
}
function setSessionCookie(res,token,maxAge=28800){
  res.setHeader('Set-Cookie','mec_session='+encodeURIComponent(token)+'; Path=/; HttpOnly; Secure; SameSite=None; Max-Age='+maxAge);
}
async function sessionUser(req){
  const token=cookieValue(req,'mec_session');
  if(!token)return null;
  const q=await pool.query(`select u.id,u.establishment_id,u.email,u.rut,u.name,u.role,u.active,u.must_change_password,e.name establishment,e.rbd
    from auth_sessions s join users u on u.id=s.user_id join establishments e on e.id=u.establishment_id
    where s.token_hash=$1 and s.expires_at>now() and u.active=true limit 1`,[sha256(token)]);
  return q.rows[0]||null;
}
async function requireAuth(req,res,next){
  try{const user=await sessionUser(req);if(!user)return res.status(401).json({ok:false,error:'authentication_required'});req.auth=user;next()}catch(e){res.status(401).json({ok:false,error:'authentication_required'})}
}
function canonicalRole(role,rbd){
  const r=plain(role).replace(/\s+/g,'_');
  if(r==='professional'&&rbd==='PILOTO-MEC')return 'coordinador_convivencia';
  const map={
    coordinador:'coordinador_convivencia',
    coordinador_convivencia:'coordinador_convivencia',
    coordinadora_convivencia:'coordinador_convivencia',
    dupla:'dupla_psicosocial',
    dupla_psicosocial:'dupla_psicosocial',
    profesor:'profesor',
    profesora:'profesor',
    asistente:'asistente_educacion',
    asistente_educacion:'asistente_educacion',
    prevencionista:'prevencionista',
    nutricionista:'nutricionista'
  };
  return map[r]||r;
}
function requireRole(...allowed){
  return [requireAuth,(req,res,next)=>{
    if(req.auth.must_change_password)return res.status(403).json({ok:false,error:'password_change_required'});
    const role=canonicalRole(req.auth.role,req.auth.rbd);
    if(!allowed.includes(role))return res.status(403).json({ok:false,error:'role_forbidden'});
    req.auth.canonical_role=role;next();
  }];
}
function plain(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function cleanHeader(v){return plain(v).replace(/[^a-z0-9]+/g,'')}
function normalizeRut(v){
  const x=String(v??'').toUpperCase().replace(/[^0-9K]/g,'');
  if(x.length<8||x.length>9)return '';
  return x.slice(0,-1)+'-'+x.slice(-1);
}
function validRut(v){
  const r=normalizeRut(v);if(!r)return false;
  const [body,dv]=r.split('-');let sum=0,m=2;
  for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*m;m=m===7?2:m+1}
  const x=11-(sum%11),expected=x===11?'0':x===10?'K':String(x);
  return dv===expected;
}
function rowMap(row){const out={};for(const [k,v] of Object.entries(row||{}))out[cleanHeader(k)]=v;return out}
function firstValue(m,aliases){
  for(const a of aliases){const k=cleanHeader(a);if(m[k]!==undefined&&String(m[k]).trim()!=='')return m[k]}
  return '';
}
function courseKey(v){
  const n=plain(v).replace(/º/g,'°').replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim();
  let m=n.match(/^(i|ii|iii|iv)\s*°?\s*(?:medio|media)?\s*([a-z])?\b/);
  if(m){const num={i:1,ii:2,iii:3,iv:4}[m[1]];return 'm'+num+(m[2]||'')}
  const compact=n.replace(/\s+/g,'');
  m=compact.match(/^([1-4])°?(m|em)([a-z])?/);
  if(m)return 'm'+Number(m[1])+(m[3]||'');
  m=n.match(/^([1-8])\s*°?\s*(basico|medio|media|m|em)?\s*([a-z])?\b/);
  if(!m)return '';
  const grade=Number(m[1]),type=m[2]||'',letter=m[3]||'';
  const medio=/medio|media|m|em/.test(type);
  return (medio?'m':'b')+grade+letter;
}
function composeCourse(m){
  const direct=firstValue(m,['curso','nombre curso','curso completo','curso actual']);
  if(String(direct).trim())return String(direct).trim();
  const grade=String(firstValue(m,['grado','nivel','grado curso','nivel curso'])).trim();
  const letter=String(firstValue(m,['letra','letra curso'])).trim().toUpperCase();
  const teaching=plain(firstValue(m,['ensenanza','enseñanza','tipo ensenanza','tipo enseñanza','modalidad','nivel ensenanza']));
  if(!grade)return '';
  const medio=/medio|media|humanista|cientifico|científico|tecnico|técnico|tp|hc/.test(teaching);
  return grade.replace(/º/g,'°').replace(/\s+/g,'')+(grade.includes('°')?'':'°')+(medio?' Medio':'')+(letter?' '+letter:'');
}
function cellText(v){
  if(v===null||v===undefined)return '';
  if(typeof v==='object'){
    if(v.text!==undefined)return String(v.text);
    if(v.result!==undefined)return String(v.result??'');
    if(Array.isArray(v.richText))return v.richText.map(x=>x.text||'').join('');
  }
  return String(v);
}
function detectHeaderIndex(matrix){
  let best=-1,bestScore=0;
  const hints=['run','rut','nombre','nombres','apellidopaterno','apellidomaterno','curso','grado','letra'];
  for(let i=0;i<Math.min(matrix.length,25);i++){
    const keys=(matrix[i]||[]).map(cleanHeader);
    const score=hints.reduce((n,h)=>n+(keys.some(k=>k===h||k.includes(h))?1:0),0);
    if(score>bestScore){best=i;bestScore=score}
  }
  return bestScore>=2?best:-1;
}
function matrixToObjects(matrix){
  const hi=detectHeaderIndex(matrix);
  if(hi<0)return [];
  const headers=(matrix[hi]||[]).map((x,i)=>String(x||'').trim()||('col_'+i));
  const out=[];
  for(let i=hi+1;i<matrix.length;i++){
    const vals=matrix[i]||[];
    if(!vals.some(v=>String(v??'').trim()!==''))continue;
    const row={};headers.forEach((h,j)=>row[h]=vals[j]??'');
    row.__source_row=i+1;out.push(row);
  }
  return out;
}
function detectCsvDelimiter(text){
  const line=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/,1)[0]||'';
  const options=[',',';','\t'];
  return options.sort((a,b)=>(line.split(b).length-line.split(a).length))[0];
}
function parseCsvMatrix(text){
  const src=String(text||'').replace(/^\uFEFF/,'');
  const delimiter=detectCsvDelimiter(src);
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<src.length;i++){
    const ch=src[i];
    if(ch==='"'){
      if(quoted&&src[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
    }else if(ch===delimiter&&!quoted){
      row.push(cell);cell='';
    }else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&src[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(v=>String(v).trim()!==''))rows.push(row);
      row=[];
    }else cell+=ch;
  }
  row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);
  return rows;
}
async function parseEnrollmentFile(file){
  const name=String(file.originalname||'').toLowerCase();
  if(name.endsWith('.csv')){
    const objects=matrixToObjects(parseCsvMatrix(file.buffer.toString('utf8')));
    return {sheet:'CSV',rows:objects};
  }
  const wb=new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer);
  for(const ws of wb.worksheets){
    const matrix=[];
    ws.eachRow({includeEmpty:false},row=>{
      const vals=[];for(let i=1;i<=Math.max(row.cellCount,1);i++)vals.push(cellText(row.getCell(i).value));
      matrix.push(vals);
    });
    const objects=matrixToObjects(matrix);
    if(objects.length)return {sheet:ws.name,rows:objects};
  }
  return {sheet:'',rows:[]};
}
function parseStudentRow(row,file,rowNumber){
  const m=rowMap(row);
  const rawRut=firstValue(m,['run','rut','run alumno','rut alumno','run estudiante','rut estudiante']);
  const dv=firstValue(m,['dv','digito verificador','dígito verificador']);
  let rut=String(rawRut??'').trim();
  if(rut&&dv&&!/[kK0-9]\s*$/.test(rut.split('-')[1]||''))rut=rut+'-'+String(dv).trim();
  else if(rut&&dv&&!rut.includes('-')&&String(rut).replace(/\D/g,'').length<=8)rut=rut+'-'+String(dv).trim();
  rut=normalizeRut(rut);

  let name=String(firstValue(m,['nombre completo','nombre estudiante','nombre alumno','estudiante','alumno'])).trim();
  if(!name){
    const nombres=String(firstValue(m,['nombres','nombre'])).trim();
    const ap=String(firstValue(m,['apellido paterno','primer apellido','apellido1'])).trim();
    const am=String(firstValue(m,['apellido materno','segundo apellido','apellido2'])).trim();
    name=[nombres,ap,am].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }
  const course=composeCourse(m);
  return {file,row:rowNumber,rut,name,course};
}
function surveyLevelForCourse(name){
  const n=plain(String(name||'').replace(/º/g,'°')).replace(/\s+/g,' ').trim();
  if(/^\s*(i|ii)\s*°?(?:\s|$)/.test(n))return '1-2-medio';
  if(/^\s*(iii|iv)\s*°?(?:\s|$)/.test(n))return '3-4-medio';

  const compact=n.replace(/\s+/g,'');
  const mediaShort=compact.match(/^([1-4])°?(m|em)(?:[a-z]{0,3})?$/);
  if(mediaShort){
    const g=Number(mediaShort[1]);
    return g<=2?'1-2-medio':'3-4-medio';
  }

  const m=n.match(/^\s*([1-8])\s*°?\s*(.*)$/);
  if(!m)return null;
  const grade=Number(m[1]),rest=m[2]||'';
  const medio=/^(m|em)\b|\b(medio|media|ensenanza media|humanista|cientifico|tecnico|tp|hc)\b/.test(rest);
  if(medio){
    if(grade===1||grade===2)return '1-2-medio';
    if(grade===3||grade===4)return '3-4-medio';
    return null;
  }
  if(grade<=2)return '1-2';
  if(grade<=4)return '3-4';
  if(grade<=6)return '5-6';
  if(grade<=8)return '7-8';
  return null;
}
app.post('/api/auth/login',async(req,res)=>{try{
  const identifier=String((req.body||{}).identifier||'').trim();
  const password=String((req.body||{}).password||'');
  if(!identifier||!password)return res.status(400).json({ok:false,error:'credentials_required'});
  let candidates;
  if(identifier.includes('@')){
    candidates=await pool.query("select u.*,e.name establishment,e.rbd from users u join establishments e on e.id=u.establishment_id where lower(u.email)=lower($1) and u.active=true",[identifier]);
  }else{
    const compact=identifier.toUpperCase().replace(/[^0-9K]/g,'');
    candidates=await pool.query("select u.*,e.name establishment,e.rbd from users u join establishments e on e.id=u.establishment_id where regexp_replace(upper(coalesce(u.rut,'')),'[^0-9K]','','g')=$1 and u.active=true",[compact]);
  }
  let user=null,matchedIdentity=null;
  for(const candidate of candidates.rows){
    matchedIdentity=candidate;
    if(candidate.locked_until&&new Date(candidate.locked_until)>new Date())return res.status(429).json({ok:false,error:'account_temporarily_locked'});
    if(await verifyPassword(password,candidate.password_salt,candidate.password_hash)){user=candidate;break}
  }
  if(!user){
    if(matchedIdentity){
      const fails=Number(matchedIdentity.failed_login_count||0)+1;
      if(fails>=5)await pool.query("update users set failed_login_count=0,locked_until=now()+interval '15 minutes' where id=$1",[matchedIdentity.id]);
      else await pool.query("update users set failed_login_count=$1 where id=$2",[fails,matchedIdentity.id]);
    }
    return res.status(401).json({ok:false,error:'invalid_credentials'});
  }
  const token=crypto.randomBytes(32).toString('base64url'),tokenHash=sha256(token);
  await pool.query("delete from auth_sessions where expires_at<=now()");
  await pool.query("insert into auth_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')",[tokenHash,user.id]);
  await pool.query("update users set last_login_at=now(),failed_login_count=0,locked_until=null where id=$1",[user.id]);
  setSessionCookie(res,token);
  ok(res,{user:{id:user.id,establishment_id:user.establishment_id,email:user.email,rut:user.rut,name:user.name,role:user.role,must_change_password:user.must_change_password,establishment:user.establishment,rbd:user.rbd}});
}catch(e){res.status(400).json({ok:false,error:'login_failed'})}});

app.get('/api/auth/me',async(req,res)=>{try{const user=await sessionUser(req);if(!user)return res.status(401).json({ok:false,error:'authentication_required'});ok(res,{user})}catch(e){res.status(401).json({ok:false,error:'authentication_required'})}});
app.post('/api/auth/logout',async(req,res)=>{try{const token=cookieValue(req,'mec_session');if(token)await pool.query("delete from auth_sessions where token_hash=$1",[sha256(token)]);setSessionCookie(res,'',0);ok(res,{logged_out:true})}catch(e){setSessionCookie(res,'',0);ok(res,{logged_out:true})}});
app.post('/api/auth/change-password',requireAuth,async(req,res)=>{try{
  const current=String((req.body||{}).current_password||''),next=String((req.body||{}).new_password||'');
  if(next.length<10||!/[A-ZÁÉÍÓÚÑ]/i.test(next)||!/[0-9]/.test(next))return res.status(400).json({ok:false,error:'weak_password'});
  const u=await pool.query("select password_hash,password_salt from users where id=$1",[req.auth.id]);
  if(!u.rowCount||!(await verifyPassword(current,u.rows[0].password_salt,u.rows[0].password_hash)))return res.status(401).json({ok:false,error:'invalid_current_password'});
  const cred=await makePassword(next);
  await pool.query("update users set password_hash=$1,password_salt=$2,must_change_password=false where id=$3",[cred.hash,cred.salt,req.auth.id]);
  await pool.query("delete from auth_sessions where user_id=$1",[req.auth.id]);
  const token=crypto.randomBytes(32).toString('base64url');
  await pool.query("insert into auth_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')",[sha256(token),req.auth.id]);
  setSessionCookie(res,token);
  ok(res,{changed:true});
}catch(e){res.status(400).json({ok:false,error:'password_change_failed'})}});

app.post('/api/pgce/interventions',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{};
  const required=['source_application_id','dimension_code','priority','professional_decision','start_date','end_date','indicator','target'];
  for(const k of required)if(b[k]===undefined||b[k]===null||b[k]==='')throw new Error('missing_'+k);
  if(!/^D(0[1-9]|1[0-6])$/.test(b.dimension_code))throw new Error('invalid_dimension');
  if(!['high','medium','low'].includes(b.priority))throw new Error('invalid_priority');
  if(!['aprobar','ajustar'].includes(b.professional_decision))throw new Error('invalid_professional_decision');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.start_date))||!/^\d{4}-\d{2}-\d{2}$/.test(String(b.end_date)))throw new Error('invalid_dates');
  if(new Date(b.end_date+'T00:00:00')<new Date(b.start_date+'T00:00:00'))throw new Error('end_date_before_start_date');

  const app=await client.query("select s.establishment_id,a.status from survey_applications a join students s on s.id=a.student_id where a.id=$1",[b.source_application_id]);
  if(!app.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  if(Number(app.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  if(app.rows[0].status!=='completed')return res.status(409).json({ok:false,error:'application_not_completed'});
  const review=await client.query("select status from application_reviews where application_id=$1 and establishment_id=$2",[b.source_application_id,req.auth.establishment_id]);
  if(!review.rowCount||review.rows[0].status!=='reviewed')return res.status(409).json({ok:false,error:'professional_review_required'});

  let responsibleUserId=Number(b.responsible_user_id)||null,responsible=String(b.responsible||'').trim(),linkedUser=null;
  if(responsibleUserId){
    const ru=await client.query("select id,name,role from users where id=$1 and establishment_id=$2 and active=true",[responsibleUserId,req.auth.establishment_id]);
    if(!ru.rowCount)return res.status(404).json({ok:false,error:'responsible_user_not_found'});
    linkedUser=ru.rows[0];responsible=linkedUser.name;
  }
  if(!responsible)throw new Error('missing_responsible');

  await client.query('begin');
  const q=await client.query(`insert into pgce_interventions(establishment_id,source_application_id,dimension_code,priority,professional_decision,responsible,responsible_user_id,start_date,end_date,indicator,target,evidence,rationale,pgce_objectives,pgce_action_ids,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
    [app.rows[0].establishment_id,b.source_application_id,b.dimension_code,b.priority,b.professional_decision,responsible,responsibleUserId,b.start_date,b.end_date,b.indicator,b.target,Array.isArray(b.evidence)?b.evidence:[],Array.isArray(b.rationale)?b.rationale:[],Array.isArray(b.pgce_objectives)?b.pgce_objectives:[],Array.isArray(b.pgce_action_ids)?b.pgce_action_ids:[],req.auth.id]);

  let task=null;
  if(responsibleUserId){
    const tq=await client.query(`insert into professional_tasks(establishment_id,title,description,assigned_to,assigned_by,due_date,priority,related_type,related_id)
      values($1,$2,$3,$4,$5,$6,$7,'pgce_intervention',$8) returning *`,
      [req.auth.establishment_id,'PGCE '+b.dimension_code+' · '+String(b.indicator).slice(0,150),String(b.target).slice(0,2000),responsibleUserId,req.auth.id,b.end_date,b.priority,String(q.rows[0].id)]);
    task=tq.rows[0];
    await client.query(`insert into professional_notifications(establishment_id,user_id,kind,title,message,link)
      values($1,$2,'pgce_task',$3,$4,'notificaciones.html#tareas')`,
      [req.auth.establishment_id,responsibleUserId,'Nueva tarea PGCE: '+b.dimension_code,(req.auth.name||'El equipo de Convivencia')+' te asignó una intervención con plazo '+b.end_date+'.']);
  }

  await client.query('commit');
  await auditProfessional(req,'pgce_intervention_created','pgce_intervention',q.rows[0].id,{source_application_id:b.source_application_id,dimension_code:b.dimension_code,priority:b.priority,professional_decision:b.professional_decision,responsible_user_id:responsibleUserId});
  if(task)await auditProfessional(req,'professional_task_created','task',task.id,{assigned_to:responsibleUserId,due_date:b.end_date,priority:b.priority,related_type:'pgce_intervention',related_id:q.rows[0].id});
  res.status(201).json({ok:true,intervention:q.rows[0],task});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.get('/api/pgce/interventions',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const q=await pool.query("select * from pgce_interventions where establishment_id=$1 order by created_at desc",[establishmentId]);res.json({ok:true,interventions:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/pgce/interventions/:id/updates',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const b=req.body||{};if(!['approved','in_progress','completed','reprogrammed','suspended'].includes(b.status))throw new Error('invalid_status');if(!['M1','M2','M3'].includes(b.measurement_code))throw new Error('invalid_measurement_code');if(b.progress_percent!==null&&b.progress_percent!==undefined&&(Number(b.progress_percent)<0||Number(b.progress_percent)>100||!Number.isFinite(Number(b.progress_percent))))throw new Error('invalid_progress_percent');const establishmentId=Number(b.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const intervention=await pool.query("select id from pgce_interventions where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!intervention.rowCount)return res.status(404).json({ok:false,error:'intervention_not_found'});const q=await pool.query("insert into pgce_intervention_updates(intervention_id,measurement_code,status,progress_percent,evidence_note,adjustment_note,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *",[req.params.id,b.measurement_code||null,b.status,b.progress_percent??null,b.evidence_note||null,b.adjustment_note||null,req.auth.id]);await pool.query("update pgce_interventions set status=$1,updated_at=now() where id=$2",[b.status,req.params.id]);let linkedTasks=[];if(b.status==='in_progress'){const tq=await pool.query("update professional_tasks set status='in_progress',updated_at=now() where establishment_id=$1 and related_type='pgce_intervention' and related_id=$2 and status='pending' returning id,assigned_to,status,title",[establishmentId,String(req.params.id)]);linkedTasks=tq.rows}else if(b.status==='completed'){const tq=await pool.query("update professional_tasks set status='completed',completed_at=now(),updated_at=now() where establishment_id=$1 and related_type='pgce_intervention' and related_id=$2 and status not in ('completed','cancelled') returning id,assigned_to,status,title",[establishmentId,String(req.params.id)]);linkedTasks=tq.rows}for(const task of linkedTasks){await pool.query("insert into professional_notifications(establishment_id,user_id,kind,title,message,link) values($1,$2,'pgce_status',$3,$4,'notificaciones.html#tareas')",[establishmentId,task.assigned_to,'Actualización PGCE: '+task.title,'La intervención vinculada cambió a '+b.status+'.']);await auditProfessional(req,'professional_task_status_changed','task',task.id,{status:task.status,source:'pgce_followup'})}await auditProfessional(req,'pgce_followup_recorded','pgce_intervention',req.params.id,{measurement_code:b.measurement_code,status:b.status,progress_percent:b.progress_percent??null});res.status(201).json({ok:true,update:q.rows[0],linked_tasks:linkedTasks})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/pgce/interventions/:id/updates',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const intervention=await pool.query("select id from pgce_interventions where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!intervention.rowCount)return res.status(404).json({ok:false,error:'intervention_not_found'});const q=await pool.query("select * from pgce_intervention_updates where intervention_id=$1 order by created_at",[req.params.id]);res.json({ok:true,updates:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/pgce/dashboard',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const est=await pool.query("select id,name,rbd from establishments where id=$1",[establishmentId]);if(!est.rowCount)return res.status(404).json({ok:false,error:'establishment_not_found'});const q=await pool.query(`select i.*,coalesce(u.updates_count,0)::int updates_count,u.last_measurement,u.last_progress,u.last_evidence_at from pgce_interventions i left join lateral (select count(*) updates_count,(array_agg(x.measurement_code order by x.created_at desc))[1] last_measurement,(array_agg(x.progress_percent order by x.created_at desc))[1] last_progress,max(x.created_at) last_evidence_at from pgce_intervention_updates x where x.intervention_id=i.id) u on true where i.establishment_id=$1 order by i.created_at desc`,[establishmentId]);const rows=q.rows;const byStatus={},byDimension={};for(const x of rows){byStatus[x.status]=(byStatus[x.status]||0)+1;byDimension[x.dimension_code]=(byDimension[x.dimension_code]||0)+1}const overdue=rows.filter(x=>!['completed','suspended'].includes(x.status)&&new Date(x.end_date)<new Date()).length;const withoutUpdates=rows.filter(x=>Number(x.updates_count)===0).length;res.json({ok:true,establishment:est.rows[0],summary:{total:rows.length,by_status:byStatus,by_dimension:byDimension,overdue,without_updates:withoutUpdates},interventions:rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/health',async(req,res)=>{try{await pool.query("select 1");ok(res,{service:'convivencia-escolar-api',database:true})}catch(e){res.status(500).json({ok:false,service:'convivencia-escolar-api',database:false})}});
app.get('/api/status',(req,res)=>ok(res,{module:'convivencia-escolar',isolation:'independent'}));
app.get('/api/platform/establishments',...requireRole('platform_admin'),async(req,res)=>{try{
  const q=await pool.query(`select e.id,e.name,e.rbd,e.created_at,
    count(u.id) filter(where u.active=true)::int active_users,
    count(u.id) filter(where u.active=true and u.role='coordinador_convivencia')::int active_coordinators
    from establishments e left join users u on u.establishment_id=e.id
    where e.rbd is distinct from 'MEC-PLATFORM'
    group by e.id order by e.name`);
  ok(res,{establishments:q.rows});
}catch(e){res.status(400).json({ok:false,error:'platform_establishments_failed'})}});

app.post('/api/platform/onboard',...requireRole('platform_admin'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{};
  const schoolYear=Number(b.school_year);
  const name=String(b.name||'').trim(),rbd=String(b.rbd||'').trim();
  const coordinatorName=String(b.coordinator_name||'').trim(),coordinatorEmail=String(b.coordinator_email||'').trim().toLowerCase();
  const coordinatorRut=String(b.coordinator_rut||'').trim()||null;
  const temporaryPassword=String(b.temporary_password||'');
  if(!name||!rbd||!coordinatorName||!coordinatorEmail||!coordinatorEmail.includes('@')||!Number.isInteger(schoolYear)||schoolYear<2020||schoolYear>2100)return res.status(400).json({ok:false,error:'required_fields'});
  if(temporaryPassword.length<10||!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(temporaryPassword)||!/[0-9]/.test(temporaryPassword))return res.status(400).json({ok:false,error:'weak_temporary_password'});
  const existing=await client.query("select id from establishments where rbd=$1",[rbd]);
  if(existing.rowCount)return res.status(409).json({ok:false,error:'rbd_exists'});

  await client.query('begin');
  const est=await client.query("insert into establishments(name,rbd) values($1,$2) returning id,name,rbd,created_at",[name,rbd]);
  const cred=await makePassword(temporaryPassword);
  const user=await client.query(`insert into users(establishment_id,email,rut,name,role,password_hash,password_salt,must_change_password,active)
    values($1,$2,$3,$4,'coordinador_convivencia',$5,$6,true,true)
    returning id,establishment_id,email,rut,name,role,active,must_change_password,created_at`,
    [est.rows[0].id,coordinatorEmail,coordinatorRut,coordinatorName,cred.hash,cred.salt]);
  const measurements=[];
  for(const code of ['M1','M2','M3']){
    const m=await client.query("insert into measurements(establishment_id,code,school_year,status) values($1,$2,$3,'draft') returning id,code,school_year,status",[est.rows[0].id,code,schoolYear]);
    measurements.push(m.rows[0]);
  }
  await client.query("insert into professional_audit_events(establishment_id,user_id,action,entity_type,entity_id,metadata) values($1,$2,'establishment_onboarded','establishment',$3,$4::jsonb)",[est.rows[0].id,req.auth.id,String(est.rows[0].id),JSON.stringify({rbd,school_year:schoolYear,coordinator_user_id:user.rows[0].id})]);
  await client.query('commit');
  res.status(201).json({ok:true,establishment:est.rows[0],coordinator:user.rows[0],measurements});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/establishments',...requireRole('platform_admin'),async(req,res)=>{try{const {name,rbd}=req.body;if(!name)return res.status(400).json({ok:false,error:'name_required'});const q=await pool.query('insert into establishments(name,rbd) values($1,$2) on conflict(rbd) do update set name=excluded.name returning *',[name,rbd||null]);ok(res,{establishment:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/establishments',requireAuth,async(req,res)=>{const q=await pool.query('select id,name,rbd,created_at from establishments where id=$1',[req.auth.establishment_id]);ok(res,{establishments:q.rows})});
app.post('/api/users',...requireRole('coordinador_convivencia'),async(req,res)=>{try{
  const {establishment_id,email,rut,name,role}=req.body;
  const temporaryPassword=String((req.body||{}).temporary_password||'');
  if(Number(establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const allowedRoles=['coordinador_convivencia','dupla_psicosocial','profesor','asistente_educacion','prevencionista','nutricionista'];
  const cleanRole=canonicalRole(role||'',req.auth.rbd);
  if(!establishment_id||!email||!name||!allowedRoles.includes(cleanRole)||temporaryPassword.length<10||!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(temporaryPassword)||!/[0-9]/.test(temporaryPassword))return res.status(400).json({ok:false,error:'required_fields'});
  const cred=await makePassword(temporaryPassword);
  const q=await pool.query(`insert into users(establishment_id,email,rut,name,role,password_hash,password_salt,must_change_password)
    values($1,$2,$3,$4,$5,$6,$7,true)
    on conflict(establishment_id,email) do update set name=excluded.name,rut=excluded.rut,role=excluded.role,password_hash=excluded.password_hash,password_salt=excluded.password_salt,must_change_password=true,active=true
    returning id,establishment_id,email,rut,name,role,active,must_change_password,created_at`,
    [establishment_id,String(email).trim().toLowerCase(),rut||null,String(name).trim(),cleanRole,cred.hash,cred.salt]);
  await auditProfessional(req,'professional_account_upserted','user',q.rows[0].id,{role:q.rows[0].role,target_active:q.rows[0].active,must_change_password:q.rows[0].must_change_password});
  ok(res,{user:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/users',...requireRole('coordinador_convivencia'),async(req,res)=>{const q=await pool.query('select u.id,u.establishment_id,e.name establishment,u.email,u.rut,u.name,u.role,u.active,u.must_change_password,u.last_login_at,u.created_at from users u join establishments e on e.id=u.establishment_id where u.establishment_id=$1 order by u.name',[req.auth.establishment_id]);ok(res,{users:q.rows})});
app.post('/api/users/:id/status',...requireRole('coordinador_convivencia'),async(req,res)=>{try{
  const active=(req.body||{}).active;
  if(typeof active!=='boolean')return res.status(400).json({ok:false,error:'invalid_status_payload'});
  const target=await pool.query("select id,establishment_id,role,active from users where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!target.rowCount)return res.status(404).json({ok:false,error:'user_not_found'});
  if(Number(target.rows[0].id)===Number(req.auth.id)&&active===false)return res.status(409).json({ok:false,error:'cannot_deactivate_self'});
  if(active===false&&canonicalRole(target.rows[0].role,req.auth.rbd)==='coordinador_convivencia'){
    const q=await pool.query("select count(*)::int total from users where establishment_id=$1 and active=true and id<>$2 and role='coordinador_convivencia'",[req.auth.establishment_id,req.params.id]);
    if(Number(q.rows[0].total)<1)return res.status(409).json({ok:false,error:'last_coordinator'});
  }
  const q=await pool.query("update users set active=$1 where id=$2 and establishment_id=$3 returning id,establishment_id,email,rut,name,role,active,must_change_password,last_login_at,created_at",[active,req.params.id,req.auth.establishment_id]);
  if(active===false)await pool.query("delete from auth_sessions where user_id=$1",[req.params.id]);
  await auditProfessional(req,active?'professional_account_reactivated':'professional_account_deactivated','user',q.rows[0].id,{role:q.rows[0].role});
  ok(res,{user:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.get('/api/audit',...requireRole('coordinador_convivencia'),async(req,res)=>{try{
  const establishmentId=Number(req.query.establishment_id||req.auth.establishment_id);
  if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));
  const q=await pool.query(`select a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.name professional,u.role
    from professional_audit_events a left join users u on u.id=a.user_id
    where a.establishment_id=$1 order by a.created_at desc limit $2`,[establishmentId,limit]);
  ok(res,{events:q.rows});
}catch(e){res.status(400).json({ok:false,error:'audit_load_failed'})}});

app.get('/api/resources',requireAuth,async(req,res)=>{try{
  const role=canonicalRole(req.auth.role,req.auth.rbd),manager=['coordinador_convivencia','dupla_psicosocial'].includes(role);
  const values=[req.auth.establishment_id];let where="r.establishment_id=$1 and r.active=true";
  if(!manager)where+=" and r.visibility='all_professionals'";
  if(req.query.type){values.push(String(req.query.type));where+=" and r.resource_type=$"+values.length}
  const q=await pool.query(`select r.id,r.title,r.description,r.resource_type,r.audience,r.visibility,r.url,r.tags,r.active,r.created_at,r.updated_at,u.name created_by_name
    from institutional_resources r join users u on u.id=r.created_by
    where ${where} order by r.resource_type,r.title`,values);
  ok(res,{resources:q.rows});
}catch(e){res.status(400).json({ok:false,error:'resources_load_failed'})}});

app.post('/api/resources',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const b=req.body||{},title=String(b.title||'').trim(),description=String(b.description||'').trim(),url=String(b.url||'').trim();
  const type=String(b.resource_type||''),audience=String(b.audience||'profesionales'),visibility=String(b.visibility||'all_professionals');
  if(!title||title.length>220||description.length>4000||!['ppt','cuadernillo','infografia','lectura','matriz','acta','evaluacion','guia','otro'].includes(type)||!['profesionales','estudiantes','familias','general'].includes(audience)||!['all_professionals','management'].includes(visibility))return res.status(400).json({ok:false,error:'invalid_resource_payload'});
  let parsed;try{parsed=new URL(url)}catch(_){return res.status(400).json({ok:false,error:'invalid_resource_url'})}
  if(parsed.protocol!=='https:')return res.status(400).json({ok:false,error:'https_resource_required'});
  const tags=Array.isArray(b.tags)?b.tags.map(x=>String(x).trim().slice(0,80)).filter(Boolean).slice(0,20):[];
  const q=await pool.query(`insert into institutional_resources(establishment_id,title,description,resource_type,audience,visibility,url,tags,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [req.auth.establishment_id,title,description||null,type,audience,visibility,url,tags,req.auth.id]);
  await auditProfessional(req,'institutional_resource_created','resource',q.rows[0].id,{resource_type:type,audience,visibility});
  res.status(201).json({ok:true,resource:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/resources/:id/status',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const active=(req.body||{}).active;
  if(typeof active!=='boolean')return res.status(400).json({ok:false,error:'invalid_status_payload'});
  const q=await pool.query("update institutional_resources set active=$1,updated_at=now() where id=$2 and establishment_id=$3 returning *",[active,req.params.id,req.auth.establishment_id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'resource_not_found'});
  await auditProfessional(req,active?'institutional_resource_activated':'institutional_resource_deactivated','resource',req.params.id,{});
  ok(res,{resource:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.get('/api/protocols',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const q=await pool.query("select id,name,description,default_days,active,created_at,updated_at from case_protocols where establishment_id=$1 order by active desc,name",[req.auth.establishment_id]);
  ok(res,{protocols:q.rows});
}catch(e){res.status(400).json({ok:false,error:'protocols_load_failed'})}});

app.post('/api/protocols',...requireRole('coordinador_convivencia'),async(req,res)=>{try{
  const b=req.body||{},name=String(b.name||'').trim(),description=String(b.description||'').trim(),days=b.default_days===null||b.default_days===''?null:Number(b.default_days);
  if(!name||name.length>180||description.length>3000||!(days===null||(Number.isInteger(days)&&days>=1&&days<=365)))return res.status(400).json({ok:false,error:'invalid_protocol_payload'});
  const q=await pool.query(`insert into case_protocols(establishment_id,name,description,default_days,created_by)
    values($1,$2,$3,$4,$5)
    on conflict(establishment_id,name) do update set description=excluded.description,default_days=excluded.default_days,active=true,updated_at=now()
    returning *`,[req.auth.establishment_id,name,description||null,days,req.auth.id]);
  await auditProfessional(req,'case_protocol_saved','case_protocol',q.rows[0].id,{name,default_days:days});
  ok(res,{protocol:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/protocols/:id/status',...requireRole('coordinador_convivencia'),async(req,res)=>{try{
  const active=(req.body||{}).active;
  if(typeof active!=='boolean')return res.status(400).json({ok:false,error:'invalid_status_payload'});
  const q=await pool.query("update case_protocols set active=$1,updated_at=now() where id=$2 and establishment_id=$3 returning *",[active,req.params.id,req.auth.establishment_id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'protocol_not_found'});
  await auditProfessional(req,active?'case_protocol_activated':'case_protocol_deactivated','case_protocol',req.params.id,{});
  ok(res,{protocol:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.get('/api/protocols/:id/steps',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const p=await pool.query("select id,name,active from case_protocols where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!p.rowCount)return res.status(404).json({ok:false,error:'protocol_not_found'});
  const q=await pool.query("select id,protocol_id,step_order,title,description,due_offset_days,required,created_at from case_protocol_steps where protocol_id=$1 order by step_order",[req.params.id]);
  ok(res,{protocol:p.rows[0],steps:q.rows});
}catch(e){res.status(400).json({ok:false,error:'protocol_steps_load_failed'})}});

app.post('/api/protocols/:id/steps',...requireRole('coordinador_convivencia'),async(req,res)=>{const client=await pool.connect();try{
  const p=await client.query("select id,name from case_protocols where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!p.rowCount)return res.status(404).json({ok:false,error:'protocol_not_found'});
  const steps=Array.isArray((req.body||{}).steps)?req.body.steps:null;
  if(!steps||steps.length>50)return res.status(400).json({ok:false,error:'invalid_protocol_steps'});
  const clean=[];
  for(let i=0;i<steps.length;i++){
    const s=steps[i]||{},title=String(s.title||'').trim(),description=String(s.description||'').trim();
    const due=s.due_offset_days===null||s.due_offset_days===''||s.due_offset_days===undefined?null:Number(s.due_offset_days);
    const required=s.required!==false;
    if(!title||title.length>220||description.length>2000||!(due===null||(Number.isInteger(due)&&due>=0&&due<=365)))return res.status(400).json({ok:false,error:'invalid_protocol_step',step:i+1});
    clean.push({step_order:i+1,title,description:description||null,due_offset_days:due,required});
  }
  await client.query('begin');
  await client.query("delete from case_protocol_steps where protocol_id=$1",[req.params.id]);
  const saved=[];
  for(const s of clean){
    const q=await client.query("insert into case_protocol_steps(protocol_id,step_order,title,description,due_offset_days,required) values($1,$2,$3,$4,$5,$6) returning *",[req.params.id,s.step_order,s.title,s.description,s.due_offset_days,s.required]);
    saved.push(q.rows[0]);
  }
  await client.query("update case_protocols set updated_at=now() where id=$1",[req.params.id]);
  await client.query('commit');
  await auditProfessional(req,'case_protocol_steps_saved','case_protocol',req.params.id,{steps:saved.length});
  ok(res,{protocol:p.rows[0],steps:saved});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});
app.get('/api/cases',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const values=[req.auth.establishment_id];let where="c.establishment_id=$1";
  if(req.query.status){values.push(String(req.query.status));where+=" and c.status=$"+values.length}
  const q=await pool.query(`select c.id,c.protocol_id,c.student_id,c.course_id,c.title,c.priority,c.status,c.opened_at,c.due_date,c.closed_at,c.updated_at,
    p.name protocol,s.name student,co.name course,u.name created_by_name,
    (select count(*)::int from case_actions a where a.case_id=c.id) actions_count,
    (select count(*)::int from case_required_steps rs where rs.case_id=c.id and rs.required=true) required_steps_count,
    (select count(*)::int from case_required_steps rs where rs.case_id=c.id and rs.required=true and rs.status='pending') pending_required_steps
    from case_records c
    left join case_protocols p on p.id=c.protocol_id
    left join students s on s.id=c.student_id
    left join courses co on co.id=c.course_id
    join users u on u.id=c.created_by
    where ${where}
    order by case when c.status='closed' then 2 else 1 end,c.due_date nulls last,c.opened_at desc`,values);
  ok(res,{cases:q.rows});
}catch(e){res.status(400).json({ok:false,error:'cases_load_failed'})}});

app.post('/api/cases',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{},title=String(b.title||'').trim(),summary=String(b.summary||'').trim(),priority=String(b.priority||'medium');
  const protocolId=Number(b.protocol_id)||null,studentId=Number(b.student_id)||null,dueDate=b.due_date?String(b.due_date):null;
  if(!title||title.length>220||summary.length>5000||!['low','medium','high'].includes(priority))return res.status(400).json({ok:false,error:'invalid_case_payload'});
  if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return res.status(400).json({ok:false,error:'invalid_due_date'});
  let protocol=null,student=null,courseId=null;
  if(protocolId){
    const p=await client.query("select id,name,default_days,active from case_protocols where id=$1 and establishment_id=$2",[protocolId,req.auth.establishment_id]);
    if(!p.rowCount)return res.status(404).json({ok:false,error:'protocol_not_found'});
    if(!p.rows[0].active)return res.status(409).json({ok:false,error:'protocol_inactive'});
    protocol=p.rows[0];
  }
  if(studentId){
    const s=await client.query("select id,name,course_id from students where id=$1 and establishment_id=$2",[studentId,req.auth.establishment_id]);
    if(!s.rowCount)return res.status(404).json({ok:false,error:'student_not_found'});
    student=s.rows[0];courseId=student.course_id;
  }
  let finalDue=dueDate;
  if(!finalDue&&protocol?.default_days){const dq=await client.query("select (((now() at time zone 'America/Santiago')::date + $1::int))::text due",[Number(protocol.default_days)]);finalDue=dq.rows[0].due}
  await client.query('begin');
  const q=await client.query("insert into case_records(establishment_id,protocol_id,student_id,course_id,title,summary,priority,due_date,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",[req.auth.establishment_id,protocolId,studentId,courseId,title,summary||null,priority,finalDue,req.auth.id]);
  let stepsCreated=0;
  if(protocolId){
    const templates=await client.query("select id,step_order,title,description,due_offset_days,required from case_protocol_steps where protocol_id=$1 order by step_order",[protocolId]);
    for(const step of templates.rows){
      let stepDue=null;
      if(step.due_offset_days!==null){const dq=await client.query("select (((now() at time zone 'America/Santiago')::date + $1::int))::text due",[Number(step.due_offset_days)]);stepDue=dq.rows[0].due}
      await client.query("insert into case_required_steps(case_id,protocol_step_id,step_order,title,description,due_date,required) values($1,$2,$3,$4,$5,$6,$7)",[q.rows[0].id,step.id,step.step_order,step.title,step.description,stepDue,step.required]);
      stepsCreated++;
    }
  }
  await client.query('commit');
  await auditProfessional(req,'case_opened','case',q.rows[0].id,{protocol_id:protocolId,student_id:studentId,priority,due_date:finalDue,required_steps_created:stepsCreated});
  res.status(201).json({ok:true,case:q.rows[0],required_steps_created:stepsCreated});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});
app.get('/api/cases/:id',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const q=await pool.query(`select c.*,p.name protocol,p.description protocol_description,s.name student,co.name course,u.name created_by_name
    from case_records c left join case_protocols p on p.id=c.protocol_id left join students s on s.id=c.student_id left join courses co on co.id=c.course_id join users u on u.id=c.created_by
    where c.id=$1 and c.establishment_id=$2`,[req.params.id,req.auth.establishment_id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'case_not_found'});
  const a=await pool.query(`select a.id,a.action_type,a.note,a.action_date,a.responsible_user_id,a.due_date,a.created_at,u.name responsible,cb.name created_by_name
    from case_actions a left join users u on u.id=a.responsible_user_id join users cb on cb.id=a.created_by
    where a.case_id=$1 order by a.action_date,a.id`,[req.params.id]);
  const steps=await pool.query(`select s.id,s.protocol_step_id,s.step_order,s.title,s.description,s.due_date,s.required,s.status,s.completed_at,s.completion_note,u.name completed_by_name
    from case_required_steps s left join users u on u.id=s.completed_by
    where s.case_id=$1 order by s.step_order,s.id`,[req.params.id]);
  ok(res,{case:q.rows[0],actions:a.rows,required_steps:steps.rows});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/cases/:id/actions',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{},type=String(b.action_type||'seguimiento').trim(),note=String(b.note||'').trim(),responsibleUserId=Number(b.responsible_user_id)||null,dueDate=b.due_date?String(b.due_date):null;
  if(!type||type.length>120||!note||note.length>5000)return res.status(400).json({ok:false,error:'invalid_case_action'});
  if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return res.status(400).json({ok:false,error:'invalid_due_date'});
  const cs=await client.query("select id,title,status from case_records where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!cs.rowCount)return res.status(404).json({ok:false,error:'case_not_found'});
  if(cs.rows[0].status==='closed')return res.status(409).json({ok:false,error:'case_closed'});
  let responsible=null;if(responsibleUserId){const ru=await client.query("select id,name from users where id=$1 and establishment_id=$2 and active=true",[responsibleUserId,req.auth.establishment_id]);if(!ru.rowCount)return res.status(404).json({ok:false,error:'responsible_user_not_found'});responsible=ru.rows[0]}
  await client.query('begin');
  const q=await client.query(`insert into case_actions(case_id,action_type,note,responsible_user_id,due_date,created_by)
    values($1,$2,$3,$4,$5,$6) returning *`,[req.params.id,type,note,responsibleUserId,dueDate,req.auth.id]);
  await client.query("update case_records set status=case when status='open' then 'in_progress' else status end,updated_at=now() where id=$1",[req.params.id]);
  let task=null;
  if(responsibleUserId&&dueDate){
    const tq=await client.query(`insert into professional_tasks(establishment_id,title,description,assigned_to,assigned_by,due_date,priority,related_type,related_id)
      values($1,$2,$3,$4,$5,$6,'medium','case_action',$7) returning *`,
      [req.auth.establishment_id,'Caso #'+req.params.id+' · '+type,note.slice(0,2000),responsibleUserId,req.auth.id,dueDate,String(q.rows[0].id)]);
    task=tq.rows[0];
    await client.query(`insert into professional_notifications(establishment_id,user_id,kind,title,message,link)
      values($1,$2,'case_task',$3,$4,$5)`,
      [req.auth.establishment_id,responsibleUserId,'Nueva actuación de caso','Se te asignó una actuación con plazo '+dueDate+'.','notificaciones.html#tareas']);
  }
  await client.query('commit');
  await auditProfessional(req,'case_action_added','case',req.params.id,{action_id:q.rows[0].id,action_type:type,responsible_user_id:responsibleUserId,due_date:dueDate});
  if(task)await auditProfessional(req,'professional_task_created','task',task.id,{assigned_to:responsibleUserId,due_date:dueDate,related_type:'case_action',related_id:q.rows[0].id});
  res.status(201).json({ok:true,action:{...q.rows[0],responsible:responsible?.name||null},task});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/cases/:id/steps/:stepId/status',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const status=String((req.body||{}).status||''),note=String((req.body||{}).note||'').trim();
  if(!['pending','completed','not_applicable'].includes(status))return res.status(400).json({ok:false,error:'invalid_case_step_status'});
  if(note.length>2000)return res.status(400).json({ok:false,error:'case_step_note_too_long'});
  if(status==='not_applicable'&&!note)return res.status(400).json({ok:false,error:'not_applicable_note_required'});
  const cs=await pool.query("select id,status from case_records where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!cs.rowCount)return res.status(404).json({ok:false,error:'case_not_found'});
  if(cs.rows[0].status==='closed')return res.status(409).json({ok:false,error:'case_closed'});
  const step=await pool.query("select id,title,required from case_required_steps where id=$1 and case_id=$2",[req.params.stepId,req.params.id]);
  if(!step.rowCount)return res.status(404).json({ok:false,error:'case_step_not_found'});
  const q=await pool.query("update case_required_steps set status=$1,completed_at=case when $1='pending' then null else now() end,completed_by=case when $1='pending' then null else $2::bigint end,completion_note=case when $1='pending' then null else nullif($3,'') end where id=$4 returning *",[status,req.auth.id,note,req.params.stepId]);
  await auditProfessional(req,'case_protocol_step_updated','case',req.params.id,{step_id:Number(req.params.stepId),step_title:step.rows[0].title,status,required:step.rows[0].required});
  ok(res,{step:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/cases/:id/status',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const status=String((req.body||{}).status||'');
  if(!['open','in_progress','closed'].includes(status))return res.status(400).json({ok:false,error:'invalid_case_status'});
  await client.query('begin');
  if(status==='closed'){
    const pending=await client.query("select count(*)::int total from case_required_steps where case_id=$1 and required=true and status='pending'",[req.params.id]);
    if(Number(pending.rows[0].total)>0){await client.query('rollback');return res.status(409).json({ok:false,error:'required_protocol_steps_pending',pending_required_steps:Number(pending.rows[0].total)})}
  }
  const q=await client.query(`update case_records set status=$1,closed_at=case when $1='closed' then now() else null end,updated_at=now()
    where id=$2 and establishment_id=$3 returning *`,[status,req.params.id,req.auth.establishment_id]);
  if(!q.rowCount){await client.query('rollback');return res.status(404).json({ok:false,error:'case_not_found'})}

  let cancelledTasks=[];
  if(status==='closed'){
    const tq=await client.query(`update professional_tasks t set status='cancelled',updated_at=now()
      where t.establishment_id=$1 and t.related_type='case_action' and t.status not in ('completed','cancelled')
      and t.related_id in (select a.id::text from case_actions a where a.case_id=$2)
      returning t.id,t.assigned_to,t.title`,[req.auth.establishment_id,req.params.id]);
    cancelledTasks=tq.rows;
    for(const task of cancelledTasks){
      await client.query(`insert into professional_notifications(establishment_id,user_id,kind,title,message,link)
        values($1,$2,'case_closed',$3,$4,'notificaciones.html#tareas')`,
        [req.auth.establishment_id,task.assigned_to,'Tarea cancelada por cierre de caso: '+task.title,'El caso asociado fue cerrado por el equipo de Convivencia.']);
    }
  }

  await client.query('commit');
  await auditProfessional(req,'case_status_changed','case',req.params.id,{status,cancelled_tasks:cancelledTasks.length});
  for(const task of cancelledTasks)await auditProfessional(req,'professional_task_status_changed','task',task.id,{status:'cancelled',source:'case_closed'});
  ok(res,{case:q.rows[0],cancelled_tasks:cancelledTasks});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.get('/api/team',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const q=await pool.query("select id,name,role,active from users where establishment_id=$1 and active=true order by name",[req.auth.establishment_id]);
  ok(res,{users:q.rows});
}catch(e){res.status(400).json({ok:false,error:'team_load_failed'})}});

app.get('/api/tasks',requireAuth,async(req,res)=>{try{
  const scope=String(req.query.scope||'mine');
  const role=canonicalRole(req.auth.role,req.auth.rbd);
  const manager=['coordinador_convivencia','dupla_psicosocial'].includes(role);
  const values=[req.auth.establishment_id];
  let where="t.establishment_id=$1";
  if(scope==='all'){
    if(!manager)return res.status(403).json({ok:false,error:'role_forbidden'});
  }else if(scope==='created'){
    if(!manager)return res.status(403).json({ok:false,error:'role_forbidden'});
    values.push(req.auth.id);where+=" and t.assigned_by=$2";
  }else{
    values.push(req.auth.id);where+=" and t.assigned_to=$2";
  }
  const q=await pool.query(`select t.id,t.establishment_id,t.title,t.description,t.assigned_to,t.assigned_by,t.due_date,t.priority,t.status,t.related_type,t.related_id,t.completed_at,t.created_at,t.updated_at,
    assignee.name assigned_to_name,assignee.role assigned_to_role,assigner.name assigned_by_name
    from professional_tasks t
    join users assignee on assignee.id=t.assigned_to
    join users assigner on assigner.id=t.assigned_by
    where ${where}
    order by case when t.status='completed' then 2 when t.status='cancelled' then 3 else 1 end,
      t.due_date nulls last,t.created_at desc`,values);
  ok(res,{tasks:q.rows});
}catch(e){res.status(400).json({ok:false,error:'tasks_load_failed'})}});

app.post('/api/tasks',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{},title=String(b.title||'').trim(),description=String(b.description||'').trim();
  const assignedTo=Number(b.assigned_to),priority=String(b.priority||'medium'),dueDate=b.due_date?String(b.due_date):null;
  if(!title||title.length>200||description.length>2000||!assignedTo||!['low','medium','high'].includes(priority))return res.status(400).json({ok:false,error:'invalid_task_payload'});
  if(dueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))return res.status(400).json({ok:false,error:'invalid_due_date'});
  const target=await client.query("select id,name,role from users where id=$1 and establishment_id=$2 and active=true",[assignedTo,req.auth.establishment_id]);
  if(!target.rowCount)return res.status(404).json({ok:false,error:'assignee_not_found'});
  await client.query('begin');
  const q=await client.query(`insert into professional_tasks(establishment_id,title,description,assigned_to,assigned_by,due_date,priority,related_type,related_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning *`,[req.auth.establishment_id,title,description||null,assignedTo,req.auth.id,dueDate,priority,b.related_type||null,b.related_id==null?null:String(b.related_id)]);
  await client.query(`insert into professional_notifications(establishment_id,user_id,kind,title,message,link)
    values($1,$2,'task_assigned',$3,$4,'notificaciones.html#tareas')`,
    [req.auth.establishment_id,assignedTo,'Nueva tarea: '+title,(req.auth.name||'Un profesional')+' te asignó una tarea'+(dueDate?' con plazo '+dueDate:'')+'.']);
  await client.query('commit');
  await auditProfessional(req,'professional_task_created','task',q.rows[0].id,{assigned_to:assignedTo,due_date:dueDate,priority});
  res.status(201).json({ok:true,task:{...q.rows[0],assigned_to_name:target.rows[0].name,assigned_by_name:req.auth.name||null}});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/tasks/:id/status',requireAuth,async(req,res)=>{const client=await pool.connect();try{
  const status=String((req.body||{}).status||'');
  if(!['pending','in_progress','completed','cancelled'].includes(status))return res.status(400).json({ok:false,error:'invalid_task_status'});
  const q=await client.query("select * from professional_tasks where id=$1 and establishment_id=$2",[req.params.id,req.auth.establishment_id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'task_not_found'});
  const task=q.rows[0],role=canonicalRole(req.auth.role,req.auth.rbd),manager=['coordinador_convivencia','dupla_psicosocial'].includes(role);
  if(Number(task.assigned_to)!==Number(req.auth.id)&&!manager)return res.status(403).json({ok:false,error:'task_forbidden'});
  if(!manager&&status==='cancelled')return res.status(403).json({ok:false,error:'task_cancel_forbidden'});

  await client.query('begin');
  const upd=await client.query(`update professional_tasks set status=$1,completed_at=case when $1='completed' then now() else null end,updated_at=now()
    where id=$2 returning *`,[status,req.params.id]);
  if(Number(task.assigned_by)!==Number(req.auth.id)){
    await client.query(`insert into professional_notifications(establishment_id,user_id,kind,title,message,link)
      values($1,$2,'task_status',$3,$4,'notificaciones.html#tareas')`,
      [req.auth.establishment_id,task.assigned_by,'Actualización de tarea: '+task.title,(req.auth.name||'El responsable')+' cambió el estado a '+status+'.']);
  }
  await client.query('commit');
  await auditProfessional(req,'professional_task_status_changed','task',req.params.id,{status});
  ok(res,{task:upd.rows[0]});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.get('/api/notifications',requireAuth,async(req,res)=>{try{
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));
  const q=await pool.query(`select id,kind,title,message,link,read_at,created_at
    from professional_notifications where establishment_id=$1 and user_id=$2
    order by created_at desc limit $3`,[req.auth.establishment_id,req.auth.id,limit]);
  const unread=await pool.query("select count(*)::int total from professional_notifications where establishment_id=$1 and user_id=$2 and read_at is null",[req.auth.establishment_id,req.auth.id]);
  ok(res,{notifications:q.rows,unread:Number(unread.rows[0].total)});
}catch(e){res.status(400).json({ok:false,error:'notifications_load_failed'})}});

app.post('/api/notifications/:id/read',requireAuth,async(req,res)=>{try{
  const q=await pool.query("update professional_notifications set read_at=coalesce(read_at,now()) where id=$1 and establishment_id=$2 and user_id=$3 returning id,read_at",[req.params.id,req.auth.establishment_id,req.auth.id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'notification_not_found'});
  ok(res,{notification:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:'notification_update_failed'})}});

app.post('/api/notifications/read-all',requireAuth,async(req,res)=>{try{
  const q=await pool.query("update professional_notifications set read_at=coalesce(read_at,now()) where establishment_id=$1 and user_id=$2 and read_at is null",[req.auth.establishment_id,req.auth.id]);
  ok(res,{updated:q.rowCount});
}catch(e){res.status(400).json({ok:false,error:'notifications_update_failed'})}});

app.post('/api/courses',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const {establishment_id,name,school_year}=req.body,year=Number(school_year),clean=String(name||'').trim();if(Number(establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishment_id||!clean||!Number.isInteger(year)||year<2020||year>2100)return res.status(400).json({ok:false,error:'required_fields'});const q=await pool.query('insert into courses(establishment_id,name,school_year) values($1,$2,$3) on conflict(establishment_id,name,school_year) do update set name=excluded.name returning *',[establishment_id,clean,year]);ok(res,{course:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/courses',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const q=await pool.query(`select c.*,e.name establishment,exists(select 1 from course_access_codes cac where cac.course_id=c.id) access_code_configured from courses c join establishments e on e.id=c.establishment_id where c.establishment_id=$1 order by c.school_year desc,c.name`,[establishmentId]);ok(res,{courses:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/courses/:id/access-code',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const code=String((req.body||{}).code||'').trim();
  if(!/^\d{4}$/.test(code))return res.status(400).json({ok:false,error:'course_code_must_be_4_digits'});
  const course=await pool.query("select id,establishment_id,name,school_year from courses where id=$1",[req.params.id]);
  if(!course.rowCount)return res.status(404).json({ok:false,error:'course_not_found'});
  if(Number(course.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const cred=await makePassword(code);
  await pool.query(`insert into course_access_codes(course_id,code_hash,code_salt,updated_by,updated_at)
    values($1,$2,$3,$4,now())
    on conflict(course_id) do update set code_hash=excluded.code_hash,code_salt=excluded.code_salt,updated_by=excluded.updated_by,updated_at=now()`,
    [req.params.id,cred.hash,cred.salt,req.auth.id]);
  const invalidated=await pool.query(`update survey_applications a set access_token_hash=null,access_token_created_at=null,access_method=null,access_requires_pin_setup=false
    where a.student_id in (select id from students where course_id=$1)
      and a.status<>'completed' and a.access_method='course_code' and a.access_requires_pin_setup=true
    returning a.id`,[req.params.id]);
  await auditProfessional(req,'course_access_code_changed','course',req.params.id,{course:course.rows[0].name,school_year:course.rows[0].school_year,invalidated_initial_accesses:invalidated.rowCount});
  ok(res,{course_id:Number(req.params.id),configured:true,invalidated_initial_accesses:invalidated.rowCount});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/students/:id/reset-pin',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const student=await pool.query("select id,establishment_id,name from students where id=$1",[req.params.id]);
  if(!student.rowCount)return res.status(404).json({ok:false,error:'student_not_found'});
  if(Number(student.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  await pool.query(`insert into student_credentials(student_id,pin_hash,pin_salt,failed_login_count,locked_until,updated_at)
    values($1,null,null,0,null,now())
    on conflict(student_id) do update set pin_hash=null,pin_salt=null,failed_login_count=0,locked_until=null,updated_at=now()`,[req.params.id]);
  const invalidated=await pool.query(`update survey_applications set access_token_hash=null,access_token_created_at=null,access_method=null,access_requires_pin_setup=false
    where student_id=$1 and status<>'completed' and access_method in ('personal_pin','course_code') returning id`,[req.params.id]);
  await auditProfessional(req,'student_pin_reset','student',req.params.id,{student:student.rows[0].name,invalidated_pin_accesses:invalidated.rowCount});
  ok(res,{student_id:Number(req.params.id),pin_reset:true,invalidated_pin_accesses:invalidated.rowCount});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/student-access/login',studentLoginRateLimit,async(req,res)=>{try{
  const b=req.body||{},establishmentId=Number(b.establishment_id),measurementId=Number(b.measurement_id||0);
  const rut=normalizeRut(b.rut),secret=String(b.secret||'').trim();
  if(!establishmentId||!rut||!validRut(rut)||!/^\d{4}$/.test(secret))return res.status(401).json({ok:false,error:'invalid_student_credentials'});

  const sq=await pool.query(`select s.id,s.name,s.rut,s.course_id,s.active,c.name course,c.school_year,c.establishment_id
    from students s join courses c on c.id=s.course_id
    where s.establishment_id=$1 and s.rut=$2 and s.active=true limit 1`,[establishmentId,rut]);
  if(!sq.rowCount)return res.status(401).json({ok:false,error:'invalid_student_credentials'});
  const student=sq.rows[0];

  let credQ=await pool.query("select student_id,pin_hash,pin_salt,failed_login_count,locked_until from student_credentials where student_id=$1",[student.id]);
  if(!credQ.rowCount){
    await pool.query("insert into student_credentials(student_id) values($1) on conflict(student_id) do nothing",[student.id]);
    credQ=await pool.query("select student_id,pin_hash,pin_salt,failed_login_count,locked_until from student_credentials where student_id=$1",[student.id]);
  }
  const cred=credQ.rows[0];
  if(cred.locked_until&&new Date(cred.locked_until)>new Date())return res.status(429).json({ok:false,error:'student_access_temporarily_locked'});

  let valid=false,firstAccess=!cred.pin_hash;
  if(firstAccess){
    const cq=await pool.query("select code_hash,code_salt from course_access_codes where course_id=$1",[student.course_id]);
    if(!cq.rowCount)return res.status(409).json({ok:false,error:'course_access_code_not_configured'});
    valid=await verifyPassword(secret,cq.rows[0].code_salt,cq.rows[0].code_hash);
  }else{
    valid=await verifyPassword(secret,cred.pin_salt,cred.pin_hash);
  }

  if(!valid){
    const fails=Number(cred.failed_login_count||0)+1;
    if(fails>=5)await pool.query("update student_credentials set failed_login_count=0,locked_until=now()+interval '15 minutes',updated_at=now() where student_id=$1",[student.id]);
    else await pool.query("update student_credentials set failed_login_count=$1,updated_at=now() where student_id=$2",[fails,student.id]);
    return res.status(401).json({ok:false,error:'invalid_student_credentials'});
  }
  await pool.query("update student_credentials set failed_login_count=0,locked_until=null,updated_at=now() where student_id=$1",[student.id]);

  const values=[student.id,establishmentId];
  let sql=`select a.id application_id,a.status,a.survey_level,m.id measurement_id,m.code measurement,m.school_year
    from survey_applications a join measurements m on m.id=a.measurement_id join measurement_settings ms on ms.measurement_id=m.id
    where a.student_id=$1 and m.establishment_id=$2 and a.status in ('pending','in_progress') and m.status='active'
      and ((now() at time zone 'America/Santiago')::date) between ms.start_date and ms.end_date`;
  if(measurementId){values.push(measurementId);sql+=' and m.id=$3'}
  sql+=" order by m.school_year desc,case m.code when 'M1' then 1 when 'M2' then 2 when 'M3' then 3 else 9 end";
  const apps=await pool.query(sql,values);
  if(!apps.rowCount)return res.status(409).json({ok:false,error:'no_active_application'});
  if(apps.rowCount>1&&!measurementId)return ok(res,{selection_required:true,student:{name:student.name,course:student.course},applications:apps.rows.map(x=>({measurement_id:Number(x.measurement_id),measurement:x.measurement,school_year:x.school_year}))});

  const app=apps.rows[0],token=newStudentAccessToken();
  await pool.query(`update survey_applications set access_token_hash=$1,access_token_created_at=now(),access_method=$2,access_requires_pin_setup=$3 where id=$4`,
    [sha256(token),firstAccess?'course_code':'personal_pin',firstAccess,app.application_id]);
  ok(res,{selection_required:false,student:{name:student.name,course:student.course},application:{id:Number(app.application_id),measurement_id:Number(app.measurement_id),measurement:app.measurement,school_year:app.school_year,status:app.status,survey_level:app.survey_level},access_token:token,requires_pin_setup:firstAccess});
}catch(e){res.status(400).json({ok:false,error:'student_access_login_failed'})}});

app.post('/api/student-access/set-pin',studentPinRateLimit,async(req,res)=>{try{
  const b=req.body||{},applicationId=Number(b.application_id),access=String(b.access||''),pin=String(b.new_pin||'').trim();
  if(!applicationId||!/^\d{4}$/.test(pin))return res.status(400).json({ok:false,error:'pin_must_be_4_digits'});
  const q=await pool.query(`select a.id,a.access_token_hash,a.access_method,a.access_requires_pin_setup,s.id student_id,s.course_id,cac.code_hash,cac.code_salt
    from survey_applications a join students s on s.id=a.student_id
    left join course_access_codes cac on cac.course_id=s.course_id
    where a.id=$1`,[applicationId]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  const row=q.rows[0];
  if(!studentAccessValid(row.access_token_hash,access))return res.status(403).json({ok:false,error:'invalid_student_access'});
  if(row.access_method!=='course_code'||row.access_requires_pin_setup!==true)return res.status(409).json({ok:false,error:'pin_setup_not_required'});
  if(row.code_hash&&await verifyPassword(pin,row.code_salt,row.code_hash))return res.status(400).json({ok:false,error:'pin_must_differ_from_course_code'});
  const cred=await makePassword(pin);
  await pool.query(`insert into student_credentials(student_id,pin_hash,pin_salt,failed_login_count,locked_until,updated_at)
    values($1,$2,$3,0,null,now())
    on conflict(student_id) do update set pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,failed_login_count=0,locked_until=null,updated_at=now()`,
    [row.student_id,cred.hash,cred.salt]);
  await pool.query("update survey_applications set access_method='personal_pin',access_requires_pin_setup=false where id=$1",[applicationId]);
  ok(res,{pin_set:true,application_id:applicationId});
}catch(e){res.status(400).json({ok:false,error:'pin_setup_failed'})}});



app.post('/api/students/import/preview',...requireRole('coordinador_convivencia','dupla_psicosocial'),matrículaUpload.array('files',20),async(req,res)=>{try{
  const establishmentId=Number(req.body.establishment_id),schoolYear=Number(req.body.school_year);
  if(!establishmentId||!Number.isInteger(schoolYear))throw new Error('establishment_and_year_required');
  if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const est=await pool.query("select id from establishments where id=$1",[establishmentId]);
  if(!est.rowCount)return res.status(404).json({ok:false,error:'establishment_not_found'});
  const files=req.files||[];if(!files.length)throw new Error('files_required');

  const cq=await pool.query("select id,name,school_year from courses where establishment_id=$1 and school_year=$2",[establishmentId,schoolYear]);
  const existingCourses=new Map(cq.rows.map(x=>[courseKey(x.name),x]));
  const sq=await pool.query("select id,rut,name,course_id from students where establishment_id=$1 and rut is not null",[establishmentId]);
  const existingStudents=new Map(sq.rows.map(x=>[normalizeRut(x.rut),x]));
  const seen=new Set(),rows=[],fileSummaries=[];

  for(const file of files){
    let parsed;
    try{parsed=await parseEnrollmentFile(file)}catch(e){fileSummaries.push({file:file.originalname,error:'file_unreadable'});continue}
    const sheet=parsed.rows||[],sheetName=parsed.sheet||'';
    if(!sheet.length){fileSummaries.push({file:file.originalname,error:'file_empty_or_headers_unrecognized'});continue}
    const limited=sheet.slice(0,5000);
    fileSummaries.push({file:file.originalname,sheet:sheetName,rows:limited.length,truncated:sheet.length>5000});
    for(let i=0;i<limited.length;i++){
      const sourceRow=Number(limited[i].__source_row||i+2);
      const p=parseStudentRow(limited[i],file.originalname,sourceRow);
      const errors=[],warnings=[];
      if(!p.rut||!validRut(p.rut))errors.push('run_invalido');
      if(!p.name)errors.push('nombre_faltante');
      const key=courseKey(p.course);
      if(!key||!surveyLevelForCourse(p.course))errors.push('curso_no_reconocido');
      if(p.rut&&seen.has(p.rut))errors.push('duplicado_en_archivos');
      if(p.rut)seen.add(p.rut);

      const course=key?existingCourses.get(key):null;
      if(key&&!course)warnings.push('curso_nuevo');
      const existing=p.rut?existingStudents.get(p.rut):null;
      if(existing)warnings.push('estudiante_existente');

      rows.push({...p,course_key:key,course_id:course?Number(course.id):null,course_name:course?course.name:p.course,existing_student_id:existing?Number(existing.id):null,errors,warnings,importable:errors.length===0});
    }
  }
  const summary={
    files:files.length,
    rows:rows.length,
    importable:rows.filter(x=>x.importable).length,
    errors:rows.filter(x=>!x.importable).length,
    new_students:rows.filter(x=>x.importable&&!x.existing_student_id).length,
    updates:rows.filter(x=>x.importable&&x.existing_student_id).length,
    new_courses:[...new Set(rows.filter(x=>x.importable&&x.warnings.includes('curso_nuevo')).map(x=>x.course_name))].length
  };
  ok(res,{summary,files:fileSummaries,rows});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/students/import/commit',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{},establishmentId=Number(b.establishment_id),schoolYear=Number(b.school_year),createCourses=b.create_missing_courses!==false;
  if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const rows=Array.isArray(b.rows)?b.rows:[];
  if(!establishmentId||!Number.isInteger(schoolYear)||!rows.length)throw new Error('invalid_import_payload');
  if(rows.length>10000)throw new Error('too_many_rows');
  const est=await client.query("select id from establishments where id=$1",[establishmentId]);
  if(!est.rowCount)throw new Error('establishment_not_found');

  await client.query('begin');
  const cq=await client.query("select id,name from courses where establishment_id=$1 and school_year=$2",[establishmentId,schoolYear]);
  const courseMap=new Map(cq.rows.map(x=>[courseKey(x.name),x]));
  const seen=new Set();let created=0,updated=0,skipped=0;const createdCourses=[];

  for(const raw of rows){
    const rut=normalizeRut(raw.rut),name=String(raw.name||'').trim(),courseName=String(raw.course_name||raw.course||'').trim(),key=courseKey(courseName);
    if(!rut||!validRut(rut)||!name||!key||!surveyLevelForCourse(courseName)||seen.has(rut)){skipped++;continue}
    seen.add(rut);
    let course=courseMap.get(key);
    if(!course){
      if(!createCourses){skipped++;continue}
      const ins=await client.query("insert into courses(establishment_id,name,school_year) values($1,$2,$3) on conflict(establishment_id,name,school_year) do update set name=excluded.name returning id,name",[establishmentId,courseName,schoolYear]);
      course=ins.rows[0];courseMap.set(key,course);createdCourses.push(course.name);
    }
    const exists=await client.query("select id from students where establishment_id=$1 and rut=$2",[establishmentId,rut]);
    const q=await client.query("insert into students(establishment_id,course_id,rut,name) values($1,$2,$3,$4) on conflict(establishment_id,rut) do update set course_id=excluded.course_id,name=excluded.name,active=true returning id",[establishmentId,course.id,rut,name]);
    if(!q.rowCount)throw new Error('student_upsert_failed');
    if(exists.rowCount)updated++;else created++;
  }
  await client.query('commit');
  ok(res,{result:{created,updated,skipped,created_courses:[...new Set(createdCourses)]}});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/students',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const {establishment_id,course_id,rut,name}=req.body;if(Number(establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const cleanName=String(name||'').trim(),cleanRut=String(rut||'').trim()||null;if(!establishment_id||!course_id||!cleanName)return res.status(400).json({ok:false,error:'required_fields'});const course=await pool.query('select establishment_id from courses where id=$1',[course_id]);if(!course.rowCount)return res.status(404).json({ok:false,error:'course_not_found'});if(Number(course.rows[0].establishment_id)!==Number(establishment_id))return res.status(400).json({ok:false,error:'course_establishment_mismatch'});let q;if(cleanRut){q=await pool.query('insert into students(establishment_id,course_id,rut,name) values($1,$2,$3,$4) on conflict(establishment_id,rut) do update set course_id=excluded.course_id,name=excluded.name,active=true returning *',[establishment_id,course_id,cleanRut,cleanName])}else{q=await pool.query('insert into students(establishment_id,course_id,rut,name) values($1,$2,$3,$4) returning *',[establishment_id,course_id,null,cleanName])}ok(res,{student:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/students',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const values=[establishmentId];let sql='select s.*,c.name course from students s left join courses c on c.id=s.course_id where s.establishment_id=$1';if(req.query.active==='true'||req.query.active==='false'){values.push(req.query.active==='true');sql+=' and s.active=$2'}sql+=' order by s.name';const q=await pool.query(sql,values);ok(res,{students:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/students/:id/status',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number((req.body||{}).establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const active=(req.body||{}).active;if(!establishmentId||typeof active!=='boolean')throw new Error('invalid_status_payload');const q=await pool.query("update students set active=$1,withdrawn_at=case when $1 then null else now() end where id=$2 and establishment_id=$3 returning id,establishment_id,course_id,rut,name,active,withdrawn_at",[active,req.params.id,establishmentId]);if(!q.rowCount)return res.status(404).json({ok:false,error:'student_not_found'});ok(res,{student:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/measurements',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const {establishment_id,code,school_year}=req.body;if(Number(establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const q=await pool.query('insert into measurements(establishment_id,code,school_year) values($1,$2,$3) on conflict(establishment_id,code,school_year) do update set status=measurements.status returning *',[establishment_id,code,school_year]);ok(res,{measurement:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/measurements',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const q=await pool.query('select m.*,e.name establishment from measurements m join establishments e on e.id=m.establishment_id where m.establishment_id=$1 order by m.school_year desc,m.code',[establishmentId]);ok(res,{measurements:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/measurements/:id/config',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const m=await pool.query("select id,establishment_id,code,school_year,status from measurements where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!m.rowCount)return res.status(404).json({ok:false,error:'measurement_not_found'});const q=await pool.query("select measurement_id,start_date,end_date,modality,estimated_minutes,initial_message,updated_at from measurement_settings where measurement_id=$1",[req.params.id]);const config=q.rowCount?q.rows[0]:{measurement_id:Number(req.params.id),start_date:null,end_date:null,modality:'individual',estimated_minutes:25,initial_message:'Responde con tranquilidad. No existen respuestas correctas o incorrectas. Tu opinión es importante.',updated_at:null};ok(res,{measurement:m.rows[0],config})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/measurements/:id/config',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const b=req.body||{},establishmentId=Number(b.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const minutes=Number(b.estimated_minutes);if(!establishmentId)throw new Error('establishment_id_required');const m=await pool.query("select id from measurements where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!m.rowCount)return res.status(404).json({ok:false,error:'measurement_not_found'});if(!/^\d{4}-\d{2}-\d{2}$/.test(String(b.start_date||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(b.end_date||'')))throw new Error('invalid_dates');if(new Date(b.end_date+'T00:00:00')<new Date(b.start_date+'T00:00:00'))throw new Error('end_date_before_start_date');if(!['individual','group_support'].includes(b.modality))throw new Error('invalid_modality');if(!Number.isInteger(minutes)||minutes<5||minutes>90)throw new Error('invalid_estimated_minutes');const message=String(b.initial_message||'').trim();if(!message||message.length>500)throw new Error('invalid_initial_message');const q=await pool.query("insert into measurement_settings(measurement_id,start_date,end_date,modality,estimated_minutes,initial_message,updated_at) values($1,$2,$3,$4,$5,$6,now()) on conflict(measurement_id) do update set start_date=excluded.start_date,end_date=excluded.end_date,modality=excluded.modality,estimated_minutes=excluded.estimated_minutes,initial_message=excluded.initial_message,updated_at=now() returning *",[req.params.id,b.start_date,b.end_date,b.modality,minutes,message]);await pool.query("update measurements set status='configured' where id=$1",[req.params.id]);await auditProfessional(req,'measurement_configured','measurement',req.params.id,{start_date:b.start_date,end_date:b.end_date,modality:b.modality,estimated_minutes:minutes});ok(res,{config:q.rows[0],measurement_status:'configured'})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/measurements/:id/activate',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number((req.body||{}).establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const m=await pool.query("select id,code,school_year,status from measurements where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!m.rowCount)return res.status(404).json({ok:false,error:'measurement_not_found'});const cfg=await pool.query("select measurement_id,start_date,end_date,case when ((now() at time zone 'America/Santiago')::date)<start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>end_date then 'closed' else 'open' end period_state from measurement_settings where measurement_id=$1",[req.params.id]);if(!cfg.rowCount)return res.status(409).json({ok:false,error:'measurement_not_configured'});if(cfg.rows[0].period_state!=='open')return res.status(409).json({ok:false,error:'measurement_period_not_open',period_state:cfg.rows[0].period_state,start_date:cfg.rows[0].start_date,end_date:cfg.rows[0].end_date});const apps=await pool.query("select count(*)::int total from survey_applications a join students s on s.id=a.student_id where a.measurement_id=$1 and s.establishment_id=$2",[req.params.id,establishmentId]);if(Number(apps.rows[0].total)<1)return res.status(409).json({ok:false,error:'measurement_without_applications'});const q=await pool.query("update measurements set status='active' where id=$1 returning id,establishment_id,code,school_year,status",[req.params.id]);await auditProfessional(req,'measurement_activated','measurement',req.params.id,{code:q.rows[0].code,school_year:q.rows[0].school_year,applications:Number(apps.rows[0].total)});ok(res,{measurement:q.rows[0],applications:Number(apps.rows[0].total)})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/applications',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id||0);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const studentId=Number(req.query.student_id||0);const measurementId=Number(req.query.measurement_id||0);const values=[];const filters=[];if(establishmentId){values.push(establishmentId);filters.push('s.establishment_id=$'+values.length)}if(studentId){values.push(studentId);filters.push('s.id=$'+values.length)}if(measurementId){values.push(measurementId);filters.push('a.measurement_id=$'+values.length)}const sql="select a.id,a.measurement_id,a.student_id,a.survey_level,a.status,a.started_at,a.completed_at,(a.access_token_hash is not null) has_access,coalesce(rv.status,'pending_review') review_status,s.name student,s.establishment_id,c.id course_id,c.name course,m.code measurement,m.school_year,e.name establishment from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join establishments e on e.id=s.establishment_id join measurements m on m.id=a.measurement_id left join application_reviews rv on rv.application_id=a.id"+(filters.length?" where "+filters.join(" and "):"")+" order by a.id desc";const q=await pool.query(sql,values);ok(res,{applications:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/applications',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const {measurement_id,student_id,survey_level}=req.body||{};
  if(!measurement_id||!student_id||!survey_level)return res.status(400).json({ok:false,error:'required_fields'});
  if(!['1-2','3-4','5-6','7-8','1-2-medio','3-4-medio'].includes(survey_level))return res.status(400).json({ok:false,error:'invalid_survey_level'});

  const ctx=await pool.query(`select s.establishment_id student_establishment,s.course_id,s.active student_active,c.name course_name,m.establishment_id measurement_establishment
    from students s left join courses c on c.id=s.course_id cross join measurements m
    where s.id=$1 and m.id=$2`,[student_id,measurement_id]);
  if(!ctx.rowCount)return res.status(404).json({ok:false,error:'student_or_measurement_not_found'});
  const row=ctx.rows[0];
  if(Number(row.student_establishment)!==Number(row.measurement_establishment))return res.status(400).json({ok:false,error:'establishment_mismatch'});
  if(Number(row.student_establishment)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  if(!row.student_active)return res.status(409).json({ok:false,error:'student_inactive'});
  const expected=surveyLevelForCourse(row.course_name);
  if(!expected)return res.status(400).json({ok:false,error:'course_level_unrecognized'});
  if(survey_level!==expected)return res.status(400).json({ok:false,error:'survey_level_course_mismatch',expected_level:expected});

  const prior=await pool.query("select id,measurement_id,student_id,survey_level,status,started_at,completed_at,(access_token_hash is not null) has_access from survey_applications where measurement_id=$1 and student_id=$2",[measurement_id,student_id]);
  if(prior.rowCount){
    if(prior.rows[0].status==='completed')return res.status(409).json({ok:false,error:'application_already_completed'});
    if(prior.rows[0].status==='in_progress')return res.status(409).json({ok:false,error:'application_already_started'});
    if(prior.rows[0].survey_level!==expected){
      await pool.query("update survey_applications set survey_level=$1 where id=$2",[expected,prior.rows[0].id]);
      prior.rows[0].survey_level=expected;
    }
    return ok(res,{application:prior.rows[0],created:false});
  }

  const q=await pool.query(`insert into survey_applications(measurement_id,student_id,survey_level)
    values($1,$2,$3)
    returning id,measurement_id,student_id,survey_level,status,started_at,completed_at,false has_access`,[measurement_id,student_id,expected]);
  await auditProfessional(req,'survey_application_assigned','application',q.rows[0].id,{measurement_id:Number(measurement_id),student_id:Number(student_id),survey_level:expected});
  res.status(201).json({ok:true,application:q.rows[0],created:true});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/applications/bulk-course',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const courseId=Number((req.body||{}).course_id),measurementId=Number((req.body||{}).measurement_id);
  if(!courseId||!measurementId)return res.status(400).json({ok:false,error:'required_fields'});

  const ctx=await client.query(`select c.id course_id,c.name course_name,c.establishment_id course_establishment,m.id measurement_id,m.code measurement_code,m.school_year,m.establishment_id measurement_establishment
    from courses c cross join measurements m where c.id=$1 and m.id=$2`,[courseId,measurementId]);
  if(!ctx.rowCount)return res.status(404).json({ok:false,error:'course_or_measurement_not_found'});
  const row=ctx.rows[0];
  if(Number(row.course_establishment)!==Number(row.measurement_establishment))return res.status(400).json({ok:false,error:'establishment_mismatch'});
  if(Number(row.course_establishment)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});

  const surveyLevel=surveyLevelForCourse(row.course_name);
  if(!surveyLevel)return res.status(400).json({ok:false,error:'course_level_unrecognized'});

  const students=await client.query("select id,name from students where establishment_id=$1 and course_id=$2 and active=true order by name",[req.auth.establishment_id,courseId]);
  if(!students.rowCount)return res.status(409).json({ok:false,error:'course_without_active_students'});

  await client.query('begin');
  let created=0,existing=0,locked=0;
  const applications=[];
  for(const student of students.rows){
    const prior=await client.query("select id,status,survey_level,(access_token_hash is not null) has_access from survey_applications where measurement_id=$1 and student_id=$2",[measurementId,student.id]);
    if(prior.rowCount){
      const app=prior.rows[0];
      if(app.status==='completed'||app.status==='in_progress'){
        locked++;
        applications.push({student_id:student.id,student:student.name,application_id:app.id,status:app.status,result:'preserved'});
        continue;
      }
      if(app.survey_level!==surveyLevel)await client.query("update survey_applications set survey_level=$1 where id=$2",[surveyLevel,app.id]);
      existing++;
      applications.push({student_id:student.id,student:student.name,application_id:app.id,status:app.status,result:'existing',has_access:app.has_access});
      continue;
    }

    const ins=await client.query("insert into survey_applications(measurement_id,student_id,survey_level) values($1,$2,$3) returning id,status",[measurementId,student.id,surveyLevel]);
    created++;
    applications.push({student_id:student.id,student:student.name,application_id:ins.rows[0].id,status:ins.rows[0].status,result:'created',has_access:false});
  }
  await client.query('commit');

  await auditProfessional(req,'survey_course_assigned','course',courseId,{measurement_id:measurementId,measurement_code:row.measurement_code,course_name:row.course_name,survey_level:surveyLevel,active_students:students.rowCount,created,existing,preserved_locked:locked});
  ok(res,{course:{id:courseId,name:row.course_name},measurement:{id:measurementId,code:row.measurement_code,school_year:row.school_year},survey_level:surveyLevel,active_students:students.rowCount,created,existing,preserved_locked:locked,applications});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/applications/access/bulk-course',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const client=await pool.connect();try{
  const courseId=Number((req.body||{}).course_id),measurementId=Number((req.body||{}).measurement_id),regenerateExisting=(req.body||{}).regenerate_existing===true;
  if(!courseId||!measurementId)return res.status(400).json({ok:false,error:'required_fields'});

  const ctx=await client.query(`select c.id course_id,c.name course_name,c.establishment_id course_establishment,m.id measurement_id,m.code measurement_code,m.school_year,m.establishment_id measurement_establishment
    from courses c cross join measurements m where c.id=$1 and m.id=$2`,[courseId,measurementId]);
  if(!ctx.rowCount)return res.status(404).json({ok:false,error:'course_or_measurement_not_found'});
  const row=ctx.rows[0];
  if(Number(row.course_establishment)!==Number(row.measurement_establishment))return res.status(400).json({ok:false,error:'establishment_mismatch'});
  if(Number(row.course_establishment)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});

  const apps=await client.query(`select a.id,a.status,(a.access_token_hash is not null) has_access,s.id student_id,s.name student
    from survey_applications a join students s on s.id=a.student_id
    where a.measurement_id=$1 and s.course_id=$2 and s.establishment_id=$3 and s.active=true
    order by s.name`,[measurementId,courseId,req.auth.establishment_id]);
  if(!apps.rowCount)return res.status(409).json({ok:false,error:'course_without_applications'});

  await client.query('begin');
  let generated=0,regenerated=0,existing_access=0,skipped_in_progress=0,skipped_completed=0;
  const accesses=[];
  for(const app of apps.rows){
    if(app.status==='completed'){skipped_completed++;continue}
    if(app.status==='in_progress'){skipped_in_progress++;continue}
    if(app.has_access&&!regenerateExisting){existing_access++;continue}
    const token=newStudentAccessToken();
    await client.query("update survey_applications set access_token_hash=$1,access_token_created_at=now(),access_method='secure_link',access_requires_pin_setup=false where id=$2",[sha256(token),app.id]);
    if(app.has_access)regenerated++;else generated++;
    accesses.push({application_id:Number(app.id),student_id:Number(app.student_id),student:app.student,access_token:token,regenerated:!!app.has_access});
  }
  await client.query('commit');

  await auditProfessional(req,'survey_course_access_issued','course',courseId,{measurement_id:measurementId,measurement_code:row.measurement_code,course_name:row.course_name,generated,regenerated,existing_access,skipped_in_progress,skipped_completed});
  ok(res,{course:{id:courseId,name:row.course_name},measurement:{id:measurementId,code:row.measurement_code,school_year:row.school_year},generated,regenerated,existing_access,skipped_in_progress,skipped_completed,accesses});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/applications/:id/access',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const q=await pool.query("select a.id,a.status,(a.access_token_hash is not null) has_access,s.establishment_id from survey_applications a join students s on s.id=a.student_id where a.id=$1",[req.params.id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  const a=q.rows[0];
  if(Number(a.establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  if(a.status==='completed')return res.status(409).json({ok:false,error:'application_already_completed'});
  if((a.status==='in_progress'||a.has_access)&&!(req.body||{}).confirm_regenerate)return res.status(409).json({ok:false,error:a.status==='in_progress'?'application_in_progress_confirm_required':'access_regeneration_confirm_required'});
  const token=newStudentAccessToken();
  await pool.query("update survey_applications set access_token_hash=$1,access_token_created_at=now(),access_method='secure_link',access_requires_pin_setup=false where id=$2",[sha256(token),req.params.id]);
  ok(res,{application_id:Number(req.params.id),access_token:token,regenerated:a.status==='in_progress'});
}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.post('/api/applications/:id/start',async(req,res)=>{try{const q=await pool.query(`select a.id,a.status,a.started_at,a.access_token_hash,a.access_requires_pin_setup,s.establishment_id student_establishment,s.active student_active,c.establishment_id course_establishment,m.establishment_id measurement_establishment,m.status measurement_status,case when ms.start_date is null or ms.end_date is null then 'unconfigured' when ((now() at time zone 'America/Santiago')::date)<ms.start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>ms.end_date then 'closed' else 'open' end period_state from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id left join measurement_settings ms on ms.measurement_id=m.id where a.id=$1`,[req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});const a=q.rows[0];if(!studentAccessValid(a.access_token_hash,(req.body||{}).access))return res.status(403).json({ok:false,error:'invalid_student_access'});if(Number(a.student_establishment)!==Number(a.measurement_establishment)||!a.course_establishment||Number(a.student_establishment)!==Number(a.course_establishment))return res.status(409).json({ok:false,error:'application_context_mismatch'});if(!a.student_active)return res.status(409).json({ok:false,error:'student_inactive'});if(a.access_requires_pin_setup)return res.status(409).json({ok:false,error:'student_pin_required'});if(a.status==='completed')return ok(res,{application:{id:Number(a.id),status:'completed',started_at:a.started_at}});if(a.measurement_status!=='active')return res.status(409).json({ok:false,error:'measurement_not_active'});if(a.period_state==='unconfigured')return res.status(409).json({ok:false,error:'measurement_not_configured'});if(a.period_state==='scheduled')return res.status(409).json({ok:false,error:'application_not_open'});if(a.period_state==='closed')return res.status(409).json({ok:false,error:'application_closed'});const u=await pool.query("update survey_applications set status='in_progress',started_at=coalesce(started_at,now()) where id=$1 returning id,status,started_at,completed_at",[req.params.id]);ok(res,{application:u.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/applications/:id/context',async(req,res)=>{try{const q=await pool.query("select a.id,a.status,a.survey_level,a.access_token_hash,a.access_method,a.access_requires_pin_setup,s.id student_id,s.name student,s.establishment_id,s.active student_active,c.id course_id,c.name course,m.id measurement_id,m.code measurement,m.school_year,m.status measurement_status,e.name establishment,e.rbd,ms.start_date,ms.end_date,ms.modality,ms.estimated_minutes,ms.initial_message,case when ms.start_date is null or ms.end_date is null then 'unconfigured' when ((now() at time zone 'America/Santiago')::date)<ms.start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>ms.end_date then 'closed' else 'open' end period_state from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id join establishments e on e.id=s.establishment_id left join measurement_settings ms on ms.measurement_id=m.id where a.id=$1",[req.params.id]);if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});if(!studentAccessValid(q.rows[0].access_token_hash,req.get('X-Student-Access')))return res.status(403).json({ok:false,error:'invalid_student_access'});delete q.rows[0].access_token_hash;if(Number(q.rows[0].establishment_id)!==Number((await pool.query('select establishment_id from measurements where id=$1',[q.rows[0].measurement_id])).rows[0].establishment_id))return res.status(409).json({ok:false,error:'application_context_mismatch'});ok(res,{application:q.rows[0]})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/students/:id/applications',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{const establishmentId=Number(req.query.establishment_id);if(establishmentId!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!establishmentId)throw new Error('establishment_id_required');const student=await pool.query("select id from students where id=$1 and establishment_id=$2",[req.params.id,establishmentId]);if(!student.rowCount)return res.status(404).json({ok:false,error:'student_not_found'});const q=await pool.query("select a.id,a.survey_level,a.status,a.started_at,a.completed_at,m.code measurement,m.school_year from survey_applications a join measurements m on m.id=a.measurement_id where a.student_id=$1 and m.establishment_id=$2 order by m.school_year,case m.code when 'M1' then 1 when 'M2' then 2 when 'M3' then 3 else 9 end,m.code",[req.params.id,establishmentId]);ok(res,{applications:q.rows})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/applications/:id/progress',async(req,res)=>{try{
  const q=await pool.query(`select a.id,a.status,a.access_token_hash,s.active student_active,s.establishment_id student_establishment,c.establishment_id course_establishment,m.establishment_id measurement_establishment,m.status measurement_status,case when ms.start_date is null or ms.end_date is null then 'unconfigured' when ((now() at time zone 'America/Santiago')::date)<ms.start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>ms.end_date then 'closed' else 'open' end period_state from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id left join measurement_settings ms on ms.measurement_id=m.id where a.id=$1`,[req.params.id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  const a=q.rows[0];
  if(!studentAccessValid(a.access_token_hash,req.get('X-Student-Access')))return res.status(403).json({ok:false,error:'invalid_student_access'});
  if(Number(a.student_establishment)!==Number(a.measurement_establishment)||!a.course_establishment||Number(a.student_establishment)!==Number(a.course_establishment))return res.status(409).json({ok:false,error:'application_context_mismatch'});
  if(!a.student_active)return res.status(409).json({ok:false,error:'student_inactive'});
  if(a.status==='completed')return ok(res,{responses:[],completed:true});
  if(a.status!=='in_progress')return res.status(409).json({ok:false,error:'application_not_started'});
  if(a.measurement_status!=='active')return res.status(409).json({ok:false,error:'measurement_not_active'});
  if(a.period_state!=='open')return res.status(409).json({ok:false,error:a.period_state==='scheduled'?'application_not_open':a.period_state==='closed'?'application_closed':'measurement_not_configured'});
  const d=await pool.query("select item_code,value,updated_at from response_drafts where application_id=$1 order by item_code",[req.params.id]);
  ok(res,{responses:d.rows.map(x=>({item_code:x.item_code,value:Number(x.value),updated_at:x.updated_at})),completed:false});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/applications/:id/progress',async(req,res)=>{const client=await pool.connect();try{
  const body=req.body||{},responses=body.responses;
  if(!Array.isArray(responses)||responses.length>100)return res.status(400).json({ok:false,error:'invalid_progress_payload'});
  const q=await client.query(`select a.id,a.status,a.access_token_hash,s.active student_active,s.establishment_id student_establishment,c.establishment_id course_establishment,m.establishment_id measurement_establishment,m.status measurement_status,case when ms.start_date is null or ms.end_date is null then 'unconfigured' when ((now() at time zone 'America/Santiago')::date)<ms.start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>ms.end_date then 'closed' else 'open' end period_state from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id left join measurement_settings ms on ms.measurement_id=m.id where a.id=$1`,[req.params.id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  const a=q.rows[0];
  if(!studentAccessValid(a.access_token_hash,body.access))return res.status(403).json({ok:false,error:'invalid_student_access'});
  if(Number(a.student_establishment)!==Number(a.measurement_establishment)||!a.course_establishment||Number(a.student_establishment)!==Number(a.course_establishment))return res.status(409).json({ok:false,error:'application_context_mismatch'});
  if(!a.student_active)return res.status(409).json({ok:false,error:'student_inactive'});
  if(a.status==='completed')return res.status(409).json({ok:false,error:'application_already_completed'});
  if(a.status!=='in_progress')return res.status(409).json({ok:false,error:'application_not_started'});
  if(a.measurement_status!=='active')return res.status(409).json({ok:false,error:'measurement_not_active'});
  if(a.period_state!=='open')return res.status(409).json({ok:false,error:a.period_state==='scheduled'?'application_not_open':a.period_state==='closed'?'application_closed':'measurement_not_configured'});
  await client.query('begin');
  let saved=0;
  for(const x of responses){
    const code=String((x||{}).item_code||'').trim(),value=Number((x||{}).value);
    if(!/^(D\d{2}_\d{2}|EXP_\d{2}|PRO_\d{2}|PAR_\d{2}|AUT_\d{2}|BIE_\d{2}|DIG_\d{2}|ESC_\d{2}|OBS_\d{2})$/.test(code)||!Number.isInteger(value)||value<1||value>5)continue;
    await client.query("insert into response_drafts(application_id,item_code,value,updated_at) values($1,$2,$3,now()) on conflict(application_id,item_code) do update set value=excluded.value,updated_at=now()",[req.params.id,code,String(value)]);
    saved++;
  }
  await client.query('commit');
  ok(res,{saved});
}catch(e){try{await client.query('rollback')}catch(_){}res.status(400).json({ok:false,error:e.message})}finally{client.release()}});

app.post('/api/applications/:id/responses',async(req,res)=>{const client=await pool.connect();try{const responses=req.body.responses;if(!Array.isArray(responses)||!responses.length)throw new Error('responses_required');const a=await client.query(`select a.survey_level,a.status,a.access_token_hash,s.active student_active,s.establishment_id student_establishment,c.establishment_id course_establishment,m.establishment_id measurement_establishment,m.status measurement_status,case when ms.start_date is null or ms.end_date is null then 'unconfigured' when ((now() at time zone 'America/Santiago')::date)<ms.start_date then 'scheduled' when ((now() at time zone 'America/Santiago')::date)>ms.end_date then 'closed' else 'open' end period_state from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id left join measurement_settings ms on ms.measurement_id=m.id where a.id=$1`,[req.params.id]);if(!a.rowCount)throw new Error('application_not_found');if(!studentAccessValid(a.rows[0].access_token_hash,(req.body||{}).access))throw new Error('invalid_student_access');const level=a.rows[0].survey_level;if(Number(a.rows[0].student_establishment)!==Number(a.rows[0].measurement_establishment)||!a.rows[0].course_establishment||Number(a.rows[0].student_establishment)!==Number(a.rows[0].course_establishment))throw new Error('application_context_mismatch');if(!a.rows[0].student_active)throw new Error('student_inactive');if(a.rows[0].status==='completed')throw new Error('application_already_completed');if(a.rows[0].status!=='in_progress')throw new Error('application_not_started');if(a.rows[0].measurement_status!=='active')throw new Error('measurement_not_active');if(a.rows[0].period_state!=='open')throw new Error(a.rows[0].period_state==='scheduled'?'application_not_open':a.rows[0].period_state==='closed'?'application_closed':'measurement_not_configured');
const manifests={
'1-2':{
required:['D01_01','D02_01','D03_01','D04_01','D05_01','D06_01','D07_01','D08_01','D09_01','D10_01','D11_01','D12_01','D13_01','D14_01','D15_01','D16_01','D01_02','D02_02','D08_02','D13_02',...Array.from({length:7},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'OBS_01','OBS_02'],
digital:['DIG_01','DIG_02','DIG_03']
},
'3-4':{
required:[...Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')+'_01'),'D01_02','D02_02','D03_02','D05_02','D07_02','D08_02','D09_02','D13_02',...Array.from({length:9},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'OBS_01','OBS_02','OBS_03','OBS_04'],
digital:Array.from({length:5},(_,i)=>'DIG_'+String(i+1).padStart(2,'0'))
},
'5-6':{
required:[...Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')+'_01'),'D01_02','D02_02','D03_02','D04_02','D05_02','D06_02','D07_02','D08_02','D09_02','D10_02','D13_02','D14_02',...Array.from({length:10},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'PRO_01','PRO_02','PRO_03','BIE_01','BIE_02','BIE_03','ESC_01','ESC_02','ESC_03'],
digital:Array.from({length:6},(_,i)=>'DIG_'+String(i+1).padStart(2,'0'))
},
'7-8':{
required:[...Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')+'_01'),'D01_02','D02_02','D03_02','D04_02','D05_02','D06_02','D07_02','D08_02','D09_02','D10_02','D11_02','D12_02','D13_02','D14_02',...Array.from({length:10},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'PAR_01','PAR_02','PAR_03','BIE_01','BIE_02','BIE_03','BIE_04','ESC_01','ESC_02','ESC_03'],
digital:Array.from({length:7},(_,i)=>'DIG_'+String(i+1).padStart(2,'0'))
},
'1-2-medio':{
required:[...Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')+'_01'),'D01_02','D02_02','D03_02','D04_02','D05_02','D06_02','D07_02','D08_02','D09_02','D10_02','D11_02','D12_02','D13_02','D14_02',...Array.from({length:10},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'AUT_01','AUT_02','AUT_03','BIE_01','BIE_02','BIE_03','BIE_04','ESC_01','ESC_02','ESC_03'],
digital:Array.from({length:7},(_,i)=>'DIG_'+String(i+1).padStart(2,'0'))
},
'3-4-medio':{
required:[...Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')+'_01'),'D01_02','D02_02','D03_02','D04_02','D05_02','D06_02','D07_02','D08_02','D09_02','D10_02','D11_02','D12_02','D13_02','D14_02',...Array.from({length:10},(_,i)=>'EXP_'+String(i+1).padStart(2,'0')),'AUT_01','AUT_02','AUT_03','AUT_04','BIE_01','BIE_02','BIE_03','BIE_04','ESC_01','ESC_02','ESC_03'],
digital:Array.from({length:7},(_,i)=>'DIG_'+String(i+1).padStart(2,'0'))
}};
const manifest=manifests[level];const seen=new Set();
for(const x of responses){if(!x||typeof x.item_code!=='string'||!Number.isInteger(x.value))throw new Error('invalid_response');if(seen.has(x.item_code))throw new Error('duplicate_item');seen.add(x.item_code);
if(manifest&&!manifest.required.includes(x.item_code)&&!manifest.digital.includes(x.item_code))throw new Error('item_not_allowed');
const isExp=x.item_code.startsWith('EXP_');const isFiveScale=(level==='5-6'||level==='7-8'||level==='1-2-medio'||level==='3-4-medio')&&!isExp;const max=isExp?4:(level==='1-2'?3:(isFiveScale?5:4));if(x.value<1||x.value>max)throw new Error('value_out_of_range');}
if(manifest){for(const code of manifest.required)if(!seen.has(code))throw new Error('required_item_missing');const digitalCount=manifest.digital.filter(code=>seen.has(code)).length;if(digitalCount!==0&&digitalCount!==manifest.digital.length)throw new Error('incomplete_digital_block');const expected=manifest.required.length+digitalCount;if(responses.length!==expected)throw new Error('unexpected_response_count');}await client.query('begin');for(const x of (req.body.responses||[])){await client.query('insert into responses(application_id,item_code,value) values($1,$2,$3) on conflict(application_id,item_code) do update set value=excluded.value',[req.params.id,x.item_code,x.value])}await client.query("update survey_applications set status='completed',completed_at=now(),access_token_hash=null,access_token_created_at=null where id=$1",[req.params.id]);await client.query("delete from response_drafts where application_id=$1",[req.params.id]);await client.query('commit');ok(res,{application_id:Number(req.params.id),saved:(req.body.responses||[]).length,status:'completed'})}catch(e){try{await client.query('rollback')}catch(_){}res.status(studentErrorStatus(e.message)).json({ok:false,error:e.message})}finally{client.release()}});
app.post('/api/pilot/setup',(req,res,next)=>{if(String(process.env.MEC_ENABLE_PILOT||'').toLowerCase()!=='true')return res.status(404).json({ok:false,error:'pilot_disabled'});next()},async(req,res)=>{const client=await pool.connect();try{await client.query('begin');let e=await client.query("select * from establishments where rbd='PILOTO-MEC' limit 1");if(!e.rowCount)e=await client.query("insert into establishments(name,rbd) values('Establecimiento Piloto MEC','PILOTO-MEC') returning *");const eid=e.rows[0].id;let u=await client.query("select * from users where establishment_id=$1 and email='piloto@materialeducativo.cl'",[eid]);if(!u.rowCount)u=await client.query("insert into users(establishment_id,email,name,role) values($1,'piloto@materialeducativo.cl','Profesional Piloto','coordinador_convivencia') returning *",[eid]);{const internalPilotSecret=crypto.randomBytes(32).toString('base64url');const cred=await makePassword(internalPilotSecret);u=await client.query("update users set role='coordinador_convivencia',password_hash=$1,password_salt=$2,must_change_password=false,failed_login_count=0,locked_until=null where id=$3 returning *",[cred.hash,cred.salt,u.rows[0].id])}let co=await client.query("select * from courses where establishment_id=$1 and name='7° A' and school_year=2026",[eid]);if(!co.rowCount)co=await client.query("insert into courses(establishment_id,name,school_year) values($1,'7° A',2026) returning *",[eid]);let st=await client.query("select * from students where establishment_id=$1 and name='Estudiante Piloto' limit 1",[eid]);if(!st.rowCount)st=await client.query("insert into students(establishment_id,course_id,name) values($1,$2,'Estudiante Piloto') returning *",[eid,co.rows[0].id]);let m=await client.query("select * from measurements where establishment_id=$1 and code='M1' and school_year=2026",[eid]);if(!m.rowCount)m=await client.query("insert into measurements(establishment_id,code,school_year) values($1,'M1',2026) returning *",[eid]);await client.query('commit');const pilotToken=crypto.randomBytes(32).toString('base64url');await pool.query("insert into auth_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '2 hours')",[sha256(pilotToken),u.rows[0].id]);setSessionCookie(res,pilotToken,7200);ok(res,{establishment:e.rows[0],professional:{id:u.rows[0].id,name:u.rows[0].name,role:u.rows[0].role},course:co.rows[0],student:st.rows[0],measurement:m.rows[0],pilot_session:true})}catch(e){await client.query('rollback');res.status(400).json({ok:false,error:e.message})}finally{client.release()}});
app.get('/api/establishments/:id/results',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{if(Number(req.params.id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(!req.query.measurement_id||!req.query.school_year)return res.status(400).json({ok:false,error:'measurement_and_school_year_required'});const est=await pool.query('select id,name,rbd from establishments where id=$1',[req.params.id]);if(!est.rowCount)return res.status(404).json({ok:false,error:'establishment_not_found'});const measurement=await pool.query('select id,code,school_year from measurements where id=$1 and establishment_id=$2 and school_year=$3',[req.query.measurement_id,req.params.id,req.query.school_year]);if(!measurement.rowCount)return res.status(404).json({ok:false,error:'measurement_not_found_for_establishment'});const q=await pool.query("select a.id,a.student_id,s.course_id,r.item_code,r.value from survey_applications a join students s on s.id=a.student_id join measurements m on m.id=a.measurement_id left join responses r on r.application_id=a.id where s.establishment_id=$1 and m.establishment_id=$1 and a.status='completed' and ($2::bigint is null or a.measurement_id=$2) and ($3::int is null or m.school_year=$3)",[req.params.id,req.query.measurement_id||null,req.query.school_year||null]);const dimensions={};const students=new Set(),courses=new Set(),applications=new Set();for(const x of q.rows){students.add(x.student_id);if(x.course_id)courses.add(x.course_id);applications.add(x.id);const k=String(x.item_code||'').slice(0,3),v=Number(x.value);if(/^D[0-9][0-9]$/.test(k)&&Number.isFinite(v))(dimensions[k]??=[]).push(v)}const minimum_group_size=est.rows[0].rbd==='PILOTO-MEC'?1:5;const suppressed=students.size<minimum_group_size;const dimension_summary={};if(!suppressed)for(const [k,v] of Object.entries(dimensions))dimension_summary[k]={answered:v.length,average:Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(2))};ok(res,{establishment:est.rows[0],measurement:measurement.rows[0],establishment_id:Number(req.params.id),completed_students:students.size,courses:courses.size,applications:applications.size,minimum_group_size,suppressed,dimension_summary})}catch(e){res.status(400).json({ok:false,error:'institution_results_failed'})}});
app.get('/api/courses/:id/results',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{if(!req.query.measurement_id||!req.query.school_year)return res.status(400).json({ok:false,error:'measurement_and_school_year_required'});const meta=await pool.query('select c.id,c.name,c.school_year,e.id establishment_id,e.name establishment,e.rbd from courses c join establishments e on e.id=c.establishment_id where c.id=$1',[req.params.id]);if(!meta.rowCount)return res.status(404).json({ok:false,error:'course_not_found'});if(Number(meta.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});const measurement=await pool.query('select id,code,school_year from measurements where id=$1 and establishment_id=$2 and school_year=$3',[req.query.measurement_id,meta.rows[0].establishment_id,req.query.school_year]);if(!measurement.rowCount)return res.status(404).json({ok:false,error:'measurement_not_found_for_establishment'});const q=await pool.query("select a.id,a.student_id,a.survey_level,a.status,m.code measurement,m.school_year,r.item_code,r.value from survey_applications a join students s on s.id=a.student_id join courses c on c.id=s.course_id join measurements m on m.id=a.measurement_id left join responses r on r.application_id=a.id where s.course_id=$1 and s.establishment_id=c.establishment_id and m.establishment_id=c.establishment_id and a.status='completed' and ($2::bigint is null or a.measurement_id=$2) and ($3::int is null or m.school_year=$3) order by a.id,r.item_code",[req.params.id,req.query.measurement_id||null,req.query.school_year||null]);const dims={};const students=new Set();const applications=new Set();for(const x of q.rows){students.add(String(x.student_id));applications.add(String(x.id));const m=String(x.item_code||'').match(/^(D\\d{2})/);const v=Number(x.value);if(!m||!Number.isFinite(v))continue;(dims[m[1]]??=[]).push(v)}const minimum_group_size=meta.rows[0].rbd==='PILOTO-MEC'?1:5;const suppressed=students.size<minimum_group_size;const dimension_summary=suppressed?{}:Object.fromEntries(Object.entries(dims).map(([code,v])=>[code,{answered:v.length,average:Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(2))}]));ok(res,{course:meta.rows[0],measurement:measurement.rows[0],course_id:Number(req.params.id),completed_students:students.size,applications:applications.size,minimum_group_size,suppressed,dimension_summary,note:suppressed?'Resultados agregados suprimidos por tamaño de grupo para proteger privacidad.':'Agregación descriptiva para revisión profesional; no constituye diagnóstico clínico.'})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/applications/:id/review',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const a=await pool.query("select a.id,a.status,s.establishment_id from survey_applications a join students s on s.id=a.student_id where a.id=$1",[req.params.id]);
  if(!a.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  if(Number(a.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  const q=await pool.query("select r.application_id,r.status,r.note,r.reviewed_at,r.updated_at,u.id reviewed_by,u.name reviewed_by_name from application_reviews r join users u on u.id=r.reviewed_by where r.application_id=$1",[req.params.id]);
  ok(res,{review:q.rows[0]||{application_id:Number(req.params.id),status:'pending_review',note:null,reviewed_at:null,updated_at:null,reviewed_by:null,reviewed_by_name:null}});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.post('/api/applications/:id/review',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{try{
  const status=String((req.body||{}).status||''),note=String((req.body||{}).note||'').trim();
  if(!['reviewed','context_required'].includes(status))return res.status(400).json({ok:false,error:'invalid_review_status'});
  if(note.length>2000)return res.status(400).json({ok:false,error:'review_note_too_long'});if(status==='context_required'&&!note)return res.status(400).json({ok:false,error:'review_note_required'});
  const a=await pool.query("select a.id,a.status,s.establishment_id from survey_applications a join students s on s.id=a.student_id where a.id=$1",[req.params.id]);
  if(!a.rowCount)return res.status(404).json({ok:false,error:'application_not_found'});
  if(Number(a.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});
  if(a.rows[0].status!=='completed')return res.status(409).json({ok:false,error:'application_not_completed'});
  const q=await pool.query(`insert into application_reviews(application_id,establishment_id,status,note,reviewed_by,reviewed_at,updated_at)
    values($1,$2,$3,$4,$5,now(),now())
    on conflict(application_id) do update set status=excluded.status,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()
    returning application_id,status,note,reviewed_by,reviewed_at,updated_at`,
    [req.params.id,req.auth.establishment_id,status,note||null,req.auth.id]);
  await auditProfessional(req,'application_professional_review','application',req.params.id,{status});
  ok(res,{review:{...q.rows[0],reviewed_by_name:req.auth.name||null}});
}catch(e){res.status(400).json({ok:false,error:e.message})}});

app.get('/api/applications/:id/results',...requireRole('coordinador_convivencia','dupla_psicosocial'),async(req,res)=>{const a=await pool.query('select a.id,a.measurement_id,a.student_id,a.survey_level,a.status,a.started_at,a.completed_at,s.name student,s.course_id,c.name course,s.establishment_id,e.name establishment,e.rbd,m.code measurement,m.school_year from survey_applications a join students s on s.id=a.student_id left join courses c on c.id=s.course_id left join establishments e on e.id=s.establishment_id join measurements m on m.id=a.measurement_id where a.id=$1',[req.params.id]);if(!a.rowCount)return res.status(404).json({ok:false,error:'not_found'});if(Number(a.rows[0].establishment_id)!==Number(req.auth.establishment_id))return res.status(403).json({ok:false,error:'establishment_forbidden'});if(a.rows[0].status!=='completed')return res.status(409).json({ok:false,error:'application_not_completed'});const r=await pool.query('select item_code,value from responses where application_id=$1 order by item_code',[req.params.id]);const summary={answered:r.rows.length,note:'Conteo técnico de respuestas. No corresponde a un puntaje global de convivencia.'};const groups={experience:{},protective:{},peer_autonomy:{},wellbeing:{},digital:{},scenarios:{}};for(const x of r.rows){const code=String(x.item_code||''),v=Number(x.value);if(!Number.isFinite(v))continue;if(code.startsWith('EXP_'))groups.experience[code]=v;else if(code.startsWith('PRO_'))groups.protective[code]=v;else if(code.startsWith('PAR_')||code.startsWith('AUT_'))groups.peer_autonomy[code]=v;else if(code.startsWith('BIE_'))groups.wellbeing[code]=v;else if(code.startsWith('DIG_'))groups.digital[code]=v;else if(code.startsWith('ESC_'))groups.scenarios[code]=v;}const mean=o=>{const v=Object.values(o);return v.length?Number((v.reduce((x,y)=>x+y,0)/v.length).toFixed(2)):null};const block_summary={experience:{answered:Object.keys(groups.experience).length,frequency_mean:mean(groups.experience),note:'Frecuencia descriptiva de experiencias adversas; no se invierte ni se mezcla con dimensiones protectoras.'},protective:{answered:Object.keys(groups.protective).length,average:mean(groups.protective)},peer_autonomy:{answered:Object.keys(groups.peer_autonomy).length,average:mean(groups.peer_autonomy),note:'Respuesta ante presión de pares y autonomía protectora; se informa separadamente de las dimensiones D01–D16.'},wellbeing:{answered:Object.keys(groups.wellbeing).length,average:mean(groups.wellbeing)},digital:{answered:Object.keys(groups.digital).length,average:mean(groups.digital),conditional:true},scenarios:{answered:Object.keys(groups.scenarios).length,average:mean(groups.scenarios)}};const dimensions={};for(const x of r.rows){const code=String(x.item_code||'').slice(0,3);if(!/^D[0-9]{2}$/.test(code))continue;const v=Number(x.value);if(!Number.isFinite(v))continue;(dimensions[code]??=[]).push(v)}const dimension_summary=Object.fromEntries(Object.entries(dimensions).map(([code,v])=>[code,{answered:v.length,average:Number((v.reduce((x,y)=>x+y,0)/v.length).toFixed(2))}]));const interpretive_profile=Object.entries(dimension_summary).map(([code,x])=>({code,average:x.average,answered:x.answered,status:'pending_validation'}));const professional_review_signals=[];for(const x of r.rows){const code=String(x.item_code||''),v=Number(x.value);if(code.startsWith('EXP_')&&v>=3)professional_review_signals.push({item_code:code,type:'adverse_experience_frequency',status:'review_required',note:'Señal para revisión profesional contextual. No constituye diagnóstico ni determina por sí sola gravedad o protocolo.'});}ok(res,{application:a.rows[0],responses:r.rows,summary,dimension_summary,block_summary,professional_review_signals,interpretive_profile,interpretation_note:'Los niveles interpretativos definitivos se habilitarán después de validación piloto. No constituye diagnóstico clínico.'})});

function storeSlug(v){return plain(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)}
function storeAdmin(req,res,next){
  return requireRole('platform_admin')(req,res,next);
}
app.get('/api/store/admin/drive-accounts',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const q=await pool.query("select id,label,google_email,status,created_at,updated_at from store_drive_accounts order by id");
  ok(res,{accounts:q.rows});
}catch(e){res.status(400).json({ok:false,error:'drive_accounts_failed'})}});
app.post('/api/store/admin/drive-accounts',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const label=String((req.body||{}).label||'').trim(),email=String((req.body||{}).google_email||'').trim().toLowerCase();
  if(!label||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({ok:false,error:'invalid_drive_account'});
  const q=await pool.query("insert into store_drive_accounts(label,google_email) values($1,$2) on conflict(google_email) do update set label=excluded.label,updated_at=now() returning id,label,google_email,status",[label,email]);
  ok(res,{account:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:'drive_account_save_failed'})}});
app.post('/api/store/admin/product-image',requireAuth,storeImageUpload.single('image'),async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  if(!req.file)return res.status(400).json({ok:false,error:'jpg_png_required'});
  const ext=req.file.mimetype==='image/png'?'png':'jpg';
  const q=await pool.query("insert into store_product_images(mime_type,image_data) values($1,$2) returning id",[req.file.mimetype,req.file.buffer]);
  ok(res,{image_url:'/api/store/images/'+q.rows[0].id});
}catch(e){res.status(400).json({ok:false,error:'store_image_upload_failed'})}});
app.get('/api/store/images/:name',async(req,res)=>{
  const name=String(req.params.name||'');
  if(!/^[a-f0-9]{36}\.(jpg|png)$/.test(name))return res.sendStatus(404);
  const dir=String(process.env.MEC_STORE_IMAGE_DIR||'').trim();
  if(!dir)return res.sendStatus(404);
  const file=path.join(dir,name);
  if(!fs.existsSync(file))return res.sendStatus(404);
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');
  res.type(name.endsWith('.png')?'png':'jpg').sendFile(file);
});
app.get('/api/store/products',async(req,res)=>{try{
  const q=await pool.query("select id,title,slug,objective,description,included_materials,audience,image_url,price_clp,compare_at_price_clp,updated_at from store_products where status='published' order by updated_at desc");
  ok(res,{products:q.rows});
}catch(e){res.status(400).json({ok:false,error:'store_products_failed'})}});
app.get('/api/store/admin/products',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const q=await pool.query("select id,title,slug,objective,description,included_materials,audience,image_url,drive_delivery_url,drive_account_id,price_clp,compare_at_price_clp,status,created_at,updated_at from store_products order by updated_at desc");
  ok(res,{products:q.rows});
}catch(e){res.status(400).json({ok:false,error:'store_products_failed'})}});
app.post('/api/store/admin/products',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const b=req.body||{},driveAccountId=b.drive_account_id?Number(b.drive_account_id):null,title=String(b.title||'').trim(),objective=String(b.objective||'').trim(),description=String(b.description||'').trim(),included=String(b.included_materials||'').trim(),drive=String(b.drive_delivery_url||'').trim(),image=String(b.image_url||'').trim(),audience=String(b.audience||'').trim(),price=Number(b.price_clp),compare=b.compare_at_price_clp==null||b.compare_at_price_clp===''?null:Number(b.compare_at_price_clp),status=['draft','published','archived'].includes(b.status)?b.status:'draft';
  if(!title||!objective||!description||!included||!drive||!Number.isInteger(price)||price<0)return res.status(400).json({ok:false,error:'required_store_fields'});
  if(!/^https:\/\//i.test(drive)||image&&!/^https:\/\//i.test(image))return res.status(400).json({ok:false,error:'https_url_required'});
  if(compare!==null&&(!Number.isInteger(compare)||compare<price))return res.status(400).json({ok:false,error:'invalid_compare_price'});
  let slug=storeSlug(b.slug||title);if(!slug)slug='material-'+Date.now();
  const q=await pool.query(`insert into store_products(title,slug,objective,description,included_materials,audience,image_url,drive_delivery_url,price_clp,compare_at_price_clp,status,created_by)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id,title,slug,status,price_clp,updated_at`,
    [title,slug,objective,description,included,audience||null,image||null,drive,price,compare,status,req.auth.id]);
  if(driveAccountId)await pool.query("update store_products set drive_account_id=$1 where id=$2",[driveAccountId,q.rows[0].id]);
  ok(res,{product:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.code==='23505'?'store_slug_exists':'store_product_create_failed'})}});
app.post('/api/store/admin/products/:id',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const b=req.body||{},driveAccountId=b.drive_account_id?Number(b.drive_account_id):null,id=Number(req.params.id),title=String(b.title||'').trim(),objective=String(b.objective||'').trim(),description=String(b.description||'').trim(),included=String(b.included_materials||'').trim(),drive=String(b.drive_delivery_url||'').trim(),image=String(b.image_url||'').trim(),audience=String(b.audience||'').trim(),price=Number(b.price_clp),compare=b.compare_at_price_clp==null||b.compare_at_price_clp===''?null:Number(b.compare_at_price_clp),status=['draft','published','archived'].includes(b.status)?b.status:'draft',slug=storeSlug(b.slug||title);
  if(!id||!title||!slug||!objective||!description||!included||!drive||!Number.isInteger(price)||price<0)return res.status(400).json({ok:false,error:'required_store_fields'});
  if(!/^https:\/\//i.test(drive)||image&&!/^https:\/\//i.test(image))return res.status(400).json({ok:false,error:'https_url_required'});
  if(compare!==null&&(!Number.isInteger(compare)||compare<price))return res.status(400).json({ok:false,error:'invalid_compare_price'});
  const q=await pool.query(`update store_products set title=$1,slug=$2,objective=$3,description=$4,included_materials=$5,audience=$6,image_url=$7,drive_delivery_url=$8,price_clp=$9,compare_at_price_clp=$10,status=$11,updated_at=now() where id=$12 returning id,title,slug,status,price_clp,updated_at`,
    [title,slug,objective,description,included,audience||null,image||null,drive,price,compare,status,id]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'store_product_not_found'});
  await pool.query("update store_products set drive_account_id=$1 where id=$2",[driveAccountId||null,id]);
  ok(res,{product:q.rows[0]});
}catch(e){res.status(400).json({ok:false,error:e.code==='23505'?'store_slug_exists':'store_product_update_failed'})}});


app.post('/api/store/orders',storeOrderRateLimit,async(req,res)=>{const client=await pool.connect();try{
  const b=req.body||{},name=String(b.buyer_name||'').trim(),email=String(b.buyer_email||'').trim().toLowerCase(),raw=Array.isArray(b.items)?b.items:[];
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!raw.length||raw.length>30)return res.status(400).json({ok:false,error:'invalid_order'});
  const qty=new Map();for(const x of raw){const id=Number(x.product_id),q=Number(x.quantity||1);if(!Number.isInteger(id)||!Number.isInteger(q)||q<1||q>20)return res.status(400).json({ok:false,error:'invalid_order_items'});qty.set(id,(qty.get(id)||0)+q)}
  const ids=[...qty.keys()];const pq=await client.query("select id,title,price_clp,drive_delivery_url,drive_account_id from store_products where status='published' and id=any($1::bigint[])",[ids]);
  if(pq.rowCount!==ids.length)return res.status(400).json({ok:false,error:'product_unavailable'});
  let total=0;for(const p of pq.rows)total+=Number(p.price_clp)*qty.get(Number(p.id));
  const code='MEC-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
  await client.query('begin');
  const oq=await client.query("insert into store_orders(order_code,buyer_name,buyer_email,total_clp) values($1,$2,$3,$4) returning id,order_code,status,total_clp,created_at",[code,name,email,total]);
  for(const p of pq.rows)await client.query("insert into store_order_items(order_id,product_id,product_title,unit_price_clp,quantity,delivery_url_snapshot,drive_account_id_snapshot) values($1,$2,$3,$4,$5,$6,$7)",[oq.rows[0].id,p.id,p.title,p.price_clp,qty.get(Number(p.id)),p.drive_delivery_url,p.drive_account_id]);
  await client.query("insert into store_delivery_events(order_id,status,buyer_email,detail) values($1,'pending',$2,'Entrega bloqueada hasta confirmación de pago')",[oq.rows[0].id,email]);
  await client.query('commit');ok(res,{order:oq.rows[0],payment_ready:false,message:'Pedido creado. Webpay aún no está habilitado.'});
}catch(e){await client.query('rollback').catch(()=>{});res.status(400).json({ok:false,error:'order_create_failed'})}finally{client.release()}});
app.get('/api/store/orders/:code/status',storeStatusRateLimit,async(req,res)=>{try{
  const code=String(req.params.code||'').trim();const q=await pool.query("select order_code,status,total_clp,paid_at,created_at from store_orders where order_code=$1",[code]);
  if(!q.rowCount)return res.status(404).json({ok:false,error:'order_not_found'});
  ok(res,{order:q.rows[0],delivery_available:q.rows[0].status==='paid'});
}catch(e){res.status(400).json({ok:false,error:'order_status_failed'})}});
app.get('/api/store/admin/orders',requireAuth,async(req,res)=>{try{
  if(canonicalRole(req.auth.role,req.auth.rbd)!=='platform_admin')return res.status(403).json({ok:false,error:'role_forbidden'});
  const q=await pool.query("select o.id,o.order_code,o.buyer_name,o.buyer_email,o.status,o.total_clp,o.payment_provider,o.paid_at,o.created_at,count(i.id)::int item_count from store_orders o left join store_order_items i on i.order_id=o.id group by o.id order by o.created_at desc limit 250");
  ok(res,{orders:q.rows});
}catch(e){res.status(400).json({ok:false,error:'store_orders_failed'})}});

const port=process.env.PORT||3000;
initDatabase().then(()=>app.listen(port,()=>{
  console.log('Convivencia API ready with PostgreSQL');
  if(String(process.env.RUN_PILOT_SELFTEST||'')==='1'){
    const {runPilotSelfTest}=require('./pilot-selftest');
    setTimeout(async()=>{
      try{
        const result=await runPilotSelfTest('http://127.0.0.1:'+port);
        console.log('PILOT_SELFTEST PASSED '+JSON.stringify(result));
      }catch(e){
        console.error('PILOT_SELFTEST FAILED '+(e&&e.stack?e.stack:e));
      }
    },1200);
  }
})).catch(e=>{console.error('Convivencia startup failed:',e.message);process.exit(1)});
