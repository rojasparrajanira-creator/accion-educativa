'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isoLocal,addDays}=require('./pilot-dates');

test('calendario de mediciones usa Santiago en los cruces de medianoche UTC',()=>{
 const clock=new Date('2026-10-28T00:14:00.000Z');
 assert.equal(isoLocal(clock),'2026-10-27');
 assert.equal(addDays(14,clock),'2026-11-10');
});
test('no cambia la fecha de Chile en invierno al utilizar UTC',()=>{
 const clock=new Date('2026-07-01T02:30:00.000Z');
 assert.equal(isoLocal(clock),'2026-06-30');
 assert.equal(addDays(1,clock),'2026-07-01');
});
test('cambio de mes y año sin depender del huso horario del runner',()=>{
 const clock=new Date('2027-01-01T01:00:00.000Z');
 assert.equal(isoLocal(clock),'2026-12-31');
 assert.equal(addDays(2,clock),'2027-01-02');
});
