'use strict';
// Fechas del ensayo escolar según el calendario local de Chile, no según UTC del runner.
function isoLocal(date=new Date()){
 const formatter=new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'
 });
 const parts=Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function addDays(n,base=new Date()){
 if(!Number.isInteger(n))throw new Error('invalid_day_offset');
 const [year,month,day]=isoLocal(base).split('-').map(Number);
 return new Date(Date.UTC(year,month-1,day+n)).toISOString().slice(0,10);
}
module.exports={isoLocal,addDays};
