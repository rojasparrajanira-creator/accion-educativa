const express=require('express');
const fs=require('fs');
const path=require('path');
const {Pool}=require('pg');
const app=express();
app.use(express.json());
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});

async function initDatabase(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL no configurada');
  const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
  await pool.query(schema);
  const check=await pool.query("select current_database() as database, now() as time");
  console.log('Convivencia DB connected:',check.rows[0].database);
}
app.get('/health',async(req,res)=>{
  try{
    const q=await pool.query("select current_database() as database, now() as time");
    res.json({ok:true,service:'convivencia-escolar-api',database:true,databaseName:q.rows[0].database,time:q.rows[0].time});
  }catch(e){
    console.error('Health DB error:',e.message);
    res.status(500).json({ok:false,service:'convivencia-escolar-api',database:false,error:'database_connection_failed'});
  }
});
app.get('/api/status',(req,res)=>res.json({ok:true,module:'convivencia-escolar',isolation:'independent'}));
const port=process.env.PORT||3000;
initDatabase().then(()=>app.listen(port,()=>console.log('Convivencia API ready with PostgreSQL'))).catch(e=>{console.error('Convivencia startup failed:',e.message);process.exit(1);});
