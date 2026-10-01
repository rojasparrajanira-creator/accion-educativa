const express=require('express');
const {Pool}=require('pg');
const crypto=require('crypto');

const DATABASE_URL=process.env.DATABASE_URL||'';
const SURVEY_URL=(process.env.SURVEY_URL||'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/,'');
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;

function round1(n){return Math.round(Number(n||0)*10)/10;}
function tokenHash(t){return crypto.createHash('sha256').update(String(t)).digest('hex');}
function parseArray(v){if(Array.isArray(v))return v;try{return JSON.parse(v||'[]')}catch{return[]}}
function scoreBlock(a){if(!a.length)return null;return round1(((a.reduce((x,y)=>x+Number(y||0),0)-a.length)/(a.length*3))*100);}
function calc(answers){
  const coreGroups=[answers.slice(0,8),answers.slice(8,16),answers.slice(16,23),answers.slice(23,30)];
  const scores=coreGroups.map(scoreBlock);
  const general=round1(scores.reduce((x,y)=>x+Number(y||0),0)/scores.length);
  const complementary={
    attendance_support:scoreBlock(answers.slice(30,35)),
    continuity_support:scoreBlock(answers.slice(35,40)),
    gender_equity_perception:scoreBlock(answers.slice(40,45)),
    version:'2026.10-complementary-v1'
  };
  return {scores,general,complementary};
}
async function ensure(){
  if(!pool)throw new Error('Base de datos no disponible.');
  await pool.query('ALTER TABLE idps_responses ADD COLUMN IF NOT EXISTS complementary jsonb');
  await pool.query('ALTER TABLE idps_responses ADD COLUMN IF NOT EXISTS instrument_version text');
}
async function authStudent(req){
  const h=String(req.headers.authorization||''),raw=h.startsWith('Bearer ')?h.slice(7):'';
  if(!raw||raw.length<32)return null;
  const q=await pool.query(`SELECT ss.student_id,ss.application_id,s.active,a.establishment_id,a.level,a.status,e.status establishment_status
    FROM idps_student_sessions ss
    JOIN idps_students s ON s.id=ss.student_id
    JOIN idps_applications a ON a.id=ss.application_id
    JOIN idps_establishments e ON e.id=a.establishment_id
    WHERE ss.token_hash=$1 AND ss.expires_at>now() AND s.active=true AND e.status='active' LIMIT 1`,[tokenHash(raw)]);
  return q.rows[0]||null;
}
function cors(req,res,next){
  const origin=String(req.headers.origin||'');
  if(origin===SURVEY_URL){res.setHeader('Access-Control-Allow-Origin',SURVEY_URL);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
}

const previousListen=express.application.listen;
express.application.listen=function complementaryListen(...args){
  if(!this.__complementaryRoutes){
    this.__complementaryRoutes=true;
    const app=this;
    app.use('/api/student',cors);
    app.post('/api/student/submit',async(req,res)=>{
      const client=await pool.connect();
      try{
        await ensure();
        const s=await authStudent(req);
        if(!s)return res.status(401).json({ok:false,error:'Sesión inválida o vencida.'});
        const answers=Array.isArray(req.body?.answers)?req.body.answers.map(Number):[];
        const validLength=answers.length===45 || answers.length===30;
        if(!validLength||answers.some(v=>!Number.isInteger(v)||v<1||v>4))return res.status(400).json({ok:false,error:'La encuesta contiene respuestas incompletas o inválidas.'});
        await client.query('BEGIN');
        const lock=(await client.query('SELECT status FROM idps_applications WHERE id=$1 FOR UPDATE',[s.application_id])).rows[0];
        if(!lock){await client.query('ROLLBACK');return res.status(404).json({ok:false,error:'Aplicación no encontrada.'});}
        if(lock.status==='completed'){
          const rr=(await client.query('SELECT scores,general,complementary,submitted_at FROM idps_responses WHERE application_id=$1',[s.application_id])).rows[0];
          await client.query('COMMIT');
          return res.json({ok:true,already_completed:true,result:{scores:parseArray(rr?.scores),general:Number(rr?.general||0),complementary:rr?.complementary||null,submitted_at:rr?.submitted_at}});
        }
        const core=answers.length>=30?calc(answers.length===45?answers:[...answers,...Array(15).fill(4)]):null;
        const complementary=answers.length===45?core.complementary:null;
        const version=answers.length===45?'2026.10-complementary-v1':'2026.09-core30';
        await client.query(`INSERT INTO idps_responses(id,application_id,establishment_id,student_id,level,answers,scores,general,complementary,instrument_version,submitted_at)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10,now())
          ON CONFLICT(application_id) DO NOTHING`,[crypto.randomUUID(),s.application_id,s.establishment_id,s.student_id,s.level,JSON.stringify(answers),JSON.stringify(core.scores),core.general,complementary?JSON.stringify(complementary):null,version]);
        await client.query("UPDATE idps_applications SET status='completed',opened_at=COALESCE(opened_at,now()),completed_at=now() WHERE id=$1",[s.application_id]);
        await client.query('COMMIT');
        return res.json({ok:true,result:{scores:core.scores,general:core.general,complementary,submitted_at:new Date().toISOString()}});
      }catch(e){
        try{await client.query('ROLLBACK')}catch{}
        console.error('[COMPLEMENTARY_SUBMIT]',e);
        if(!res.headersSent)res.status(500).json({ok:false,error:'No fue posible registrar la encuesta.'});
      }finally{client.release();}
    });
  }
  return previousListen.apply(this,args);
};
