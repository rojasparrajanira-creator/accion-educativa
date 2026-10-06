'use strict';

function isoLocal(d){
  const x=new Date(d);
  return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
}
function addDays(n){const d=new Date();d.setDate(d.getDate()+n);return isoLocal(d)}
function rutDv(body){
  let sum=0,m=2;
  for(let i=String(body).length-1;i>=0;i--){sum+=Number(String(body)[i])*m;m=m===7?2:m+1}
  const r=11-(sum%11);return r===11?'0':r===10?'K':String(r);
}
function syntheticRut(stamp){
  const body=90000000+(Number(stamp)%9000000);
  return String(body)+'-'+rutDv(body);
}
function manifest78(){
  const a=[];
  for(let i=1;i<=16;i++)a.push({item_code:'D'+String(i).padStart(2,'0')+'_01',value:4});
  for(let i=1;i<=14;i++)a.push({item_code:'D'+String(i).padStart(2,'0')+'_02',value:4});
  for(let i=1;i<=10;i++)a.push({item_code:'EXP_'+String(i).padStart(2,'0'),value:1});
  for(let i=1;i<=3;i++)a.push({item_code:'PAR_'+String(i).padStart(2,'0'),value:4});
  for(let i=1;i<=4;i++)a.push({item_code:'BIE_'+String(i).padStart(2,'0'),value:4});
  for(let i=1;i<=3;i++)a.push({item_code:'ESC_'+String(i).padStart(2,'0'),value:4});
  return a;
}
async function json(res){
  const d=await res.json().catch(()=>({ok:false,error:'invalid_json'}));
  return {res,d};
}
async function runPilotSelfTest(base){
  const startedAt=new Date().toISOString(),stamp=Date.now(),log=[];
  const setupRaw=await fetch(base+'/api/pilot/setup',{method:'POST'});
  const setupPair=await json(setupRaw);
  if(!setupPair.res.ok||!setupPair.d.ok)throw new Error('pilot_setup_failed:'+JSON.stringify(setupPair.d));
  const cookie=(setupPair.res.headers.get('set-cookie')||'').split(';')[0];
  if(!cookie.startsWith('mec_session='))throw new Error('pilot_cookie_missing');
  const s=setupPair.d,eid=Number(s.establishment.id),mid=Number(s.measurement.id),year=Number(s.measurement.school_year);
  log.push('pilot_session');

  async function prof(path,{method='GET',body,headers={}}={}){
    const h={Cookie:cookie,...headers};let payload=body;
    if(body!==undefined && !(body instanceof FormData)){h['Content-Type']='application/json';payload=JSON.stringify(body)}
    const pair=await json(await fetch(base+path,{method,headers:h,body:payload}));
    if(!pair.res.ok||!pair.d.ok){const e=new Error(pair.d.error||('http_'+pair.res.status));e.status=pair.res.status;e.data=pair.d;throw e}
    return pair.d;
  }
  async function student(path,{method='GET',body,token,headers={}}={}){
    const h={...headers};let payload=body;
    if(token)h['X-Student-Access']=token;
    if(body!==undefined){h['Content-Type']='application/json';payload=JSON.stringify(body)}
    const pair=await json(await fetch(base+path,{method,headers:h,body:payload}));
    if(!pair.res.ok||!pair.d.ok){const e=new Error(pair.d.error||('http_'+pair.res.status));e.status=pair.res.status;e.data=pair.d;throw e}
    return pair.d;
  }
  async function expectError(label,fn,error){
    try{await fn();throw new Error('expected_failure_missing:'+label)}
    catch(e){if(String(e.message).startsWith('expected_failure_missing:'))throw e;if(error&&e.message!==error&&e.data?.error!==error)throw new Error(label+':unexpected:'+e.message);log.push('negative:'+label)}
  }

  const me=await prof('/api/auth/me');
  if(Number(me.user.establishment_id)!==eid)throw new Error('pilot_auth_scope_failed');
  log.push('auth_scope');

  // Matrícula: preview CSV + commit.
  const courseName='7° E2E '+stamp;
  const rut=syntheticRut(stamp);
  const csv='RUN,Nombre Completo,Curso\n'+rut+',AUTO E2E '+stamp+','+courseName+'\n';
  const fd=new FormData();
  fd.append('establishment_id',String(eid));fd.append('school_year',String(year));
  fd.append('files',new Blob([csv],{type:'text/csv'}),'matricula-e2e-'+stamp+'.csv');
  const preview=await prof('/api/students/import/preview',{method:'POST',body:fd});
  const row=(preview.rows||[]).find(x=>x.rut===rut);
  if(!row?.importable)throw new Error('import_preview_not_importable:'+JSON.stringify(row));
  const commit=await prof('/api/students/import/commit',{method:'POST',body:{establishment_id:eid,school_year:year,create_missing_courses:true,rows:[row]}});
  if(Number(commit.result?.created)!==1)throw new Error('import_commit_not_created');
  const students=await prof('/api/students?establishment_id='+eid);
  const st=students.students.find(x=>x.rut===rut);
  if(!st)throw new Error('imported_student_missing');
  const courseId=Number(st.course_id);
  log.push('bulk_import');

  // M1 config opens today for 14 days.
  const dates={start:isoLocal(new Date()),end:addDays(14)};
  const cfg=await prof('/api/measurements/'+mid+'/config',{method:'POST',body:{establishment_id:eid,start_date:dates.start,end_date:dates.end,modality:'individual',estimated_minutes:25,initial_message:'Mensaje inicial AUTO E2E'}});
  if(cfg.measurement_status!=='configured')throw new Error('measurement_not_configured');
  log.push('measurement_configured');

  // Bulk assignment twice: second must be idempotent.
  const bulk1=await prof('/api/applications/bulk-course',{method:'POST',body:{course_id:courseId,measurement_id:mid}});
  const appInfo=(bulk1.applications||[]).find(x=>Number(x.student_id)===Number(st.id));
  if(!appInfo?.application_id)throw new Error('bulk_assignment_missing_application');
  const appId=Number(appInfo.application_id);
  const bulk2=await prof('/api/applications/bulk-course',{method:'POST',body:{course_id:courseId,measurement_id:mid}});
  if(Number(bulk2.created)!==0)throw new Error('bulk_assignment_not_idempotent');
  log.push('bulk_assignment');

  // Bulk issue student access only at access stage.
  const accessBatch=await prof('/api/applications/access/bulk-course',{method:'POST',body:{course_id:courseId,measurement_id:mid,regenerate_existing:false}});
  const access=(accessBatch.accesses||[]).find(x=>Number(x.application_id)===appId);
  if(!access?.access_token)throw new Error('bulk_access_token_missing');
  const token=access.access_token;
  const ctx=await student('/api/applications/'+appId+'/context',{token});
  if(ctx.application.measurement_status!=='configured'||ctx.application.period_state!=='open'||ctx.application.initial_message!=='Mensaje inicial AUTO E2E')throw new Error('student_context_invalid');
  await expectError('start_before_activation',()=>student('/api/applications/'+appId+'/start',{method:'POST',body:{access:token}}),'measurement_not_active');
  log.push('secure_access');

  const activated=await prof('/api/measurements/'+mid+'/activate',{method:'POST',body:{establishment_id:eid}});
  if(activated.measurement?.status!=='active')throw new Error('measurement_activation_failed');

  const initialCode=String(1000+(stamp%8000)).padStart(4,'0');
  let personalCode=String(1000+((stamp+1379)%8000)).padStart(4,'0');
  if(personalCode===initialCode)personalCode=String((Number(personalCode)+1)%10000).padStart(4,'0');

  const codeSaved=await prof('/api/courses/'+courseId+'/access-code',{method:'POST',body:{code:initialCode}});
  if(codeSaved.configured!==true)throw new Error('course_code_not_configured');
  const firstLogin=await student('/api/student-access/login',{method:'POST',body:{establishment_id:eid,rut,secret:initialCode}});
  if(!firstLogin.access_token||firstLogin.requires_pin_setup!==true||Number(firstLogin.application?.id)!==appId)throw new Error('course_code_first_login_failed');
  await expectError('start_before_personal_pin',()=>student('/api/applications/'+appId+'/start',{method:'POST',body:{access:firstLogin.access_token}}),'student_pin_required');

  let rotatedCode=String(1000+((stamp+2931)%8000)).padStart(4,'0');
  if(rotatedCode===initialCode)rotatedCode=String((Number(rotatedCode)+1)%10000).padStart(4,'0');
  const rotated=await prof('/api/courses/'+courseId+'/access-code',{method:'POST',body:{code:rotatedCode}});
  if(Number(rotated.invalidated_initial_accesses)<1)throw new Error('course_code_rotation_did_not_invalidate');
  await expectError('old_first_access_after_rotation',()=>student('/api/student-access/set-pin',{method:'POST',body:{application_id:appId,access:firstLogin.access_token,new_pin:personalCode}}),'invalid_student_access');
  const renewedLogin=await student('/api/student-access/login',{method:'POST',body:{establishment_id:eid,rut,secret:rotatedCode}});
  if(!renewedLogin.access_token||renewedLogin.requires_pin_setup!==true)throw new Error('rotated_course_code_login_failed');

  const pinSet=await student('/api/student-access/set-pin',{method:'POST',body:{application_id:appId,access:renewedLogin.access_token,new_pin:personalCode}});
  if(pinSet.pin_set!==true)throw new Error('personal_pin_setup_failed');
  const pinLogin=await student('/api/student-access/login',{method:'POST',body:{establishment_id:eid,rut,secret:personalCode}});
  if(!pinLogin.access_token||pinLogin.requires_pin_setup!==false)throw new Error('personal_pin_login_failed');
  const activeToken=pinLogin.access_token;
  log.push('course_code_personal_pin');

  const started=await student('/api/applications/'+appId+'/start',{method:'POST',body:{access:activeToken}});
  if(started.application?.status!=='in_progress')throw new Error('application_start_failed');
  const draft=await student('/api/applications/'+appId+'/progress',{method:'POST',body:{access:activeToken,responses:[{item_code:'D01_01',value:4}]}});
  if(Number(draft.saved)!==1)throw new Error('draft_save_failed');
  const saved=await student('/api/applications/'+appId+'/responses',{method:'POST',body:{access:activeToken,responses:manifest78()}});
  if(Number(saved.saved)!==50||saved.status!=='completed')throw new Error('responses_completion_failed:'+JSON.stringify(saved));
  log.push('student_completion');

  const results=await prof('/api/applications/'+appId+'/results');
  if(Number(results.summary?.answered)!==50||Object.keys(results.dimension_summary||{}).length!==16)throw new Error('individual_results_invalid');
  const review=await prof('/api/applications/'+appId+'/review',{method:'POST',body:{status:'reviewed',note:'Revisión automática E2E sobre datos ficticios'}});
  if(review.review?.status!=='reviewed')throw new Error('professional_review_failed');
  const courseResults=await prof('/api/courses/'+courseId+'/results?measurement_id='+mid+'&school_year='+year);
  if(Number(courseResults.applications)<1)throw new Error('course_results_missing');
  const institutionResults=await prof('/api/establishments/'+eid+'/results?measurement_id='+mid+'&school_year='+year);
  if(Number(institutionResults.applications)<1)throw new Error('institution_results_missing');
  log.push('results_review');

  const team=await prof('/api/team');
  const self=(team.users||[]).find(x=>Number(x.id)===Number(me.user.id))||(team.users||[])[0];
  if(!self?.id)throw new Error('pilot_team_missing');

  const pg=await prof('/api/pgce/interventions',{method:'POST',body:{source_application_id:appId,dimension_code:'D01',priority:'low',professional_decision:'aprobar',responsible:self.name,responsible_user_id:self.id,start_date:dates.start,end_date:dates.end,indicator:'Indicador AUTO E2E',target:'Meta AUTO E2E',evidence:['Evidencia AUTO E2E'],rationale:['Prueba automática ficticia'],pgce_objectives:[],pgce_action_ids:[]}});
  if(!pg.intervention?.id||!pg.task?.id)throw new Error('pgce_linked_task_failed');
  const follow=await prof('/api/pgce/interventions/'+pg.intervention.id+'/updates',{method:'POST',body:{establishment_id:eid,measurement_code:'M1',status:'in_progress',progress_percent:25,evidence_note:'Evidencia AUTO E2E',adjustment_note:'Sin ajuste'}});
  if(!follow.update?.id||!follow.linked_tasks?.some(x=>Number(x.id)===Number(pg.task.id)&&x.status==='in_progress'))throw new Error('pgce_task_sync_failed');
  const dashboard=await prof('/api/pgce/dashboard?establishment_id='+eid);
  if(!dashboard.interventions?.some(x=>Number(x.id)===Number(pg.intervention.id)))throw new Error('pgce_dashboard_missing');
  log.push('pgce_task');

  const directTask=await prof('/api/tasks',{method:'POST',body:{title:'Tarea AUTO E2E '+stamp,description:'Tarea ficticia',assigned_to:self.id,due_date:dates.end,priority:'medium'}});
  if(!directTask.task?.id)throw new Error('direct_task_failed');
  const notes=await prof('/api/notifications?limit=50');
  if(!notes.notifications?.some(x=>String(x.title).includes('Tarea AUTO E2E')))throw new Error('task_notification_missing');
  const taskDone=await prof('/api/tasks/'+directTask.task.id+'/status',{method:'POST',body:{status:'completed'}});
  if(taskDone.task?.status!=='completed')throw new Error('task_completion_failed');
  log.push('tasks_notifications');

  const protocol=await prof('/api/protocols',{method:'POST',body:{name:'PROTOCOLO AUTO E2E '+stamp,description:'Protocolo ficticio',default_days:7}});
  if(!protocol.protocol?.id)throw new Error('protocol_create_failed');
  const protocolSteps=await prof('/api/protocols/'+protocol.protocol.id+'/steps',{method:'POST',body:{steps:[
    {title:'Paso E2E 1',description:'Prueba técnica',due_offset_days:1,required:true},
    {title:'Paso E2E 2',description:'Prueba técnica',due_offset_days:2,required:true}
  ]}});
  if(protocolSteps.steps?.length!==2)throw new Error('protocol_steps_save_failed');
  const cs=await prof('/api/cases',{method:'POST',body:{title:'CASO AUTO E2E '+stamp,protocol_id:protocol.protocol.id,student_id:st.id,priority:'medium',summary:'Antecedentes ficticios'}});
  if(!cs.case?.id||Number(cs.required_steps_created)!==2)throw new Error('case_create_or_steps_snapshot_failed');
  const caseDetail=await prof('/api/cases/'+cs.case.id);
  if(caseDetail.required_steps?.length!==2)throw new Error('case_required_steps_missing');
  await expectError('case_close_with_required_steps_pending',()=>prof('/api/cases/'+cs.case.id+'/status',{method:'POST',body:{status:'closed'}}),'required_protocol_steps_pending');
  const firstStep=caseDetail.required_steps[0],secondStep=caseDetail.required_steps[1];
  const firstDone=await prof('/api/cases/'+cs.case.id+'/steps/'+firstStep.id+'/status',{method:'POST',body:{status:'completed',note:'Prueba técnica completada'}});
  if(firstDone.step?.status!=='completed')throw new Error('case_step_complete_failed');
  const secondDone=await prof('/api/cases/'+cs.case.id+'/steps/'+secondStep.id+'/status',{method:'POST',body:{status:'completed',note:'Prueba técnica completada'}});
  if(secondDone.step?.status!=='completed')throw new Error('case_step_second_complete_failed');
  const ca=await prof('/api/cases/'+cs.case.id+'/actions',{method:'POST',body:{action_type:'Seguimiento AUTO E2E',note:'Actuación ficticia',responsible_user_id:self.id,due_date:dates.end}});
  if(!ca.action?.id||!ca.task?.id)throw new Error('case_action_task_failed');
  const closed=await prof('/api/cases/'+cs.case.id+'/status',{method:'POST',body:{status:'closed'}});
  if(closed.case?.status!=='closed'||!closed.cancelled_tasks?.some(x=>Number(x.id)===Number(ca.task.id)))throw new Error('case_close_task_cancel_failed');
  log.push('cases_protocols');

  const resource=await prof('/api/resources',{method:'POST',body:{title:'RECURSO AUTO E2E '+stamp,description:'Recurso ficticio',resource_type:'guia',audience:'profesionales',visibility:'management',url:'https://example.com/',tags:['auto-e2e','piloto']}});
  if(!resource.resource?.id)throw new Error('resource_create_failed');
  const resourceList=await prof('/api/resources');
  if(!resourceList.resources?.some(x=>Number(x.id)===Number(resource.resource.id)))throw new Error('resource_list_missing');
  const resourceOff=await prof('/api/resources/'+resource.resource.id+'/status',{method:'POST',body:{active:false}});
  if(resourceOff.resource?.active!==false)throw new Error('resource_deactivation_failed');
  log.push('resources');

  const trajectory=await prof('/api/students/'+st.id+'/applications?establishment_id='+eid);
  if(!trajectory.applications?.some(x=>Number(x.id)===appId&&x.status==='completed'))throw new Error('trajectory_missing');
  const withdrawn=await prof('/api/students/'+st.id+'/status',{method:'POST',body:{establishment_id:eid,active:false}});
  if(withdrawn.student?.active!==false)throw new Error('withdraw_failed');
  const reactivated=await prof('/api/students/'+st.id+'/status',{method:'POST',body:{establishment_id:eid,active:true}});
  if(reactivated.student?.active!==true)throw new Error('reactivate_failed');
  const resetPin=await prof('/api/students/'+st.id+'/reset-pin',{method:'POST'});
  if(resetPin.pin_reset!==true)throw new Error('student_pin_reset_failed');
  log.push('trajectory_status_pin_reset');

  const audit=await prof('/api/audit?establishment_id='+eid+'&limit=100');
  const actions=new Set((audit.events||[]).map(x=>x.action));
  const required=['measurement_configured','survey_course_assigned','survey_course_access_issued','measurement_activated','application_professional_review','pgce_intervention_created','pgce_followup_recorded','professional_task_created','professional_task_status_changed','case_protocol_saved','case_protocol_steps_saved','case_opened','case_protocol_step_updated','case_action_added','case_status_changed','institutional_resource_created','institutional_resource_deactivated','course_access_code_changed','student_pin_reset'];
  for(const x of required)if(!actions.has(x))throw new Error('audit_missing:'+x);
  log.push('audit');

  await expectError('aggregate_without_scope',()=>prof('/api/courses/'+courseId+'/results'),'measurement_and_school_year_required');
  await expectError('pgce_wrong_establishment',()=>prof('/api/pgce/interventions/'+pg.intervention.id+'/updates?establishment_id=999999999'),'establishment_forbidden');
  log.push('negative_controls');

  return {ok:true,stamp,started_at:startedAt,finished_at:new Date().toISOString(),establishment_id:eid,course_id:courseId,student_id:Number(st.id),application_id:appId,pgce_intervention_id:Number(pg.intervention.id),case_id:Number(cs.case.id),checks:log};
}
module.exports={runPilotSelfTest};
