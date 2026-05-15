const PROJECT_FILE_NAME = 'audity-project.cisoassess';
const RISK_REGISTER_DIR = 'risk_registers';
const REPORTS_DIR = 'reports';
const LOGS_DIR = 'logs';
const steps = ['Setup','Scope','Questions','Findings','Risk & Roadmap','Report'];
const domains = ['Governance','Risk Management','Asset Management','Identity & Access Management','Endpoint Security','Network Security','Cloud / SaaS Security','Vulnerability Management','Logging & Detection','Incident Response','Backup & Recovery','Third-Party Risk'];
const frameworks = [
 {id:'iso27001',name:'ISO 27001:2022',type:'Compliance',desc:'ISMS readiness, Annex A control mapping and audit evidence.'},
 {id:'nis2',name:'NIS2',type:'EU Regulation',desc:'Cybersecurity risk management, incident handling and governance readiness.'},
 {id:'nistcsf',name:'NIST CSF 2.0',type:'Framework',desc:'Govern, Identify, Protect, Detect, Respond and Recover.'},
 {id:'cis',name:'CIS Controls v8',type:'Technical baseline',desc:'Practical safeguards for core security hygiene.'},
 {id:'mitre',name:'MITRE ATT&CK',type:'Detection',desc:'Threat-informed detection and response coverage.'},
 {id:'hipaa',name:'HIPAA Security Rule',type:'Healthcare',desc:'US healthcare security rule mapping for ePHI environments.'},
 {id:'nsm',name:'NSM Grunnprinsipper',type:'Norway',desc:'Norwegian ICT security principles for practical baseline control.'}
];
const seedQuestions = [
 ['Governance','Is security ownership formally defined at management level?','Clear ownership prevents security decisions from getting stuck.','ISO 27001 A.5.2; NIS2 Art.20; NIST CSF GV.OC'],
 ['Governance','Are security policies approved, communicated and reviewed?','Policies must be usable, not just documents on a shelf.','ISO 27001 A.5.1; NIST CSF GV.PO'],
 ['Governance','Are security KPIs reported to management?','Management cannot steer what it cannot see.','NIST CSF GV.OV; ISO 27001 9.1'],
 ['Risk Management','Is there a maintained information security risk register?','A risk register turns issues into accountable business decisions.','ISO 27001 6.1.2; NIS2 Art.21'],
 ['Risk Management','Are risks assigned to accountable owners?','Risks without owners do not get remediated.','ISO 27001 6.1.3; NIST CSF GV.RM'],
 ['Asset Management','Is there a complete inventory of critical assets?','You cannot protect or patch assets you do not know exist.','CIS 1; ISO 27001 A.5.9; NIST CSF ID.AM'],
 ['Asset Management','Are internet-facing assets identified and reviewed?','Public exposure drives attack likelihood.','CIS 12; NIST CSF ID.AM'],
 ['Identity & Access Management','Is MFA enforced for all users?','MFA reduces account takeover risk.','CIS 6; ISO 27001 A.5.17; NIST CSF PR.AA'],
 ['Identity & Access Management','Is MFA enforced for all privileged accounts?','Privileged accounts are high-value targets in ransomware and intrusion scenarios.','CIS 6; ISO 27001 A.5.15; NIS2 Art.21'],
 ['Identity & Access Management','Are admin accounts separated from standard user accounts?','Separation reduces blast radius after phishing or endpoint compromise.','ISO 27001 A.5.18; CIS 5'],
 ['Identity & Access Management','Are privileged groups reviewed regularly?','Regular reviews remove stale or excessive access.','ISO 27001 A.5.18; CIS 6'],
 ['Endpoint Security','Is EDR deployed on all business-critical endpoints and servers?','EDR coverage is a core detection and containment layer.','CIS 10; NIST CSF DE.CM'],
 ['Endpoint Security','Are local admin rights restricted?','Local admin rights increase malware and lateral movement risk.','CIS 5; ISO 27001 A.8.2'],
 ['Network Security','Is network segmentation implemented for critical systems?','Segmentation limits lateral movement.','CIS 12; NIST CSF PR.IR'],
 ['Cloud / SaaS Security','Are M365 admin roles reviewed and minimized?','Cloud admin roles are often abused after credential compromise.','ISO 27001 A.5.18; CIS 6'],
 ['Cloud / SaaS Security','Is audit logging enabled for critical cloud services?','Without logs, detection and investigation become weak.','ISO 27001 A.8.15; NIST CSF DE.CM'],
 ['Vulnerability Management','Are vulnerability scans performed regularly?','Regular scanning provides visibility into exploitable weaknesses.','CIS 7; ISO 27001 A.8.8'],
 ['Vulnerability Management','Are critical vulnerabilities tracked to closure by SLA?','Critical exposure must be remediated with accountable timelines.','CIS 7; NIS2 Art.21'],
 ['Logging & Detection','Are critical identity, endpoint and network logs centrally collected?','Central logging is required for effective detection and investigation.','ISO 27001 A.8.15; NIST CSF DE.CM'],
 ['Logging & Detection','Are false positives reviewed and tuned regularly?','Noise reduces analyst trust and weakens response.','MITRE ATT&CK; NIST CSF DE.AE'],
 ['Incident Response','Is there a documented incident response plan?','A written plan reduces confusion during pressure.','NIST 800-61; ISO 27001 A.5.24'],
 ['Incident Response','Has the incident response plan been tested in the last 12 months?','Untested plans often fail during real incidents.','NIST 800-61; ISO 27001 A.5.24'],
 ['Backup & Recovery','Are all business-critical systems backed up?','Backups are a core ransomware recovery control.','CIS 11; ISO 27001 A.8.13'],
 ['Backup & Recovery','Has a restore test been performed in the last 6–12 months?','Backups have little value if restore capability is unproven.','CIS 11; NIST CSF RC.RP'],
 ['Backup & Recovery','Are backups immutable or offline protected?','Attackers often target backups before ransomware deployment.','CIS 11; NIS2 Art.21'],
 ['Third-Party Risk','Is there an inventory of critical suppliers?','Supplier risk cannot be managed without visibility.','ISO 27001 A.5.19; NIS2 Art.21'],
 ['Third-Party Risk','Are security requirements included in supplier contracts?','Contracts should define minimum security and incident obligations.','ISO 27001 A.5.20; NIS2 Art.21']
];
function uid(){return Math.random().toString(36).slice(2,10)}
function now(){return new Date().toISOString()}
function defaultState(){
 const questions=ComplianceData.questionDefinitions.map((q,i)=>({id:'q'+i,complianceQuestionId:q.id,domain:q.domain,question:q.question,why:q.whyItMatters,description:q.description,mapping:'',answer:'Unknown',score:null,evidence:'Not requested',confidence:'Medium',notes:'',flag:false}));
 const frameworkIds=ComplianceData.frameworks.map(f=>f.id);
 const frameworkModes=Object.fromEntries(frameworkIds.map((id,i)=>[id,i===0?'Primary':'Supporting']));
 return {view:'home',theme:'dark',currentStep:0,currentDomain:0,currentQuestion:0,libraryFrameworkId:'iso27001-2022',client:{id:'customer_demo',name:'Healthcare Corp.',industry:'Healthcare',country:'Germany',employees:3200,locations:140,criticality:'Very High',systems:['Active Directory','Microsoft 365','VPN','EDR','Backup Platform','EHR']},assessment:{id:'assessment_demo',name:'Full Security Maturity Assessment - Healthcare Corp.',type:'Full Security Maturity',audience:'Management + Technical Team',language:'English',frameworks:frameworkIds,frameworkModes,status:'In Progress',createdAt:now()},scope:{areas:['Governance','Identity & Access Management','Endpoint Security','Backup & Recovery','Incident Response','Vulnerability Management','Logging & Detection','Third-Party Risk'],outOfScope:['Penetration Testing','Source Code Review','Physical Security','OT Systems'],regulatory:'GDPR, healthcare obligations, ISO 27001 readiness, NIS2 relevance',assumptions:'Assessment is based on interviews, available evidence, configuration exports and management context.',limitations:'No penetration testing or source code review performed in this assessment.'},questions,findings:[
  {id:uid(),title:'Privileged accounts are not consistently protected with MFA',category:'Identity & Access Management',priority:'Critical',observation:'MFA enforcement for privileged accounts is only partially implemented across administrative access paths.',risk:'Compromised privileged credentials may allow administrative access without a second factor.',impact:'Domain compromise, ransomware deployment, unauthorized data access and prolonged business interruption.',recommendation:'Enforce MFA for all privileged accounts, implement Conditional Access, monitor break-glass accounts and review privileged groups.',owner:'IAM Lead / IT Security',status:'Confirmed',roadmap:'0–30 days',evidence:'Missing',confidence:'Medium',mapping:'ISO 27001 A.5.15; CIS 6; NIS2 Art.21'},
  {id:uid(),title:'Restore testing is not performed regularly for critical systems',category:'Backup & Recovery',priority:'Critical',observation:'There is limited evidence that restore tests are performed for business-critical systems.',risk:'Recovery capability may fail during ransomware or major outage scenarios.',impact:'Extended downtime affecting patient operations, financial loss and regulatory exposure.',recommendation:'Perform restore tests for critical systems, document results and align recovery procedures with RTO/RPO targets.',owner:'Infrastructure Lead',status:'In Review',roadmap:'0–30 days',evidence:'Partial',confidence:'Medium'}
 ],risks:[],roadmap:[],documents:[
  {id:uid(),name:'Information Security Policy',type:'Policy',status:'Provided',owner:'CISO'},
  {id:uid(),name:'Incident Response Plan',type:'IR',status:'Provided',owner:'Security Lead'},
  {id:uid(),name:'Restore Test Report',type:'Backup',status:'Missing',owner:'Infrastructure Lead'},
  {id:uid(),name:'Privileged Account Export',type:'IAM',status:'Requested',owner:'IAM Lead'}
 ],stakeholders:[{id:uid(),name:'Liam Hackelberg',role:'Interim CISO',email:'demo@demomail.com',notes:'Executive security leadership and assessment sponsor.'},{id:uid(),name:'Backup Owner',role:'Infrastructure Lead',email:'backup@example.com',notes:'Responsible for backup and restore evidence.'}],audit:[{id:uid(),timestamp:now(),action:'Seed data loaded',entity:'system'}],riskRegister:null,activityLog:[],logIntegrity:{valid:true,message:'Not checked yet',checkedAt:null}};
}
let state = defaultState();
let projectDirectoryHandle = null;
let projectFileHandle = null;
let riskRegisterFileHandle = null;
let activityLogFileHandle = null;
let activityIntegrityFileHandle = null;
let projectFolderReady = false;
let riskView = {search:'',level:'',status:'',showDeleted:false,sort:'riskLevel'};
let logView = {search:'',action:'',entityType:'',dateFrom:'',dateTo:''};
let saveTimer = null;
function supportsProjectFolderMode(){
 return typeof window!=='undefined'&&'showDirectoryPicker' in window&&window.isSecureContext===true;
}
function migrateAlphaDataToComplianceEngine(existingData){
 const base=defaultState();
 const legacyMap={iso27001:'iso27001-2022',nistcsf:'nist-csf-2',cis:'cis-v8',mitre:'mitre-attack',hipaa:'hipaa-security-rule',nsm:'nsm-grunnprinsipper',nis2:'nis2'};
 const state={...base,...existingData,theme:existingData?.theme||'dark',assessment:{...base.assessment,...(existingData?.assessment||{})}};
 state.client={...base.client,...(existingData?.client||{})};
 state.client.id=state.client.id||`customer_${uid()}`;
 state.assessment.id=state.assessment.id||`assessment_${uid()}`;
 state.assessment.frameworks=(state.assessment.frameworks||base.assessment.frameworks).map(id=>legacyMap[id]||id).filter((id,i,arr)=>ComplianceData.frameworks.some(f=>f.id===id)&&arr.indexOf(id)===i);
 if(!state.assessment.frameworks.length)state.assessment.frameworks=base.assessment.frameworks;
 state.assessment.frameworkModes={...base.assessment.frameworkModes,...(state.assessment.frameworkModes||{})};
 if(!state.assessment.frameworks.some(id=>state.assessment.frameworkModes[id]==='Primary'))state.assessment.frameworkModes[state.assessment.frameworks[0]]='Primary';
 state.questions=(state.questions||base.questions).map((q,i)=>({...q,id:q.id||`q${i}`,complianceQuestionId:q.complianceQuestionId||ComplianceEngine.questionIdForLegacyQuestion(q),description:q.description||'',why:q.why||q.whyItMatters||'',mapping:q.mapping||'',answer:q.answer||'Unknown',score:q.score??null,evidence:q.evidence||'Not requested',confidence:q.confidence||'Medium',notes:q.notes||'',flag:!!q.flag}));
 state.findings=state.findings||[];
 state.risks=state.risks||[];
 state.roadmap=state.roadmap||[];
 state.documents=state.documents||base.documents;
 state.stakeholders=state.stakeholders||base.stakeholders;
 state.audit=state.audit||base.audit;
 state.riskRegister=state.riskRegister||null;
 state.activityLog=state.activityLog||[];
 state.logIntegrity=state.logIntegrity||{valid:true,message:'Not checked yet',checkedAt:null};
 state.libraryFrameworkId=state.libraryFrameworkId||state.assessment.frameworks[0]||'iso27001-2022';
 return state;
}
async function verifyProjectFolderPermission(handle){
 const opts={mode:'readwrite'};
 if((await handle.queryPermission(opts))==='granted')return true;
 return (await handle.requestPermission(opts))==='granted';
}
async function getDir(parent,name){return parent.getDirectoryHandle(name,{create:true})}
async function readTextFile(handle){
 try{return await (await handle.getFile()).text()}catch(e){return ''}
}
async function writeTextFile(handle,text){
 const writable=await handle.createWritable();
 await writable.write(text);
 await writable.close();
}
async function readProjectFromFolder(handle){
 projectFileHandle=await handle.getFileHandle(PROJECT_FILE_NAME,{create:true});
 const file=await projectFileHandle.getFile();
 const text=await file.text();
 if(!text.trim()){
  state=defaultState();
  await writeProjectFile();
  return;
 }
 state=migrateAlphaDataToComplianceEngine(JSON.parse(text));
}
function riskRegisterFileName(){return `risk_register_${state.client.id}.json`}
async function setupProjectDataFiles(){
 const riskDir=await getDir(projectDirectoryHandle,RISK_REGISTER_DIR);
 riskRegisterFileHandle=await riskDir.getFileHandle(riskRegisterFileName(),{create:true});
 await loadRiskRegister();
 await setupActivityLogFiles();
 state.logIntegrity=await verifyActivityLogIntegrity();
 if(!state.logIntegrity.valid)render();
 await logAction({action:state.logIntegrity.valid?'log.integrity.checked':'log.integrity.failed',entityType:'activity_log',entityId:state.client.id,summary:state.logIntegrity.message,details:state.logIntegrity});
 await logAction({action:'storage.initialized',entityType:'project_folder',entityId:state.client.id,summary:'Project folder storage initialized'});
 await logAction({action:'app.started',entityType:'system',entityId:'app',summary:'Audity started with project folder mode'});
 await logAction({action:'project_folder.connected',entityType:'project_folder',entityId:state.client.id,summary:'Project folder connected'});
}
async function writeProjectFile(){
 if(!projectFileHandle||!projectFolderReady)return;
 const writable=await projectFileHandle.createWritable();
 await writable.write(JSON.stringify(state,null,2));
 await writable.close();
}
function save(){
 if(!projectFolderReady)return;
 clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>writeProjectFile().catch(err=>alert(`Project save failed: ${err.message}`)),120);
}
function riskRegisterTemplate(){
 const t=now();
 return {schemaVersion:'1.0.0',type:'audity-risk-register',customerId:state.client.id,createdAt:t,updatedAt:t,risks:[]};
}
function calculateRiskScore(likelihood,impact){
 if(!likelihood||!impact)return null;
 return Number(likelihood)*Number(impact);
}
function calculateRiskLevel(score){
 if(!score)return '';
 if(score<=4)return 'Low';
 if(score<=9)return 'Medium';
 if(score<=16)return 'High';
 return 'Critical';
}
function recalcRisk(risk){
 risk.likelihood=risk.likelihood?Number(risk.likelihood):null;
 risk.impact=risk.impact?Number(risk.impact):null;
 risk.inherentRiskScore=calculateRiskScore(risk.likelihood,risk.impact);
 risk.riskLevel=calculateRiskLevel(risk.inherentRiskScore);
 risk.residualLikelihood=risk.residualLikelihood?Number(risk.residualLikelihood):null;
 risk.residualImpact=risk.residualImpact?Number(risk.residualImpact):null;
 risk.residualRiskScore=calculateRiskScore(risk.residualLikelihood,risk.residualImpact);
 risk.residualRiskLevel=calculateRiskLevel(risk.residualRiskScore);
 return risk;
}
function firstMappedControlId(question){
 const mapped=ComplianceEngine.getControlsForQuestion(question.complianceQuestionId,state.assessment.frameworks);
 return mapped[0]?.control?.id||'unmapped-control';
}
function riskKey(risk){return [risk.assessmentId,risk.sourceType,risk.sourceId||'',risk.controlId||''].join('|')}
function questionNeedsRisk(q){
 return ['No','Partially'].includes(q.answer)||(q.score!==null&&Number(q.score)<=2)||['Missing','Outdated'].includes(q.evidence);
}
function suggestedRiskFromQuestion(q){
 const controlId=firstMappedControlId(q);
 const severe=q.domain.includes('Identity')||q.domain.includes('Backup')||q.domain.includes('Incident')||state.client.criticality==='Very High';
 const likelihood=q.answer==='No'||q.score===0||q.score===1?4:3;
 const impact=severe?5:4;
 return recalcRisk({
  id:`risk_${uid()}`,
  customerId:state.client.id,
  assessmentId:state.assessment.id,
  sourceType:'assessment-question',
  sourceId:q.id,
  controlId,
  title:suggestTitle(q),
  description:`The assessment answer indicates a potential control weakness for: ${q.question}`,
  category:q.domain,
  likelihood,
  impact,
  treatment:'Mitigate',
  owner:'',
  status:'Open',
  dueDate:'',
  mitigationPlan:'Define accountable owner, implement remediation plan, collect evidence and review effectiveness.',
  residualLikelihood:null,
  residualImpact:null,
  residualRiskScore:null,
  residualRiskLevel:'',
  notes:q.evidence==='Missing'?'Evidence is missing and should be requested before final assessment conclusions.':'',
  createdAutomatically:true,
  manuallyEdited:false,
  deleted:false,
  createdAt:now(),
  updatedAt:now()
 });
}
function suggestedRiskFromFinding(f){
 const likelihood=f.priority==='Critical'?4:f.priority==='High'?3:2;
 const impact=f.priority==='Critical'?5:f.priority==='High'?4:3;
 return recalcRisk({id:`risk_${uid()}`,customerId:state.client.id,assessmentId:state.assessment.id,sourceType:'finding',sourceId:f.id,controlId:(f.frameworkMapping||[])[0]||f.mapping||'',title:riskTitle(f),description:f.risk||f.observation||'',category:f.category||'General',likelihood,impact,treatment:'Mitigate',owner:f.owner||'',status:'Open',dueDate:'',mitigationPlan:f.recommendation||'',residualLikelihood:null,residualImpact:null,residualRiskScore:null,residualRiskLevel:'',notes:'',createdAutomatically:true,manuallyEdited:false,deleted:false,createdAt:now(),updatedAt:now()});
}
async function loadRiskRegister(){
 const text=await readTextFile(riskRegisterFileHandle);
 if(text.trim()){
  try{state.riskRegister=JSON.parse(text)}catch(e){state.riskRegister=riskRegisterTemplate()}
 }else{
  state.riskRegister=riskRegisterTemplate();
  await saveRiskRegister();
 }
 state.riskRegister.risks=(state.riskRegister.risks||[]).map(recalcRisk);
 await syncRisksFromAssessment(false);
}
async function saveRiskRegister(){
 if(!riskRegisterFileHandle||!state.riskRegister)return;
 state.riskRegister.updatedAt=now();
 await writeTextFile(riskRegisterFileHandle,JSON.stringify(state.riskRegister,null,2));
}
async function syncRisksFromAssessment(shouldLog=true){
 if(!state.riskRegister)state.riskRegister=riskRegisterTemplate();
 const existing=new Map(state.riskRegister.risks.map(r=>[riskKey(r),r]));
 let created=0,updated=0;
 let createdIds=[];
 for(const q of state.questions.filter(questionNeedsRisk)){
  const suggested=suggestedRiskFromQuestion(q);
  const key=riskKey(suggested);
  const current=existing.get(key);
  if(current){
   if(!current.manuallyEdited&&!current.deleted){
    Object.assign(current,{title:suggested.title,description:suggested.description,category:suggested.category,likelihood:suggested.likelihood,impact:suggested.impact,mitigationPlan:suggested.mitigationPlan,notes:suggested.notes,updatedAt:now()});
    recalcRisk(current);
    updated++;
   }
  }else{
   state.riskRegister.risks.push(suggested);
   existing.set(key,suggested);
   created++;
   createdIds.push(suggested.id);
  }
 }
 for(const f of state.findings.filter(f=>f.priority&&f.status!=='Accepted risk')){
  const suggested=suggestedRiskFromFinding(f);
  const key=riskKey(suggested);
  const current=existing.get(key);
  if(current){
   if(!current.manuallyEdited&&!current.deleted){
    Object.assign(current,{title:suggested.title,description:suggested.description,category:suggested.category,likelihood:suggested.likelihood,impact:suggested.impact,owner:suggested.owner,mitigationPlan:suggested.mitigationPlan,updatedAt:now()});
    recalcRisk(current);
    updated++;
   }
  }else{
   state.riskRegister.risks.push(suggested);
   existing.set(key,suggested);
   created++;
   createdIds.push(suggested.id);
  }
 }
 for(const r of state.riskRegister.risks.filter(r=>r.createdAutomatically&&r.sourceType==='assessment-question'&&!r.manuallyEdited&&!r.deleted)){
  const q=state.questions.find(q=>q.id===r.sourceId);
  if(q&&!questionNeedsRisk(q)&&r.status!=='Closed'){
   r.status='Closed';
   r.updatedAt=now();
   updated++;
  }
 }
 await saveRiskRegister();
 if(shouldLog&&createdIds.length)await logAction({action:'risk.created.automatically',entityType:'risk_register',entityId:state.client.id,summary:`${createdIds.length} risks created automatically`,details:{riskIds:createdIds}});
 if(shouldLog&&(created||updated))await logAction({action:'risk.score.recalculated',entityType:'risk_register',entityId:state.client.id,summary:`Risk register synchronized from assessment: ${created} created, ${updated} updated`,details:{created,updated}});
}
async function addManualRisk(){
 const t=now();
 const risk=recalcRisk({id:`risk_${uid()}`,customerId:state.client.id,assessmentId:state.assessment.id,sourceType:'manual',sourceId:null,controlId:'',title:'New manual risk',description:'',category:'General',likelihood:3,impact:3,treatment:'Mitigate',owner:'',status:'Open',dueDate:'',mitigationPlan:'',residualLikelihood:null,residualImpact:null,residualRiskScore:null,residualRiskLevel:'',notes:'',createdAutomatically:false,manuallyEdited:true,deleted:false,createdAt:t,updatedAt:t});
 state.riskRegister.risks.unshift(risk);
 await saveRiskRegister();
 await logAction({action:'risk.created.manually',entityType:'risk',entityId:risk.id,summary:'Manual risk created'});
 render();
}
async function updateRegisterRisk(id,field,value){
 const risk=state.riskRegister.risks.find(r=>r.id===id);
 if(!risk)return;
 const oldValue=risk[field];
 risk[field]=['likelihood','impact','residualLikelihood','residualImpact'].includes(field)&&(value!==''&&value!==null)?Number(value):(value===''&&['residualLikelihood','residualImpact'].includes(field)?null:value);
 risk.manuallyEdited=true;
 risk.updatedAt=now();
 recalcRisk(risk);
 await saveRiskRegister();
 await logAction({action:'risk.updated',entityType:'risk',entityId:id,summary:`Risk ${field} changed`,details:{field,oldValue,newValue:risk[field]}});
 render();
}
async function deleteRegisterRisk(id){
 const risk=state.riskRegister.risks.find(r=>r.id===id);
 if(!risk||!confirm('Soft-delete this risk?'))return;
 risk.deleted=true;
 risk.deletedAt=now();
 risk.deletedBy='local-user';
 risk.updatedAt=now();
 await saveRiskRegister();
 await logAction({action:'risk.deleted',entityType:'risk',entityId:id,summary:`Risk soft-deleted: ${risk.title}`});
 render();
}
async function restoreRegisterRisk(id){
 const risk=state.riskRegister.risks.find(r=>r.id===id);
 if(!risk)return;
 risk.deleted=false;
 risk.updatedAt=now();
 await saveRiskRegister();
 await logAction({action:'risk.restored',entityType:'risk',entityId:id,summary:`Risk restored: ${risk.title}`});
 render();
}
function canonicalJson(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
async function sha256(text){
 if(window.crypto?.subtle){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
 }
 let h=0;
 for(let i=0;i<text.length;i++)h=(Math.imul(31,h)+text.charCodeAt(i))|0;
 return `fallback-${Math.abs(h)}`;
}
async function setupActivityLogFiles(){
 const logsDir=await getDir(projectDirectoryHandle,LOGS_DIR);
 const customerDir=await getDir(logsDir,`customer_${state.client.id}`);
 activityLogFileHandle=await customerDir.getFileHandle('activity_log.jsonl',{create:true});
 activityIntegrityFileHandle=await customerDir.getFileHandle('activity_log_integrity.json',{create:true});
}
async function readActivityEntries(){
 const text=await readTextFile(activityLogFileHandle);
 return text.split('\n').filter(Boolean).map(line=>JSON.parse(line));
}
async function writeIntegrity(count,lastHash,valid=true){
 await writeTextFile(activityIntegrityFileHandle,JSON.stringify({schemaVersion:'1.0.0',customerId:state.client.id,count,lastHash,valid,updatedAt:now()},null,2));
}
async function verifyActivityLogIntegrity(){
 try{
  const entries=await readActivityEntries();
  let previousHash=null;
  for(let i=0;i<entries.length;i++){
   const entry=entries[i];
   const expectedPrevious=previousHash;
   const storedHash=entry.entryHash;
   const withoutHash={...entry};
   delete withoutHash.entryHash;
   const calculated=await sha256(canonicalJson(withoutHash));
   if(entry.previousHash!==expectedPrevious||storedHash!==calculated){
    return {valid:false,message:'Activity log integrity warning',checkedAt:now(),entryIndex:i};
   }
   previousHash=storedHash;
  }
  const integrityText=await readTextFile(activityIntegrityFileHandle);
  if(integrityText.trim()){
   const integrity=JSON.parse(integrityText);
   if(integrity.count!==entries.length||integrity.lastHash!==previousHash){
    return {valid:false,message:'Activity log integrity warning',checkedAt:now(),entryIndex:null};
   }
  }else{
   await writeIntegrity(entries.length,previousHash,true);
  }
  state.activityLog=entries;
  return {valid:true,message:'Activity log integrity verified',checkedAt:now(),entryCount:entries.length};
 }catch(e){
  return {valid:false,message:'Activity log integrity warning',checkedAt:now(),error:e.message};
 }
}
async function logAction(input){
 if(!activityLogFileHandle||!activityIntegrityFileHandle)return;
 if(state.logIntegrity&&!state.logIntegrity.valid&&input.action!=='log.integrity.failed')return;
 const entries=await readActivityEntries();
 const previousHash=entries.length?entries[entries.length-1].entryHash:null;
 const entry={id:`log_${uid()}`,timestamp:now(),customerId:state.client.id,assessmentId:state.assessment.id,userId:'local-user',action:input.action,entityType:input.entityType||'',entityId:input.entityId||'',summary:input.summary||'',details:input.details||{},previousHash};
 entry.entryHash=await sha256(canonicalJson(entry));
 const existing=await readTextFile(activityLogFileHandle);
 await writeTextFile(activityLogFileHandle,existing+(existing.endsWith('\n')||!existing?'':'\n')+JSON.stringify(entry)+'\n');
 await writeIntegrity(entries.length+1,entry.entryHash,true);
 state.activityLog=[...entries,entry];
}
async function chooseProjectFolder(){
 try{
  projectDirectoryHandle=await window.showDirectoryPicker({mode:'readwrite'});
  if(!(await verifyProjectFolderPermission(projectDirectoryHandle))){
  alert('Audity needs read and write access to the selected project folder.');
   return;
  }
  projectFolderReady=true;
  await readProjectFromFolder(projectDirectoryHandle);
  await setupProjectDataFiles();
  render();
  toast('Project folder connected');
 }catch(err){
  projectFolderReady=false;
  if(err.name!=='AbortError')alert(`Project folder could not be opened: ${err.message}`);
 }
}
function applyTheme(){document.body.dataset.theme=state.theme||'dark'}
function setTheme(theme){state.theme=theme;save();logAction({action:'assessment.updated',entityType:'settings',entityId:'theme',summary:`Theme changed to ${theme}`});applyTheme();render();toast(`${theme==='light'?'Light':'Dark'} mode enabled`)}
function setView(v){state.view=v;save();if(v==='flow')logAction({action:'assessment.opened',entityType:'assessment',entityId:state.assessment.id,summary:'Assessment opened'});render()}
function newAssessmentState(){
 const fresh=defaultState();
 fresh.theme=state?.theme||'dark';
 fresh.view='flow';
 fresh.currentStep=0;
 fresh.currentDomain=0;
 fresh.currentQuestion=0;
 fresh.client={id:`customer_${uid()}`,name:'New Client',industry:'',country:'',employees:0,locations:0,criticality:'Medium',systems:[]};
 fresh.assessment={...fresh.assessment,id:`assessment_${uid()}`,name:'New Security Assessment',type:'Full Security Maturity',audience:'Management + Technical Team',language:'English',status:'Draft',createdAt:now()};
 fresh.findings=[];
 fresh.risks=[];
 fresh.roadmap=[];
 fresh.documents=[];
 fresh.stakeholders=[];
 fresh.audit=[{id:uid(),timestamp:now(),action:'New assessment created',entity:'assessment'}];
 return fresh;
}
async function startNewAssessment(){if((completedQuestions()||state.findings.length||state.risks.length)&&!confirm('Start a new assessment? Export a backup first if you want to keep the current local project.'))return;state=newAssessmentState();await setupProjectDataFiles();save();await logAction({action:'assessment.created',entityType:'assessment',entityId:state.assessment.id,summary:'New assessment created'});render();toast('New assessment started')}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function esc(s){return (s??'').toString().replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function appShell(content){let warning=state.logIntegrity&&!state.logIntegrity.valid?`<div class="card integrity-warning"><h3>Activity log integrity warning</h3><p>Audity detected that the activity log for this customer may have been modified outside the app. The log can still be viewed, but its integrity can no longer be fully trusted.</p></div>`:'';return `<div class="app"><aside class="sidebar"><div class="brand"><div class="logo logo-image"><img src="audity-icon.png" alt="Audity logo"></div><div><h1>Audity</h1><p>Streamline the Audit Process</p></div></div><nav class="nav">${navBtn('home','Home','⌂')}${navBtn('flow','Guided Assessment','◎')}${navBtn('overview','Assessment Overview','▦')}${navBtn('riskRegister','Risk Register','▤')}${navBtn('activityLog','Activity Log','◷')}${navBtn('library','Framework Library','▣')}${navBtn('advanced','Advanced Data','☷')}${navBtn('settings','Settings & Backup','⚙')}</nav><div class="side-card"><strong>Next recommended action</strong><p>${nextAction()}</p></div><div class="side-card"><strong>Project folder mode</strong><p>Assessment data is written to ${PROJECT_FILE_NAME} in the folder selected by the user.</p></div></aside><main class="content"><header class="topbar"><div class="top-title"><b>${esc(state.assessment.name)}</b>${esc(state.client.name)} · ${reportReadiness()}% report readiness</div><div class="actions"><button class="btn ghost" onclick="exportProject()">Export .cisoassess</button><button class="btn primary" onclick="setView('flow')">Continue</button></div></header><section class="main">${warning}${content}</section></main></div>`}
function navBtn(v,label,icon){return `<button class="${state.view===v?'active':''}" onclick="setView('${v}')"><span>${icon}</span>${label}</button>`}
function nextAction(){if(state.currentStep<2)return 'Complete setup and scope so risk suggestions use the correct business context.'; if(completedQuestions()<state.questions.length)return `Answer remaining questions. Current progress: ${completedQuestions()} / ${state.questions.length}.`; if(suggestedFindings().length)return `Review ${suggestedFindings().length} suggested findings before generating the report.`; if(!state.risks.length)return 'Generate risk register and roadmap from confirmed findings.'; return 'Preview and export the report.'}
function completedQuestions(){return state.questions.filter(q=>q.answer!=='Unknown'||q.score!==null||q.notes).length}
function reportReadiness(){let pct=15; pct+=state.scope.areas.length?15:0; pct+=Math.round((completedQuestions()/state.questions.length)*35); pct+=state.findings.length?15:0; pct+=state.risks.length?10:0; pct+=state.roadmap.length?10:0; return Math.min(100,pct)}
function priorityBadge(p){let c=p==='Critical'?'crit':p==='High'?'high':p==='Medium'?'med':'green';return `<span class="badge ${c}">${esc(p)}</span>`}
function stepper(){return `<div class="stepper">${steps.map((s,i)=>`<span class="step ${i<state.currentStep?'done':i===state.currentStep?'current':''}">${i<state.currentStep?'✓':i+1}. ${s}</span>`).join('')}</div>`}
function home(){let engine=ComplianceEngine.evaluateAll(state);return appShell(`<div class="hero"><div class="panel panel-pad"><h2>Help security professionals move faster from assessment to findings, risks, roadmap, and report..</h2><p>This alpha version guides the user from setup to report. It contains test data, framework examples, suggested findings, risk register generation, roadmap creation, report preview and local project file storage.</p><div class="actions"><button class="btn primary" onclick="startNewAssessment()">Start guided assessment</button><button class="btn" onclick="setView('overview')">Open overview</button></div></div><div class="panel panel-pad"><h3>Compliance Engine Alpha</h3><p class="muted">${esc(ComplianceData.disclaimer)}</p><div class="grid"><div><span class="badge green">${engine.frameworks.length} frameworks selected</span></div><div class="progress"><div class="bar" style="width:${Math.round(engine.summaries.reduce((a,b)=>a+b.readinessScore,0)/Math.max(engine.summaries.length,1))}%"></div></div><p class="muted">${Math.round(engine.summaries.reduce((a,b)=>a+b.readinessScore,0)/Math.max(engine.summaries.length,1))}% average readiness score</p></div></div></div><div class="grid grid-4" style="margin-top:18px">${metric('Questions',completedQuestions()+' / '+state.questions.length,'Guided assessment progress')}${metric('Findings',state.findings.length,'Confirmed or in review')}${metric('Potential gaps',engine.gaps.length,'Generated from framework mappings')}${metric('Frameworks',state.assessment.frameworks.length,'Selected mappings')}</div><div class="panel panel-pad" style="margin-top:18px"><h3>Recent work</h3><table class="table"><tr><th>Project</th><th>Type</th><th>Status</th><th>Action</th></tr><tr><td>${esc(state.client.name)}</td><td>${esc(state.assessment.type)}</td><td>${esc(state.assessment.status)}</td><td><button class="btn" onclick="setView('flow')">Continue</button></td></tr><tr><td>NordBank Demo</td><td>NIS2 Readiness</td><td>Test entry</td><td><button class="btn" onclick="toast('Demo project list only in alpha')">Open</button></td></tr><tr><td>RetailCo Demo</td><td>Ransomware Readiness</td><td>Test entry</td><td><button class="btn" onclick="toast('Demo project list only in alpha')">Open</button></td></tr></table></div>`)}
function metric(title,value,sub){return `<div class="card"><div class="muted">${title}</div><div class="metric">${value}</div><div class="small">${sub}</div></div>`}
function flow(){let s=state.currentStep; let body=[setup,scope,questions,findingsReview,riskRoadmap,report][s]();return appShell(`${stepper()}${body}`)}
function setup(){return `<div class="section-title"><div><h2>Step 1: Setup</h2><p>Define the client, assessment type, audience and frameworks.</p></div></div><div class="grid grid-2"><div class="card"><label>Client name</label><input class="field" value="${esc(state.client.name)}" onchange="state.client.name=this.value;save()"><label>Industry</label><input class="field" value="${esc(state.client.industry)}" onchange="state.client.industry=this.value;save()"><label>Country</label><input class="field" value="${esc(state.client.country)}" onchange="state.client.country=this.value;save()"><label>Employees</label><input class="field" type="number" value="${state.client.employees}" onchange="state.client.employees=Number(this.value);save()"></div><div class="card"><label>Assessment name</label><input class="field" value="${esc(state.assessment.name)}" onchange="state.assessment.name=this.value;save()"><label>Assessment type</label><select class="field" onchange="state.assessment.type=this.value;save()">${['Full Security Maturity','ISO 27001 Readiness','NIS2 Readiness','Ransomware Readiness','SOC / Detection Maturity','Incident Response Readiness'].map(t=>`<option ${state.assessment.type===t?'selected':''}>${t}</option>`).join('')}</select><label>Report audience</label><select class="field" onchange="state.assessment.audience=this.value;save()"><option>Management + Technical Team</option><option>Board</option><option>Technical Team</option><option>Audit / Compliance</option></select><label>Language</label><select class="field" onchange="state.assessment.language=this.value;save()"><option>English</option><option>German</option><option>Norwegian</option></select></div></div><div class="card" style="margin-top:16px"><h3>Framework selection</h3><p class="muted">Selected frameworks influence generated questions, evidence expectations, readiness coverage and gap analysis. Alpha mappings are assessment support, not certification-grade catalogues.</p><div class="choice-grid">${ComplianceData.frameworks.map(frameworkCard).join('')}</div><div class="actions" style="margin-top:14px"><button class="btn" onclick="regenerateQuestionsFromFrameworks()">Regenerate questions from selected frameworks</button></div></div>${footer('', 'Save setup and continue', 'nextStep()')}`}
function frameworkCard(f){let selected=state.assessment.frameworks.includes(f.id);let mode=state.assessment.frameworkModes[f.id]||'Supporting';let domainCount=ComplianceData.domains.filter(d=>d.frameworkId===f.id).length;let controlCount=ComplianceData.controls.filter(c=>c.frameworkId===f.id).length;return `<div class="choice ${selected?'selected':''}"><div onclick="toggleFramework('${f.id}')"><span class="badge ${f.alphaStatus==='complete'?'green':'med'}">${esc(f.alphaStatus)} alpha</span><h3>${esc(f.name)}</h3><p class="muted">${esc(f.version)} · ${esc(f.type)} · ${esc(f.jurisdiction||'Global')}</p><p class="small">${domainCount} domains · ${controlCount} controls</p></div><label>Usage mode</label><select class="field" onchange="setFrameworkMode('${f.id}',this.value)" ${selected?'':'disabled'}>${['Primary','Supporting','Report Only','Compliance Readiness'].map(x=>`<option ${mode===x?'selected':''}>${x}</option>`).join('')}</select></div>`}
function toggleFramework(id){let a=state.assessment.frameworks; state.assessment.frameworks=a.includes(id)?a.filter(x=>x!==id):[...a,id]; if(!state.assessment.frameworks.length)state.assessment.frameworks=[id]; if(!state.assessment.frameworks.some(fid=>state.assessment.frameworkModes[fid]==='Primary'))state.assessment.frameworkModes[state.assessment.frameworks[0]]='Primary'; save();render()}
function setFrameworkMode(id,mode){if(mode==='Primary'){Object.keys(state.assessment.frameworkModes).forEach(fid=>{if(state.assessment.frameworkModes[fid]==='Primary')state.assessment.frameworkModes[fid]='Supporting'}); if(!state.assessment.frameworks.includes(id))state.assessment.frameworks.push(id)} state.assessment.frameworkModes[id]=mode; save();render()}
function questionGeneratingFrameworkIds(){return state.assessment.frameworks.filter(id=>state.assessment.frameworkModes[id]!=='Report Only')}
function regenerateQuestionsFromFrameworks(){let existing=Object.fromEntries(state.questions.map(q=>[q.complianceQuestionId,q]));let generated=ComplianceEngine.generateAssessmentQuestions({assessmentType:state.assessment.type,selectedFrameworkIds:questionGeneratingFrameworkIds(),businessCriticality:state.client.criticality,inScopeDomains:state.scope.areas});state.questions=generated.map((q,i)=>({...(existing[q.id]||{}),id:existing[q.id]?.id||`q${i}`,complianceQuestionId:q.id,domain:q.domain,question:q.question,why:q.whyItMatters,description:q.description,mapping:'',answer:existing[q.id]?.answer||'Unknown',score:existing[q.id]?.score??null,evidence:existing[q.id]?.evidence||'Not requested',confidence:existing[q.id]?.confidence||'Medium',notes:existing[q.id]?.notes||'',flag:existing[q.id]?.flag||false}));state.currentDomain=0;state.currentQuestion=0;save();toast('Questions regenerated from selected frameworks');render()}
function scope(){let all=domains;return `<div class="section-title"><div><h2>Step 2: Scope & Context</h2><p>Keep it simple. Select what matters and define business criticality.</p></div></div><div class="card" style="margin-bottom:16px"><p class="muted">Selected frameworks will influence the question set, evidence expectations, and compliance coverage calculations.</p></div><div class="grid grid-2"><div class="card"><h3>In-scope areas</h3><div class="choice-grid">${all.map(d=>`<div class="choice ${state.scope.areas.includes(d)?'selected':''}" onclick="toggleArray(state.scope.areas,'${d}')"><strong>${d}</strong><span>${state.scope.areas.includes(d)?'Included':'Click to include'}</span></div>`).join('')}</div></div><div class="card"><h3>Business context</h3><label>Business criticality</label><select class="field" onchange="state.client.criticality=this.value;save()"><option ${state.client.criticality==='Low'?'selected':''}>Low</option><option ${state.client.criticality==='Medium'?'selected':''}>Medium</option><option ${state.client.criticality==='High'?'selected':''}>High</option><option ${state.client.criticality==='Very High'?'selected':''}>Very High</option></select><label>Critical systems</label><textarea class="field" onchange="state.client.systems=this.value.split('\n').filter(Boolean);save()">${esc(state.client.systems.join('\n'))}</textarea><label>Regulatory context</label><textarea class="field" onchange="state.scope.regulatory=this.value;save()">${esc(state.scope.regulatory)}</textarea></div></div><div class="grid grid-2" style="margin-top:16px"><div class="card"><label>Assumptions</label><textarea class="field" onchange="state.scope.assumptions=this.value;save()">${esc(state.scope.assumptions)}</textarea></div><div class="card"><label>Limitations</label><textarea class="field" onchange="state.scope.limitations=this.value;save()">${esc(state.scope.limitations)}</textarea></div></div>${footer('prevStep()','Save scope and continue','nextStep()')}`}
function toggleArray(arr,val){let i=arr.indexOf(val); if(i>=0)arr.splice(i,1); else arr.push(val); save(); render()}
function questions(){let ds=[...new Set(state.questions.map(q=>q.domain))];let d=ds[state.currentDomain]||ds[0];let qs=state.questions.filter(q=>q.domain===d);let q=qs[state.currentQuestion]||qs[0];let domainDone=qs.filter(x=>x.answer!=='Unknown'||x.score!==null).length;let controls=ComplianceEngine.getControlsForQuestion(q.complianceQuestionId,state.assessment.frameworks);let evidence=ComplianceEngine.getEvidenceForQuestion(q.complianceQuestionId,state.assessment.frameworks);return `<div class="section-title"><div><h2>Step 3: Guided Questions</h2><p>Answer one domain at a time. Unknown is allowed. The app keeps the flow moving.</p></div><div><span class="badge green">Domain ${state.currentDomain+1} / ${ds.length}</span></div></div><div class="split"><div class="card question"><div class="muted">${esc(d)} · ${domainDone} / ${qs.length} complete</div><div class="progress" style="margin:10px 0 18px"><div class="bar" style="width:${Math.round(domainDone/qs.length*100)}%"></div></div><h3>${esc(q.question)}</h3><p class="muted"><b>Why this matters:</b> ${esc(q.why)}</p><details class="details"><summary>Mapped frameworks (${controls.length})</summary><div class="pillrow">${controls.slice(0,20).map(item=>`<span class="badge">${esc(item.framework.shortName)} ${esc(item.control.controlCode)}</span>`).join('')||'<span class="small">No mapped controls for selected frameworks.</span>'}</div></details><details class="details"><summary>Evidence expected for mapped controls</summary><ul class="small">${evidence.map(x=>`<li>${esc(x)}</li>`).join('')||'<li>No evidence requirement mapped.</li>'}</ul></details><label>Your answer</label><div class="choice-grid">${['Yes','Partially','No','Unknown','Not applicable'].map(a=>`<div class="choice ${q.answer===a?'selected':''}" onclick="setQuestion('${q.id}','answer','${a}')"><strong>${a}</strong></div>`).join('')}</div><div class="grid grid-3" style="margin-top:14px"><div><label>Maturity score</label><select class="field" onchange="setQuestion('${q.id}','score',this.value?Number(this.value):null)"><option value="">Not scored</option>${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${q.score===n?'selected':''}>${n} / 5</option>`).join('')}</select></div><div><label>Evidence</label><select class="field" onchange="setQuestion('${q.id}','evidence',this.value)">${['Not requested','Requested','Provided','Reviewed','Missing','Outdated','Not applicable'].map(x=>`<option ${q.evidence===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label>Confidence</label><select class="field" onchange="setQuestion('${q.id}','confidence',this.value)">${['Low','Medium','High'].map(x=>`<option ${q.confidence===x?'selected':''}>${x}</option>`).join('')}</select></div></div><label style="margin-top:14px">Notes</label><textarea class="field" onchange="setQuestion('${q.id}','notes',this.value)">${esc(q.notes)}</textarea>${suggestionBox(q)}<div class="footer-actions"><button class="btn" onclick="prevQuestion()">Previous question</button><button class="btn primary" onclick="nextQuestion()">Save and next</button></div></div><div class="card"><h3>Domains</h3>${ds.map((x,i)=>{let c=state.questions.filter(q=>q.domain===x);let done=c.filter(q=>q.answer!=='Unknown'||q.score!==null).length;return `<div class="choice ${i===state.currentDomain?'selected':''}" onclick="state.currentDomain=${i};state.currentQuestion=0;save();render()"><strong>${x}</strong><span>${done} / ${c.length} complete</span></div>`}).join('')}<button class="btn primary" style="width:100%;margin-top:12px" onclick="state.currentStep=3;save();render()">Go to finding review</button></div></div>${footer('prevStep()','Continue to finding review','state.currentStep=3;save();render()')}`}
async function setQuestion(id,k,v){let q=state.questions.find(x=>x.id===id);let oldValue=q[k]; q[k]=v; if(['No','Partially'].includes(q.answer)||(q.score!==null&&q.score<=1)){q.flag=true}else{q.flag=false} save(); await logAction({action:oldValue==='Unknown'&&k==='answer'?'question.answered':'question.answer.updated',entityType:'question',entityId:id,summary:`Question ${k} changed`,details:{field:k,oldValue,newValue:v}}); await syncRisksFromAssessment(); render()}
function suggestionBox(q){let bad=['No','Partially'].includes(q.answer)||q.score===0||q.score===1;if(!bad)return '';let sev=(q.domain.includes('Identity')||q.domain.includes('Backup')||state.client.criticality==='Very High')?'Critical':'High';return `<div class="card suggested-card"><span class="badge ${sev==='Critical'?'crit':'high'}">Potential finding detected</span><h3>${suggestTitle(q)}</h3><p class="muted">This is suggested based on the answer and business context. Review it before adding it to the report.</p><div class="actions"><button class="btn primary" onclick="addFindingFromQuestion('${q.id}')">Add finding now</button><button class="btn" onclick="toast('Kept for later review')">Review later</button></div></div>`}
function suggestTitle(q){if(q.question.includes('MFA')&&q.question.includes('privileged'))return 'Privileged accounts are not consistently protected with MFA';if(q.question.includes('restore'))return 'Restore testing is not performed regularly for critical systems';if(q.question.includes('inventory'))return 'Critical asset inventory is incomplete';if(q.question.includes('incident response plan'))return 'Incident response plan is missing or incomplete';return q.domain+' control weakness requires management review'}
async function addFindingFromQuestion(id){let q=state.questions.find(x=>x.id===id);let title=suggestTitle(q);if(!state.findings.some(f=>f.title===title)){let finding={id:uid(),title,category:q.domain,priority:(q.domain.includes('Identity')||q.domain.includes('Backup')||state.client.criticality==='Very High')?'Critical':'High',observation:`The assessment identified weakness for: ${q.question}`,risk:'This weakness may increase the likelihood or impact of a security incident.',impact:'Potential business interruption, unauthorized access, regulatory exposure or increased remediation cost.',recommendation:'Define accountable owner, implement remediation plan, collect evidence and review effectiveness.',owner:'To be assigned',status:'Draft',roadmap:'31–90 days',evidence:q.evidence,confidence:q.confidence,mapping:q.mapping};state.findings.push(finding);await logAction({action:'finding.created',entityType:'finding',entityId:finding.id,summary:`Finding created: ${finding.title}`});}q.flag=false;save();await syncRisksFromAssessment();toast('Finding added');render()}
function nextQuestion(){let ds=[...new Set(state.questions.map(q=>q.domain))];let qs=state.questions.filter(q=>q.domain===ds[state.currentDomain]); if(state.currentQuestion<qs.length-1)state.currentQuestion++; else if(state.currentDomain<ds.length-1){state.currentDomain++;state.currentQuestion=0}else{state.currentStep=3} save();render()}
function prevQuestion(){if(state.currentQuestion>0)state.currentQuestion--; else if(state.currentDomain>0){state.currentDomain--;let ds=[...new Set(state.questions.map(q=>q.domain))];state.currentQuestion=state.questions.filter(q=>q.domain===ds[state.currentDomain]).length-1} save();render()}
function suggestedFindings(){let questionSuggestions=state.questions.filter(q=>q.flag).map(q=>({type:'question',q,title:suggestTitle(q)})).filter(s=>!state.findings.some(f=>f.title===s.title));let gapSuggestions=ComplianceEngine.suggestFindingsFromGaps(ComplianceEngine.evaluateAll(state).gaps).filter(s=>!state.findings.some(f=>f.gapId===s.gapId||f.title===s.title)).slice(0,8).map(f=>({type:'gap',finding:f,title:f.title}));return [...questionSuggestions,...gapSuggestions]}
async function acceptGapFinding(id){let s=ComplianceEngine.suggestFindingsFromGaps(ComplianceEngine.evaluateAll(state).gaps).find(f=>f.id===id);if(s&&!state.findings.some(f=>f.gapId===s.gapId)){let finding={...s,id:uid(),status:'Draft'};state.findings.push(finding);save();await logAction({action:'finding.created',entityType:'finding',entityId:finding.id,summary:`Framework gap finding created: ${finding.title}`});await syncRisksFromAssessment();toast('Framework gap finding added');render()}}
function dismissGapFinding(id){state.dismissedGapFindings=state.dismissedGapFindings||[];state.dismissedGapFindings.push(id);save();render()}
function findingsReview(){let sug=suggestedFindings().filter(s=>s.type!=='gap'||!(state.dismissedGapFindings||[]).includes(s.finding.id));return `<div class="section-title"><div><h2>Step 4: Review Findings</h2><p>Review suggested findings before they enter the report.</p></div><span class="badge green">${state.findings.length} confirmed/in review</span></div>${sug.length?`<div class="grid">${sug.map(s=>s.type==='gap'?`<div class="card"><span class="badge high">Source: Framework gap</span><h3>${esc(s.finding.title)}</h3><p class="muted">${esc(s.finding.observation)}</p><p class="small"><b>Mapped controls:</b> ${esc((s.finding.frameworkMapping||[]).join(', '))}</p><div class="actions"><button class="btn primary" onclick="acceptGapFinding('${s.finding.id}')">Accept</button><button class="btn" onclick="acceptGapFinding('${s.finding.id}');state.findings[state.findings.length-1].status='Accepted risk';save();render()">Mark as accepted risk</button><button class="btn" onclick="dismissGapFinding('${s.finding.id}')">Dismiss</button></div></div>`:`<div class="card"><span class="badge high">Suggested</span><h3>${esc(s.title)}</h3><p class="muted">Based on: ${esc(s.q.question)}</p><p class="small">${esc(s.q.mapping)}</p><div class="actions"><button class="btn primary" onclick="addFindingFromQuestion('${s.q.id}')">Accept</button><button class="btn" onclick="state.questions.find(q=>q.id==='${s.q.id}').flag=false;save();render()">Dismiss</button></div></div>`).join('')}</div>`:`<div class="empty">No pending suggested findings. You can continue to Risk & Roadmap.</div>`}<h3 style="margin-top:24px">Confirmed findings</h3><div class="grid">${state.findings.map(f=>findingCard(f)).join('')}</div>${footer('prevStep()','Generate risks and roadmap','generateRisksRoadmap();state.currentStep=4;save();render()')}`}
function findingCard(f){return `<div class="card"><div class="section-title"><div><h3>${esc(f.title)}</h3><p>${esc(f.category)} · ${esc(f.status)}</p></div>${priorityBadge(f.priority)}</div>${f.source?`<p class="small"><b>Source:</b> ${esc(f.source)} · <b>Mapped controls:</b> ${esc((f.frameworkMapping||[]).join(', '))}</p>`:''}<div class="grid grid-2"><div><label>Observation</label><textarea class="field" onchange="updateFinding('${f.id}','observation',this.value)">${esc(f.observation)}</textarea><label>Business impact</label><textarea class="field" onchange="updateFinding('${f.id}','impact',this.value)">${esc(f.impact)}</textarea></div><div><label>Recommendation</label><textarea class="field" onchange="updateFinding('${f.id}','recommendation',this.value)">${esc(f.recommendation)}</textarea><label>Owner</label><input class="field" value="${esc(f.owner)}" onchange="updateFinding('${f.id}','owner',this.value)"><label>Priority</label><select class="field" onchange="updateFinding('${f.id}','priority',this.value)">${['Critical','High','Medium','Low','Informational'].map(p=>`<option ${f.priority===p?'selected':''}>${p}</option>`).join('')}</select></div></div></div>`}
async function updateFinding(id,k,v){let f=state.findings.find(x=>x.id===id);let oldValue=f[k];f[k]=v;save();await logAction({action:k==='status'?'finding.status.changed':'finding.updated',entityType:'finding',entityId:id,summary:`Finding ${k} changed`,details:{field:k,oldValue,newValue:v}});await syncRisksFromAssessment()}
async function generateRisksRoadmap(){await syncRisksFromAssessment();state.risks=state.riskRegister.risks.filter(r=>!r.deleted&&r.status!=='Closed').map(r=>({id:r.id,findingId:r.sourceType==='finding'?r.sourceId:null,title:r.title,description:r.description,likelihood:r.likelihood||1,impact:r.impact||1,rating:r.riskLevel,owner:r.owner,treatment:r.treatment,plan:r.mitigationPlan,due:r.dueDate||'',status:r.status,frameworkImpact:r.controlId||'No mapped framework impact'}));state.roadmap=state.risks.filter(r=>['High','Critical'].includes(r.rating)).map(r=>({id:uid(),findingId:r.findingId,title:r.plan?`Remediate: ${r.title}`:r.title,phase:r.rating==='Critical'?'0–30 days':'31–90 days',priority:r.rating,owner:r.owner||'To be assigned',status:'Planned',desc:r.plan,frameworkImpact:r.frameworkImpact}));state.audit.push({id:uid(),timestamp:now(),action:'Risks and roadmap generated',entity:'assessment'});save();await logAction({action:'risk.score.recalculated',entityType:'risk_register',entityId:state.client.id,summary:'Risks and roadmap generated from risk register'});toast('Risks and roadmap generated')}
function riskTitle(f){return f.title.includes('MFA')?'Compromise of privileged accounts due to incomplete MFA enforcement':f.title.includes('Restore')?'Business interruption due to unproven restore capability':'Security risk caused by '+f.category+' weakness'}
function actionTitle(f){return f.title.includes('MFA')?'Enforce MFA for all privileged accounts':f.title.includes('Restore')?'Perform restore test for critical systems':'Remediate: '+f.title}
function riskRoadmap(){if(!state.risks.length)generateRisksRoadmap();return `<div class="section-title"><div><h2>Step 5: Risk & Roadmap</h2><p>Review management risks and remediation actions generated from findings.</p></div><button class="btn" onclick="generateRisksRoadmap();render()">Regenerate</button></div><div class="grid grid-2"><div class="card"><h3>Risk register</h3>${state.risks.map(r=>`<div class="card"><div class="section-title"><div><h3>${esc(r.title)}</h3><p>Score ${r.likelihood*r.impact} · ${esc(r.treatment)}</p></div>${priorityBadge(r.rating)}</div><p class="small"><b>Framework impact:</b> ${esc(r.frameworkImpact||'No mapped framework impact')}</p><label>Owner</label><input class="field" value="${esc(r.owner)}" onchange="updateRisk('${r.id}','owner',this.value)"><label>Treatment plan</label><textarea class="field" onchange="updateRisk('${r.id}','plan',this.value)">${esc(r.plan)}</textarea></div>`).join('')}</div><div class="card"><h3>Roadmap</h3><div class="timeline">${['0–30 days','31–90 days','3–6 months','6–12 months'].map(p=>`<div class="lane"><h4>${p}</h4>${state.roadmap.filter(x=>x.phase===p).map(x=>`<div class="roaditem"><b>${esc(x.title)}</b><p class="small">${esc(x.owner)}</p><p class="small">${esc(x.frameworkImpact||'')}</p><select class="field" onchange="updateRoadmap('${x.id}','phase',this.value)">${['0–30 days','31–90 days','3–6 months','6–12 months'].map(o=>`<option ${x.phase===o?'selected':''}>${o}</option>`).join('')}</select></div>`).join('')||'<p class="small">No actions</p>'}</div>`).join('')}</div></div></div>${footer('prevStep()','Continue to report','nextStep()')}`}
function updateRisk(id,k,v){let r=state.risks.find(x=>x.id===id);r[k]=v;save()}
function updateRoadmap(id,k,v){let r=state.roadmap.find(x=>x.id===id);r[k]=v;save();render()}
function frameworkReadinessCards(){let engine=ComplianceEngine.evaluateAll(state);let reportOnly=state.assessment.frameworks.filter(id=>state.assessment.frameworkModes[id]==='Report Only').map(id=>ComplianceEngine.frameworkById(id)).filter(Boolean);return `<div class="grid grid-3">${engine.summaries.map(summary=>{let f=ComplianceEngine.frameworkById(summary.frameworkId);let mode=state.assessment.frameworkModes[summary.frameworkId]||'Supporting';return `<div class="card"><span class="badge green">${esc(mode)}</span><h3>${esc(f.name)}</h3><div class="metric">${summary.readinessScore}%</div><p class="small">Reviewed controls: ${summary.reviewedControls} / ${summary.totalControls}</p><p class="small">Implemented ${summary.implemented} · Partial ${summary.partiallyImplemented} · Not implemented ${summary.notImplemented} · Unknown ${summary.unknown} · Evidence missing ${summary.evidenceMissing}</p></div>`}).join('')}${reportOnly.map(f=>`<div class="card"><span class="badge">Report Only</span><h3>${esc(f.name)}</h3><p class="muted">Included in mapping appendix only. It does not generate additional questions or readiness coverage.</p></div>`).join('')}</div>`}
function report(){return `<div class="section-title"><div><h2>Step 6: Report</h2><p>Preview the report, check missing items and export.</p></div><span class="badge green">${reportReadiness()}% ready</span></div><h3>Framework Readiness</h3>${frameworkReadinessCards()}<div class="grid grid-3" style="margin-top:16px"><div class="card"><h3>Readiness</h3><div class="metric">${reportReadiness()}%</div><div class="progress"><div class="bar" style="width:${reportReadiness()}%"></div></div></div><div class="card"><h3>Missing Evidence</h3><div class="metric">${state.questions.filter(q=>q.evidence==='Missing').length}</div><p class="muted">Questions marked as missing evidence.</p></div><div class="card"><h3>Report Types</h3><div class="pillrow"><span class="badge green">Executive</span><span class="badge">Technical</span><span class="badge">Full</span><span class="badge">Board</span></div></div></div><div class="split" style="margin-top:16px"><div class="report" id="reportDoc">${reportHtml()}</div><div class="card"><h3>Export</h3><p class="muted">For alpha testing, PDF export uses browser print. Choose “Save as PDF”.</p><button class="btn primary" style="width:100%" onclick="window.print()">Print / Save as PDF</button><button class="btn" style="width:100%;margin-top:10px" onclick="exportProject()">Export project backup</button><button class="btn" style="width:100%;margin-top:10px" onclick="downloadReportHtml()">Download HTML report</button></div></div>${footer('prevStep()','Finish assessment','toast(\'Alpha assessment complete\')')}`}
function reportHtml(){let engine=ComplianceEngine.evaluateAll(state);let frameworkSections=engine.summaries.map(summary=>ComplianceEngine.generateFrameworkReportSection({framework:ComplianceEngine.frameworkById(summary.frameworkId),coverage:summary,evaluations:summary.evaluations,gaps:engine.gaps})).join('');let appendix=state.questions.map(q=>{let controls=ComplianceEngine.getControlsForQuestion(q.complianceQuestionId,state.assessment.frameworks).slice(0,8).map(item=>`${item.framework.shortName} ${item.control.controlCode}`).join(', ');return `<tr><td>${esc(q.question)}</td><td>${esc(q.answer)}</td><td>${q.score??'—'}</td><td>${esc(q.evidence)}</td><td>${esc(controls)}</td></tr>`}).join('');return `<h1>${esc(state.assessment.name)}</h1><p><b>Client:</b> ${esc(state.client.name)} · <b>Industry:</b> ${esc(state.client.industry)} · <b>Criticality:</b> ${esc(state.client.criticality)}</p><h2>Executive Summary</h2><p>The assessment indicates readiness patterns across selected frameworks. Results should be reviewed by qualified professionals before formal audit, legal, regulatory, or certification conclusions.</p><h2>Scope</h2><p><b>In scope:</b> ${esc(state.scope.areas.join(', '))}</p><p><b>Critical systems:</b> ${esc(state.client.systems.join(', '))}</p>${frameworkSections}<h2>Top Findings</h2><table><tr><th>Finding</th><th>Priority</th><th>Owner</th></tr>${state.findings.map(f=>`<tr><td>${esc(f.title)}</td><td>${esc(f.priority)}</td><td>${esc(f.owner)}</td></tr>`).join('')}</table><h2>Risk Register</h2><table><tr><th>Risk</th><th>Rating</th><th>Treatment</th></tr>${state.risks.map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.rating)}</td><td>${esc(r.treatment)}</td></tr>`).join('')}</table><h2>Roadmap</h2>${['0–30 days','31–90 days','3–6 months','6–12 months'].map(p=>`<h3>${p}</h3><ul>${state.roadmap.filter(x=>x.phase===p).map(x=>`<li>${esc(x.title)} - ${esc(x.owner)}</li>`).join('')||'<li>No actions assigned.</li>'}</ul>`).join('')}<h2>Framework Mapping Appendix</h2><table><tr><th>Question</th><th>Answer</th><th>Score</th><th>Evidence</th><th>Mapped Controls</th></tr>${appendix}</table><h2>Assumptions & Limitations</h2><p>${esc(state.scope.assumptions)}</p><p>${esc(state.scope.limitations)}</p><p>${esc(ComplianceData.disclaimer)}</p>`}
function overview(){let byDomain=domains.map(d=>{let qs=state.questions.filter(q=>q.domain===d);let scores=qs.map(q=>q.score).filter(x=>x!==null);let avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'—';return {d,avg,done:qs.filter(q=>q.answer!=='Unknown'||q.score!==null).length,total:qs.length}});let engine=ComplianceEngine.evaluateAll(state);return appShell(`<div class="section-title"><div><h2>Assessment Overview</h2><p>A quick management view. The guided flow remains the primary working mode.</p></div></div><div class="grid grid-4">${metric('Maturity','2.2 / 5','Based on test data')}${metric('Progress',completedQuestions()+' / '+state.questions.length,'Questions completed')}${metric('Potential gaps',engine.gaps.length,'Framework-derived')}${metric('Readiness',Math.round(engine.summaries.reduce((a,b)=>a+b.readinessScore,0)/Math.max(engine.summaries.length,1))+'%','Average framework score')}</div><h3 style="margin-top:18px">Framework coverage</h3>${frameworkReadinessCards()}<div class="grid grid-2" style="margin-top:16px"><div class="card"><h3>Maturity by domain</h3><table class="table"><tr><th>Domain</th><th>Score</th><th>Progress</th></tr>${byDomain.map(x=>`<tr><td>${x.d}</td><td>${x.avg}</td><td>${x.done}/${x.total}</td></tr>`).join('')}</table></div><div class="card"><h3>Top framework gaps</h3>${engine.gaps.slice(0,8).map(g=>`<div class="roaditem"><b>${esc(g.title)}</b><p>${priorityBadge(g.severity)} ${esc(g.status)}</p></div>`).join('')||'<div class="empty">Answer questions to generate framework gaps.</div>'}</div></div>`)}
function riskSummary(){
 const risks=(state.riskRegister?.risks||[]).filter(r=>!r.deleted);
 return {total:risks.length,open:risks.filter(r=>r.status!=='Closed').length,closed:risks.filter(r=>r.status==='Closed').length,low:risks.filter(r=>r.riskLevel==='Low').length,medium:risks.filter(r=>r.riskLevel==='Medium').length,high:risks.filter(r=>r.riskLevel==='High').length,critical:risks.filter(r=>r.riskLevel==='Critical').length};
}
function filteredRisks(){
 let risks=[...(state.riskRegister?.risks||[])];
 if(!riskView.showDeleted)risks=risks.filter(r=>!r.deleted);
 if(riskView.search){let s=riskView.search.toLowerCase();risks=risks.filter(r=>[r.id,r.title,r.description,r.category,r.owner,r.notes,r.controlId].join(' ').toLowerCase().includes(s))}
 if(riskView.level)risks=risks.filter(r=>r.riskLevel===riskView.level);
 if(riskView.status)risks=risks.filter(r=>r.status===riskView.status);
 risks.sort((a,b)=>String(b[riskView.sort]??'').localeCompare(String(a[riskView.sort]??'')));
 return risks;
}
function riskCell(r,field,type='text'){
 if(type==='selectScore')return `<select class="table-field" onchange="updateRegisterRisk('${r.id}','${field}',this.value)"><option value=""></option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${r[field]===n?'selected':''}>${n}</option>`).join('')}</select>`;
 if(type==='selectTreatment')return `<select class="table-field" onchange="updateRegisterRisk('${r.id}','${field}',this.value)">${['Mitigate','Accept','Transfer','Avoid','Monitor'].map(x=>`<option ${r[field]===x?'selected':''}>${x}</option>`).join('')}</select>`;
 if(type==='selectStatus')return `<select class="table-field" onchange="updateRegisterRisk('${r.id}','${field}',this.value)">${['Open','In Progress','Accepted','Closed'].map(x=>`<option ${r[field]===x?'selected':''}>${x}</option>`).join('')}</select>`;
 if(type==='textarea')return `<textarea class="table-field table-area" onchange="updateRegisterRisk('${r.id}','${field}',this.value)">${esc(r[field])}</textarea>`;
 return `<input class="table-field" value="${esc(r[field])}" onchange="updateRegisterRisk('${r.id}','${field}',this.value)">`;
}
function riskRegisterPage(){
 const summary=riskSummary();
 const risks=filteredRisks();
 return appShell(`<div class="section-title"><div><h2>Risk Register</h2><p>Automatically generated from weak assessment answers, findings and evidence gaps. Users can edit suggested values like a simple spreadsheet.</p></div><div class="actions"><button class="btn" onclick="syncRisksFromAssessment().then(()=>render())">Sync from assessment</button><button class="btn primary" onclick="addManualRisk()">Add Risk</button><button class="btn" onclick="exportRiskRegisterPdf()">Export Risk Register as PDF</button></div></div><div class="grid grid-4">${metric('Total risks',summary.total,'Active entries')}${metric('Open',summary.open,'Not closed')}${metric('High',summary.high,'High risks')}${metric('Critical',summary.critical,'Critical risks')}</div><div class="card" style="margin-top:16px"><div class="risk-toolbar"><input class="field" placeholder="Search risks" value="${esc(riskView.search)}" oninput="riskView.search=this.value;render()"><select class="field" onchange="riskView.level=this.value;render()"><option value="">All levels</option>${['Low','Medium','High','Critical'].map(x=>`<option ${riskView.level===x?'selected':''}>${x}</option>`).join('')}</select><select class="field" onchange="riskView.status=this.value;render()"><option value="">All status</option>${['Open','In Progress','Accepted','Closed'].map(x=>`<option ${riskView.status===x?'selected':''}>${x}</option>`).join('')}</select><label class="checkline"><input type="checkbox" ${riskView.showDeleted?'checked':''} onchange="riskView.showDeleted=this.checked;render()"> Show deleted</label></div><div class="table-wrap"><table class="table risk-table"><tr>${['Risk ID','Title','Description','Category','Control','Source','Likelihood','Impact','Score','Level','Treatment','Owner','Status','Due Date','Mitigation Plan','Residual L','Residual I','Residual Score','Residual Level','Notes','Auto','Edited','Updated','Actions'].map((h,i)=>`<th onclick="riskView.sort='${['id','title','description','category','controlId','sourceType','likelihood','impact','inherentRiskScore','riskLevel','treatment','owner','status','dueDate','mitigationPlan','residualLikelihood','residualImpact','residualRiskScore','residualRiskLevel','notes','createdAutomatically','manuallyEdited','updatedAt',''][i]}';render()">${h}</th>`).join('')}</tr>${risks.map(r=>`<tr class="${r.deleted?'deleted-row':''}"><td>${esc(r.id)}</td><td>${riskCell(r,'title')}</td><td>${riskCell(r,'description','textarea')}</td><td>${riskCell(r,'category')}</td><td>${esc(r.controlId||'')}</td><td>${esc(r.sourceType)} ${esc(r.sourceId||'')}</td><td>${riskCell(r,'likelihood','selectScore')}</td><td>${riskCell(r,'impact','selectScore')}</td><td>${r.inherentRiskScore??''}</td><td>${priorityBadge(r.riskLevel)}</td><td>${riskCell(r,'treatment','selectTreatment')}</td><td>${riskCell(r,'owner')}</td><td>${riskCell(r,'status','selectStatus')}</td><td><input class="table-field" type="date" value="${esc(r.dueDate)}" onchange="updateRegisterRisk('${r.id}','dueDate',this.value)"></td><td>${riskCell(r,'mitigationPlan','textarea')}</td><td>${riskCell(r,'residualLikelihood','selectScore')}</td><td>${riskCell(r,'residualImpact','selectScore')}</td><td>${r.residualRiskScore??''}</td><td>${esc(r.residualRiskLevel||'')}</td><td>${riskCell(r,'notes','textarea')}</td><td>${r.createdAutomatically?'Yes':'No'}</td><td>${r.manuallyEdited?'Yes':'No'}</td><td>${esc((r.updatedAt||'').slice(0,19))}</td><td>${r.deleted?`<button class="btn" onclick="restoreRegisterRisk('${r.id}')">Restore</button>`:`<button class="btn danger" onclick="deleteRegisterRisk('${r.id}')">Delete</button>`}</td></tr>`).join('')}</table></div></div>`)}
function filteredActivityLog(){
 let rows=[...(state.activityLog||[])].sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
 if(logView.search){let s=logView.search.toLowerCase();rows=rows.filter(l=>[l.action,l.entityType,l.entityId,l.summary,JSON.stringify(l.details||{})].join(' ').toLowerCase().includes(s))}
 if(logView.action)rows=rows.filter(l=>l.action===logView.action);
 if(logView.entityType)rows=rows.filter(l=>l.entityType===logView.entityType);
 if(logView.dateFrom)rows=rows.filter(l=>l.timestamp.slice(0,10)>=logView.dateFrom);
 if(logView.dateTo)rows=rows.filter(l=>l.timestamp.slice(0,10)<=logView.dateTo);
 return rows;
}
function activityLogPage(){
 const rows=filteredActivityLog();
 const actions=[...new Set((state.activityLog||[]).map(l=>l.action))].sort();
 const entities=[...new Set((state.activityLog||[]).map(l=>l.entityType).filter(Boolean))].sort();
 return appShell(`<div class="section-title"><div><h2>Activity Log</h2><p>Read-only, append-only activity log with hash-chain integrity verification. Local files are tamper-evident, not tamper-proof.</p></div><div class="actions"><button class="btn" onclick="verifyActivityLogIntegrity().then(r=>{state.logIntegrity=r;render()})">Verify integrity</button><button class="btn" onclick="exportActivityLogPdf()">Export Activity Log as PDF</button></div></div><div class="card"><p><b>Integrity status:</b> ${state.logIntegrity?.valid?'Verified':'Warning'} · ${esc(state.logIntegrity?.message||'Not checked')} · ${esc(state.logIntegrity?.checkedAt||'')}</p><p class="small">Activity logs cannot be edited in Audity. Audity verifies log integrity and warns if log files appear to have been modified outside the app.</p></div><div class="card" style="margin-top:16px"><div class="risk-toolbar"><input class="field" placeholder="Search log" value="${esc(logView.search)}" oninput="logView.search=this.value;render()"><select class="field" onchange="logView.action=this.value;render()"><option value="">All actions</option>${actions.map(x=>`<option ${logView.action===x?'selected':''}>${esc(x)}</option>`).join('')}</select><select class="field" onchange="logView.entityType=this.value;render()"><option value="">All entities</option>${entities.map(x=>`<option ${logView.entityType===x?'selected':''}>${esc(x)}</option>`).join('')}</select><input class="field" type="date" value="${esc(logView.dateFrom)}" onchange="logView.dateFrom=this.value;render()"><input class="field" type="date" value="${esc(logView.dateTo)}" onchange="logView.dateTo=this.value;render()"></div><div class="table-wrap"><table class="table"><tr><th>Timestamp</th><th>Action</th><th>Entity Type</th><th>Entity ID</th><th>Summary</th><th>Entry Hash</th></tr>${rows.map(l=>`<tr><td>${esc(l.timestamp)}</td><td>${esc(l.action)}</td><td>${esc(l.entityType)}</td><td>${esc(l.entityId)}</td><td>${esc(l.summary)}<details class="details"><summary>Details</summary><pre>${esc(JSON.stringify(l.details||{},null,2))}</pre></details></td><td class="small">${esc((l.entryHash||'').slice(0,16))}...</td></tr>`).join('')}</table></div></div>`)}
function library(){let selected=ComplianceData.frameworks.find(f=>f.id===state.libraryFrameworkId)||ComplianceData.frameworks[0];let controls=ComplianceData.controls.filter(c=>c.frameworkId===selected.id);let domainsForFramework=ComplianceData.domains.filter(d=>d.frameworkId===selected.id);let mode=state.assessment.frameworkModes[selected.id]||'Not selected';let selectedForAssessment=state.assessment.frameworks.includes(selected.id);return appShell(`<div class="section-title"><div><h2>Framework Library</h2><p>Local framework examples for alpha testing. Full authoritative catalogs should be curated before production use.</p></div></div><div class="card"><p class="muted">${esc(ComplianceData.disclaimer)}</p></div><div class="grid grid-3" style="margin-top:16px">${ComplianceData.frameworks.map(f=>{let c=ComplianceData.controls.filter(x=>x.frameworkId===f.id).length;let d=ComplianceData.domains.filter(x=>x.frameworkId===f.id).length;let enabled=state.assessment.frameworks.includes(f.id);let usage=state.assessment.frameworkModes[f.id]||'Not selected';return `<div class="card" onclick="state.libraryFrameworkId='${f.id}';save();render()"><span class="badge ${enabled?'green':''}">${enabled?'Enabled':'Disabled'}</span><span class="badge">${esc(usage)}</span><h3>${esc(f.name)}</h3><p class="muted">${esc(f.version)} · ${esc(f.type)} · ${esc(f.jurisdiction||'Global')}</p><p class="small">${d} domains · ${c} controls · ${esc(f.alphaStatus)} alpha</p></div>`}).join('')}</div><div class="card" style="margin-top:18px"><div class="section-title"><div><h3>${esc(selected.name)} detail</h3><p class="muted">${esc(selected.description)}</p></div><div><span class="badge ${selectedForAssessment?'green':''}">${selectedForAssessment?'Enabled':'Disabled'}</span><span class="badge">${esc(mode)}</span></div></div><p class="small"><b>Coverage usage:</b> ${mode==='Report Only'?'Mappings appear in the report appendix only. Readiness coverage and question generation are skipped.':selectedForAssessment?'Used according to the selected assessment usage mode.':'Not used in the current assessment.'}</p><h4>Domains / Sections</h4><div class="pillrow">${domainsForFramework.map(d=>`<span class="badge">${esc(d.title)}</span>`).join('')}</div><h4>Controls</h4><table class="table"><tr><th>Control Code</th><th>Title</th><th>Domain</th><th>Applicability</th><th>Mapped Questions</th><th>Evidence Examples</th><th>Tags</th></tr>${controls.map(c=>{let domain=domainsForFramework.find(d=>d.id===c.domainId);let maps=ComplianceData.mappings.filter(m=>m.frameworkControlId===c.id);return `<tr><td>${esc(c.controlCode)}</td><td>${esc(c.title)}</td><td>${esc(domain?.title||'')}</td><td>${esc(c.applicability)}</td><td>${maps.length}</td><td>${esc(c.evidenceExamples.slice(0,2).join(', '))}</td><td>${esc(c.tags.slice(0,4).join(', '))}</td></tr>`}).join('')}</table><h4>Mapping View</h4><table class="table"><tr><th>Assessment Question</th><th>Mapped Framework Controls</th><th>Mapping Strength</th><th>Rationale</th></tr>${ComplianceData.mappings.filter(m=>controls.some(c=>c.id===m.frameworkControlId)).slice(0,80).map(m=>{let q=ComplianceData.questionDefinitions.find(q=>q.id===m.questionId);let c=ComplianceData.controls.find(c=>c.id===m.frameworkControlId);return `<tr><td>${esc(q?.question||'')}</td><td>${esc(c?.controlCode||'')}</td><td>${esc(m.mappingStrength)}</td><td>${esc(m.rationale)}</td></tr>`}).join('')}</table></div>`)}
function advanced(){return appShell(`<div class="section-title"><div><h2>Advanced Data</h2><p>For power users. The guided flow hides this complexity during normal work.</p></div></div><div class="grid grid-2"><div class="card"><h3>Documents & Evidence</h3><table class="table"><tr><th>Name</th><th>Status</th><th>Owner</th></tr>${state.documents.map(d=>`<tr><td>${esc(d.name)}</td><td>${esc(d.status)}</td><td>${esc(d.owner)}</td></tr>`).join('')}</table></div><div class="card"><h3>Stakeholders</h3><table class="table"><tr><th>Name</th><th>Role</th><th>Email</th></tr>${state.stakeholders.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.email)}</td></tr>`).join('')}</table></div><div class="card"><h3>Audit Log</h3><table class="table"><tr><th>Time</th><th>Action</th></tr>${state.audit.map(a=>`<tr><td>${esc(a.timestamp.slice(0,19))}</td><td>${esc(a.action)}</td></tr>`).join('')}</table></div><div class="card"><h3>Raw backup</h3><textarea class="field" style="height:300px">${esc(JSON.stringify(state,null,2))}</textarea></div></div>`)}
function settings(){return appShell(`<div class="section-title"><div><h2>Settings & Backup</h2><p>Manage the selected local project file. Audity does not use browser storage as a productive data fallback.</p></div></div><div class="grid grid-2"><div class="card"><h3>Appearance</h3><p class="muted">Choose the interface theme. The setting is saved inside the selected project file.</p><div class="theme-toggle"><button class="btn theme-option ${state.theme==='dark'?'primary':''}" onclick="setTheme('dark')">Dark mode</button><button class="btn theme-option ${state.theme==='light'?'primary':''}" onclick="setTheme('light')">Light mode</button></div></div><div class="card"><h3>Project file</h3><p class="muted">Audity writes assessment data to ${PROJECT_FILE_NAME} in the folder you selected.</p><button class="btn primary" onclick="chooseProjectFolder()">Change project folder</button><button class="btn" style="margin-left:8px" onclick="exportProject()">Export copy</button><label class="btn" style="margin-left:8px">Import into current file<input type="file" accept=".cisoassess,.json" style="display:none" onchange="importProject(event)"></label></div><div class="card"><h3>Reset project file</h3><p class="muted">This restores the original test data and overwrites the selected local project file.</p><button class="btn danger" onclick="if(confirm('Reset the selected project file?')){state=defaultState();save();applyTheme();render()}">Reset test data</button></div></div>`)}
function footer(back,next,nextFn){return `<div class="footer-actions"><div>${back?`<button class="btn" onclick="${back}">Back</button>`:''}</div><button class="btn primary" onclick="${nextFn}">${next}</button></div>`}
function nextStep(){state.currentStep=Math.min(steps.length-1,state.currentStep+1);save();render()} function prevStep(){state.currentStep=Math.max(0,state.currentStep-1);save();render()}
async function exportProject(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});downloadBlob(blob,`${state.client.name.replace(/\W+/g,'_')}_${new Date().toISOString().slice(0,10)}.cisoassess`);await logAction({action:'backup.created',entityType:'project',entityId:state.assessment.id,summary:'Project backup exported'});toast('Project backup exported')}
function importProject(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=async()=>{try{state=migrateAlphaDataToComplianceEngine(JSON.parse(r.result));save();await setupProjectDataFiles();await logAction({action:'backup.restored',entityType:'project',entityId:state.assessment.id,summary:'Project backup imported'});render();toast('Project imported into selected folder')}catch(err){alert('Import failed: invalid file')}};r.readAsText(file)}
async function downloadReportHtml(){const name='assessment-report.html';const blob=new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>Report</title></head><body>${reportHtml()}</body></html>`],{type:'text/html'});await saveReportBlob(blob,name);await logAction({action:'report.exported.html',entityType:'report',entityId:state.assessment.id,summary:'HTML report exported'});}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
function pdfEscape(s){return String(s??'').replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E]/g,'-')}
function wrapText(text,width=92){let words=String(text??'').replace(/\s+/g,' ').split(' '),lines=[],line='';for(const w of words){if((line+' '+w).trim().length>width){lines.push(line);line=w}else line=(line+' '+w).trim()}if(line)lines.push(line);return lines}
function textPdf(title,lines){
 const pageSize=54;
 const pages=[];
 for(let i=0;i<lines.length;i+=pageSize)pages.push(lines.slice(i,i+pageSize));
 let objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`];
 pages.forEach((page,i)=>{let content=[`BT /F1 14 Tf 40 790 Td (${pdfEscape(title)}) Tj ET`];page.forEach((line,idx)=>content.push(`BT /F1 8 Tf 40 ${765-idx*13} Td (${pdfEscape(line)}) Tj ET`));let stream=content.join('\n');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3+pages.length*2} 0 R >> >> /Contents ${4+i*2} 0 R >>`);objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)});
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 let pdf='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});
 let xref=pdf.length;
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 offsets.slice(1).forEach(o=>pdf+=String(o).padStart(10,'0')+' 00000 n \n');
 pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([pdf],{type:'application/pdf'});
}
async function saveReportBlob(blob,name){
 if(projectDirectoryHandle){
  const dir=await getDir(projectDirectoryHandle,REPORTS_DIR);
  const handle=await dir.getFileHandle(name,{create:true});
  const writable=await handle.createWritable();
  await writable.write(blob);
  await writable.close();
 }
 downloadBlob(blob,name);
}
async function exportRiskRegisterPdf(){
 const summary=riskSummary();
 const risks=(state.riskRegister?.risks||[]).filter(r=>!r.deleted);
 const lines=[`Customer: ${state.client.name}`,`Customer ID: ${state.client.id}`,`Assessment: ${state.assessment.name}`,`Export date: ${now()}`,'',`Summary: total ${summary.total}, open ${summary.open}, closed ${summary.closed}, low ${summary.low}, medium ${summary.medium}, high ${summary.high}, critical ${summary.critical}`,'','Risk Register'];
 risks.forEach(r=>{lines.push(...wrapText(`${r.id} | ${r.riskLevel} ${r.inherentRiskScore||''} | ${r.status} | ${r.title} | Owner: ${r.owner||'-'} | Treatment: ${r.treatment}`));lines.push(...wrapText(`Mitigation: ${r.mitigationPlan||'-'}`));lines.push('')});
 const name=`risk_register_${state.client.id}_${now().replace(/[:.]/g,'-')}.pdf`;
 await saveReportBlob(textPdf('Audity Risk Register',lines),name);
 await logAction({action:'risk.exported.pdf',entityType:'risk_register',entityId:state.client.id,summary:`Risk register exported as PDF: ${name}`});
 toast('Risk register PDF exported');
}
async function exportActivityLogPdf(){
 const rows=filteredActivityLog();
 const lines=[`Customer: ${state.client.name}`,`Customer ID: ${state.client.id}`,`Export date: ${now()}`,`Log Integrity Status: ${state.logIntegrity?.valid?'Verified':'Warning'} - ${state.logIntegrity?.message||''}`,'','Activity Log'];
 rows.forEach(l=>{lines.push(...wrapText(`${l.timestamp} | ${l.action} | ${l.entityType} | ${l.entityId} | ${l.summary}`));if(l.details&&Object.keys(l.details).length)lines.push(...wrapText(`Details: ${JSON.stringify(l.details)}`));lines.push('')});
 const name=`activity_log_${state.client.id}_${now().replace(/[:.]/g,'-')}.pdf`;
 await saveReportBlob(textPdf('Audity Activity Log',lines),name);
 await logAction({action:'report.exported.pdf',entityType:'activity_log',entityId:state.client.id,summary:`Activity log exported as PDF: ${name}`});
 toast('Activity log PDF exported');
}
function unsupportedBrowserScreen(){return `<main class="blocking-screen"><section class="blocking-card"><div class="brand blocking-brand"><div class="logo logo-image"><img src="audity-icon.png" alt="Audity logo"></div><div><h1>Audity</h1><p>Project folder mode required</p></div></div><h2>Audity cannot start in this browser.</h2><p>Audity requires the File System Access API so assessment data can be written to a real local project file chosen by the user. This browser does not provide <code>window.showDirectoryPicker</code> in a secure context.</p><div class="grid grid-2"><div class="card"><h3>Use a supported desktop browser</h3><p class="muted">Recommended: Google Chrome. Alternative: Microsoft Edge.</p></div><div class="card"><h3>Not supported</h3><p class="muted">Safari, Firefox, older browsers, mobile browsers, and embedded WebViews without File System Access API.</p></div></div><p class="small">Audity does not switch to IndexedDB or browser-local production storage when project folder mode is unavailable.</p></section></main>`}
function projectFolderScreen(){return `<main class="blocking-screen"><section class="blocking-card"><div class="brand blocking-brand"><div class="logo logo-image"><img src="audity-icon.png" alt="Audity logo"></div><div><h1>Audity</h1><p>Local project file</p></div></div><h2>Choose a project folder to continue.</h2><p>Audity will create or open <code>${PROJECT_FILE_NAME}</code> in the selected folder. All important assessment data is saved to that file instead of productive browser storage.</p><div class="actions"><button class="btn primary" onclick="chooseProjectFolder()">Choose project folder</button></div><p class="small">Select a folder you control, for example a client project folder in Documents or an encrypted local workspace.</p></section></main>`}
function render(){applyTheme();if(!supportsProjectFolderMode()){document.getElementById('app').innerHTML=unsupportedBrowserScreen();return}if(!projectFolderReady){document.getElementById('app').innerHTML=projectFolderScreen();return}const map={home,flow,overview,riskRegister:riskRegisterPage,activityLog:activityLogPage,library,advanced,settings};document.getElementById('app').innerHTML=(map[state.view]||home)()}
render();
