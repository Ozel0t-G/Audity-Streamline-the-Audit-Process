const ComplianceEngine = (() => {
  function uid(prefix){return `${prefix}-${Math.random().toString(36).slice(2,10)}`}
  function now(){return new Date().toISOString()}
  function data(){return window.ComplianceData || ComplianceData}
  function frameworkById(id){return data().frameworks.find(framework => framework.id===id)}
  function controlById(id){return data().controls.find(control => control.id===id)}
  function selectedFrameworkEntries(state){
    const modes = state.assessment?.frameworkModes || {};
    const selected = state.assessment?.frameworks || data().frameworks.map(framework => framework.id);
    return selected.map(frameworkId => ({frameworkId,usageMode:modes[frameworkId] || (frameworkId===selected[0]?'Primary':'Supporting'),selected:true}));
  }
  function getSelectedFrameworks(state){
    const selected = new Set(selectedFrameworkEntries(state).filter(entry => entry.selected).map(entry => entry.frameworkId));
    return data().frameworks.filter(framework => selected.has(framework.id));
  }
  function getQuestionDefinition(questionId){
    return data().questionDefinitions.find(question => question.id===questionId);
  }
  function questionIdForLegacyQuestion(question){
    if(question.complianceQuestionId)return question.complianceQuestionId;
    const byText = data().questionDefinitions.find(def => def.question===question.question);
    if(byText)return byText.id;
    const byDomain = data().questionDefinitions.find(def => def.domain===question.domain);
    return byDomain?.id || data().questionDefinitions[0].id;
  }
  function generateAssessmentQuestions(input){
    const selected = new Set(input.selectedFrameworkIds || []);
    const assessmentType = input.assessmentType || '';
    const inScope = new Set(input.inScopeDomains || []);
    let questions = data().questionDefinitions.filter(question => !inScope.size || inScope.has(question.domain));
    const mappings = data().mappings.filter(mapping => selected.has(controlById(mapping.frameworkControlId)?.frameworkId));
    const mappedQuestionIds = new Set(mappings.map(mapping => mapping.questionId));
    questions = questions.filter(question => mappedQuestionIds.has(question.id) || question.tags.some(tag => ['governance','risk-management','iam','backup','incident-response'].includes(tag)));
    const priorityTags = [];
    if(assessmentType.includes('ISO'))priorityTags.push('governance','risk-management','evidence');
    if(assessmentType.includes('NIS2'))priorityTags.push('governance','risk-management','incident-response','backup','third-party','mfa');
    if(assessmentType.includes('SOC'))priorityTags.push('mitre','logging','detection','incident-response');
    if(assessmentType.includes('Ransomware'))priorityTags.push('iam','mfa','backup','recovery','vulnerability','endpoint','incident-response');
    return questions.sort((a,b) => {
      const aScore = a.tags.filter(tag => priorityTags.includes(tag)).length;
      const bScore = b.tags.filter(tag => priorityTags.includes(tag)).length;
      return bScore - aScore || a.domain.localeCompare(b.domain);
    });
  }
  function getMappingsForQuestion(questionId,frameworkIds){
    const selected = new Set(frameworkIds || data().frameworks.map(framework => framework.id));
    return data().mappings.filter(mapping => mapping.questionId===questionId && selected.has(controlById(mapping.frameworkControlId)?.frameworkId));
  }
  function getControlsForQuestion(questionId,frameworkIds){
    return getMappingsForQuestion(questionId,frameworkIds).map(mapping => ({mapping,control:controlById(mapping.frameworkControlId),framework:frameworkById(controlById(mapping.frameworkControlId)?.frameworkId)})).filter(item => item.control && item.framework);
  }
  function getEvidenceForQuestion(questionId,frameworkIds){
    const evidence = new Map();
    getControlsForQuestion(questionId,frameworkIds).forEach(item => item.control.evidenceExamples.forEach(example => evidence.set(example, example)));
    const definition = getQuestionDefinition(questionId);
    (definition?.defaultEvidenceRequirements || []).forEach(example => evidence.set(example, example));
    return [...evidence.values()];
  }
  function answerToControlAnswer(state,question){
    return {id:`answer-${question.id}`,assessmentId:'local-alpha',questionId:questionIdForLegacyQuestion(question),answerState:question.answer || 'Unknown',maturityScore:question.score ?? null,evidenceStatus:question.evidence || 'Not requested',confidenceLevel:question.confidence || 'Medium',notes:question.notes || ''};
  }
  function evaluateFrameworkControl(input){
    const linkedMappings = input.mappings.filter(mapping => mapping.frameworkControlId===input.frameworkControl.id);
    const linkedQuestionIds = linkedMappings.map(mapping => mapping.questionId);
    const linkedAnswers = input.answers.filter(answer => linkedQuestionIds.includes(answer.questionId));
    if(!linkedAnswers.length){
      return {id:uid('eval'),assessmentId:'local-alpha',frameworkControlId:input.frameworkControl.id,status:'Unknown',maturityScore:null,evidenceStatus:'Not requested',confidenceLevel:'Medium',linkedQuestionIds,linkedAnswerIds:[],rationale:'No linked assessment answer is available for this control.',generatedAt:now()};
    }
    if(linkedAnswers.every(answer => answer.answerState==='Not applicable')){
      return {id:uid('eval'),assessmentId:'local-alpha',frameworkControlId:input.frameworkControl.id,status:'Not applicable',maturityScore:null,evidenceStatus:'Not applicable',confidenceLevel:'Medium',linkedQuestionIds,linkedAnswerIds:linkedAnswers.map(answer => answer.id),rationale:'All linked answers are marked not applicable.',generatedAt:now()};
    }
    const scores = linkedAnswers.map(answer => answer.maturityScore).filter(score => score!==null && score!==undefined);
    const avg = scores.length ? scores.reduce((sum,score)=>sum+score,0)/scores.length : null;
    const hasMissingEvidence = linkedAnswers.some(answer => answer.evidenceStatus==='Missing' || answer.evidenceStatus==='Outdated');
    const hasProvidedEvidence = linkedAnswers.some(answer => answer.evidenceStatus==='Provided' || answer.evidenceStatus==='Reviewed');
    const lowConfidence = linkedAnswers.some(answer => answer.confidenceLevel==='Low');
    let status = 'Unknown';
    if(hasMissingEvidence && (avg===null || avg<=2))status = 'Evidence missing';
    else if(avg!==null && avg>=4 && hasProvidedEvidence)status = 'Implemented';
    else if(avg!==null && avg>=2 && avg<4)status = 'Partially implemented';
    else if(avg!==null && avg<2)status = 'Not implemented';
    else if(avg!==null && avg>=4)status = 'Partially implemented';
    const rationaleParts = [`Derived from ${linkedAnswers.length} linked assessment answer${linkedAnswers.length===1?'':'s'}.`];
    if(avg!==null)rationaleParts.push(`Average maturity score is ${avg.toFixed(1)}.`);
    if(hasMissingEvidence)rationaleParts.push('Evidence is missing or outdated.');
    if(lowConfidence)rationaleParts.push('At least one linked answer has low confidence.');
    return {id:uid('eval'),assessmentId:'local-alpha',frameworkControlId:input.frameworkControl.id,status,maturityScore:avg===null?null:Number(avg.toFixed(1)),evidenceStatus:hasMissingEvidence?'Missing':hasProvidedEvidence?'Provided':'Not requested',confidenceLevel:lowConfidence?'Low':'Medium',linkedQuestionIds,linkedAnswerIds:linkedAnswers.map(answer => answer.id),rationale:rationaleParts.join(' '),generatedAt:now()};
  }
  function evaluateFrameworkCoverage(input){
    const frameworkMappings = input.mappings.filter(mapping => controlById(mapping.frameworkControlId)?.frameworkId===input.frameworkId);
    const evaluations = input.controls.map(control => evaluateFrameworkControl({frameworkControl:control,mappings:frameworkMappings,answers:input.answers}));
    const counts = {implemented:0,partiallyImplemented:0,notImplemented:0,unknown:0,notApplicable:0,evidenceMissing:0};
    evaluations.forEach(evaluation => {
      if(evaluation.status==='Implemented')counts.implemented++;
      if(evaluation.status==='Partially implemented')counts.partiallyImplemented++;
      if(evaluation.status==='Not implemented')counts.notImplemented++;
      if(evaluation.status==='Unknown')counts.unknown++;
      if(evaluation.status==='Not applicable')counts.notApplicable++;
      if(evaluation.status==='Evidence missing')counts.evidenceMissing++;
    });
    const reviewedControls = evaluations.filter(evaluation => evaluation.status!=='Unknown').length;
    const evidenceReady = evaluations.filter(evaluation => ['Provided','Reviewed'].includes(evaluation.evidenceStatus)).length;
    const applicable = Math.max(input.controls.length - counts.notApplicable, 1);
    return {frameworkId:input.frameworkId,assessmentId:input.assessmentId,totalControls:input.controls.length,reviewedControls,implemented:counts.implemented,partiallyImplemented:counts.partiallyImplemented,notImplemented:counts.notImplemented,unknown:counts.unknown,notApplicable:counts.notApplicable,evidenceMissing:counts.evidenceMissing,coveragePercent:Math.round((reviewedControls/Math.max(input.controls.length,1))*100),evidenceCompletenessPercent:Math.round((evidenceReady/Math.max(reviewedControls,1))*100),readinessScore:Math.round(((counts.implemented)+(counts.partiallyImplemented*.5))/applicable*100),evaluations};
  }
  function evaluateAll(state){
    const frameworks = getSelectedFrameworks(state).filter(framework => selectedFrameworkEntries(state).find(entry => entry.frameworkId===framework.id)?.usageMode !== 'Report Only');
    const answers = (state.questions || []).map(question => answerToControlAnswer(state,question));
    const summaries = frameworks.map(framework => evaluateFrameworkCoverage({assessmentId:'local-alpha',frameworkId:framework.id,controls:data().controls.filter(control => control.frameworkId===framework.id),mappings:data().mappings,answers}));
    const evaluations = summaries.flatMap(summary => summary.evaluations);
    const gaps = generateGapAnalysis({assessmentId:'local-alpha',selectedFrameworkIds:frameworks.map(framework => framework.id),evaluations,businessCriticality:state.client?.criticality || 'Medium'});
    return {frameworks,summaries,evaluations,gaps};
  }
  function severityFor(control,evaluation,businessCriticality){
    const criticalTags = ['mfa','backup','recovery','incident-response','business-critical','legal-notification'];
    if(evaluation.status==='Not implemented' && control.tags.some(tag => criticalTags.includes(tag)))return 'Critical';
    if(evaluation.status==='Evidence missing')return 'High';
    if(evaluation.status==='Partially implemented' && control.tags.some(tag => ['iam','vulnerability','logging','third-party'].includes(tag)))return 'High';
    if(evaluation.status==='Unknown' && ['High','Very High'].includes(businessCriticality))return 'Medium';
    return evaluation.status==='Unknown' ? 'Medium' : 'Low';
  }
  function generateGapAnalysis(input){
    return input.evaluations.filter(evaluation => ['Partially implemented','Not implemented','Unknown','Evidence missing'].includes(evaluation.status)).map(evaluation => {
      const control = controlById(evaluation.frameworkControlId);
      const framework = frameworkById(control.frameworkId);
      const severity = severityFor(control,evaluation,input.businessCriticality || 'Medium');
      return {id:`gap-${evaluation.frameworkControlId}`,assessmentId:input.assessmentId,frameworkId:control.frameworkId,frameworkControlId:control.id,title:`${framework.shortName} ${control.controlCode}: ${control.title}`,status:evaluation.status,severity,reason:evaluation.rationale,recommendedAction:`Review and strengthen ${control.title.toLowerCase()} for ${framework.shortName}. Collect evidence and assign an accountable owner.`,evidenceNeeded:control.evidenceExamples,relatedQuestionIds:evaluation.linkedQuestionIds};
    });
  }
  function suggestFindingsFromGaps(gaps){
    return gaps.filter(gap => ['Critical','High'].includes(gap.severity)).map(gap => {
      const control = controlById(gap.frameworkControlId);
      const framework = frameworkById(gap.frameworkId);
      return {id:`finding-${gap.id}`,source:'Framework gap',gapId:gap.id,title:`${control.title} is ${gap.status.toLowerCase()}`,category:control.tags.includes('iam')?'Identity & Access Management':control.tags.includes('backup')?'Backup & Recovery':control.tags.includes('incident-response')?'Incident Response':control.tags.includes('logging')?'Logging & Detection':control.tags.includes('vulnerability')?'Vulnerability Management':'Governance',priority:gap.severity,observation:`${framework.shortName} ${control.controlCode} was evaluated as ${gap.status}. ${gap.reason}`,risk:'The gap may reduce readiness, weaken evidence quality, or increase operational and regulatory exposure.',impact:'Potential business interruption, delayed incident response, unauthorized access, audit friction, or increased remediation cost.',recommendation:gap.recommendedAction,owner:'To be assigned',status:'Suggested',roadmap:gap.severity==='Critical'?'0–30 days':'31–90 days',evidence:'Missing',confidence:'Medium',mapping:`${framework.name} ${control.controlCode}`,frameworkMapping:[`${framework.shortName} ${control.controlCode}`],likelihood:gap.severity==='Critical'?4:3,impactScore:gap.severity==='Critical'?5:4};
    });
  }
  function generateFrameworkReportSection(input){
    const disclaimer = input.framework.alphaStatus !== 'complete' ? `<p><b>Alpha limitation:</b> ${data().disclaimer}</p>` : '';
    const topGaps = input.gaps.filter(gap => gap.frameworkId===input.framework.id).slice(0,5);
    return `<h2>Framework Readiness: ${input.framework.name}</h2><p><b>Version:</b> ${input.framework.version} · <b>Readiness:</b> ${input.coverage.readinessScore}% · <b>Coverage:</b> ${input.coverage.coveragePercent}% · <b>Evidence completeness:</b> ${input.coverage.evidenceCompletenessPercent}%</p><table><tr><th>Implemented</th><th>Partial</th><th>Not implemented</th><th>Unknown</th><th>Evidence missing</th></tr><tr><td>${input.coverage.implemented}</td><td>${input.coverage.partiallyImplemented}</td><td>${input.coverage.notImplemented}</td><td>${input.coverage.unknown}</td><td>${input.coverage.evidenceMissing}</td></tr></table><h3>Top Framework Gaps</h3>${topGaps.length?`<ul>${topGaps.map(gap => `<li><b>${gap.title}</b> - ${gap.status}. ${gap.recommendedAction}</li>`).join('')}</ul>`:'<p>No high-priority framework gaps generated from current answers.</p>'}${disclaimer}`;
  }
  function frameworkImpactForFinding(finding){
    if(finding.frameworkMapping?.length)return finding.frameworkMapping.join(', ');
    const categoryTags = finding.category?.includes('Identity') ? ['iam','mfa'] : finding.category?.includes('Backup') ? ['backup','recovery'] : finding.category?.includes('Incident') ? ['incident-response'] : finding.category?.includes('Logging') ? ['logging','detection'] : [];
    return data().controls.filter(control => control.tags.some(tag => categoryTags.includes(tag))).slice(0,4).map(control => `${frameworkById(control.frameworkId).shortName} ${control.controlCode}`).join(', ');
  }
  return {getSelectedFrameworks,selectedFrameworkEntries,generateAssessmentQuestions,getControlsForQuestion,getEvidenceForQuestion,evaluateFrameworkControl,evaluateFrameworkCoverage,evaluateAll,generateGapAnalysis,suggestFindingsFromGaps,generateFrameworkReportSection,frameworkImpactForFinding,questionIdForLegacyQuestion,controlById,frameworkById};
})();
