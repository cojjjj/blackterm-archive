import { el, button, link, field, heading, pre, message, api, bindForm, submitButton } from './ui.js';
const root=document.querySelector('#recruit-root');
let candidate=null, config=null, selected='signal';
const stageNames=['signal','debug','repair','feature','debrief'];
let draft={};
let storageFailed=false;
function loadDraft(id) { try { draft=JSON.parse(localStorage.getItem(`blackterm_audition_${id}`)||'{}'); } catch { draft={}; } }
function saveDraft() { try {localStorage.setItem(`blackterm_audition_${candidate.id}`,JSON.stringify(draft));}catch{storageFailed=true;} }
function rememberForm(form) {form.addEventListener('input',()=>{draft={...draft,...Object.fromEntries(new FormData(form))};saveDraft();});}
function wipeDraft(id) {try{localStorage.removeItem(`blackterm_audition_${id}`);}catch{}}
function inputFromDraft(label,name,options={}) {return field(label,name,{...options,value:draft[name]||''});}

async function boot() {
  root.replaceChildren(heading('OPTIONAL RECRUITMENT MODE','Your code is the evidence.','Recover the signal. Repair a broken system. Build something useful.'));
  try {
    config=await api('/api/recruitment/status');
    try {candidate=await api('/api/recruitment/me');loadDraft(candidate.id);selected=candidate.stages[0].complete?'debug':'signal';renderCandidate();}
    catch(error){if(error.status===401)renderWelcome();else throw error;}
  } catch(error){root.append(message(error.message),button('Retry connection',boot));}
}
function renderWelcome() {
  root.replaceChildren(heading('DEVELOPER AUDITION / 45–60 MINUTES','Your code is the evidence.','An optional developer assessment inside the Archive. You can pause and resume. AI tools are allowed when disclosed.'));
  const features=el('div','overview-grid');
  for(const stage of config.stages){const card=el('article','overview-card');card.append(el('small','eyebrow',String(config.stages.indexOf(stage)+1).padStart(2,'0')),el('h2','',stage.title),el('p','muted',stage.description));features.append(card);}
  root.append(features,el('p','muted','Review rubric: correctness 40% · code quality 25% · debugging/testing 20% · communication 15%. A person reviews submissions; elapsed time and puzzle attempts do not determine hiring.'));
  if(!config.available) {root.append(el('div','notice','Auditions are not open yet. Check back later; regular Archive play remains available.'),link('Return to the Archive','/'));return;}
  const grid=el('div','forms-grid');
  if(config.accepting) {
    const form=el('form','panel');form.append(el('h2','','Start your audition'),field('Display name','display_name',{minLength:2,maxLength:80}),field('Contact email','email',{type:'email',maxLength:200}),field('GitHub username','github_handle',{maxLength:39,placeholder:'your-username'}));
    const consent=el('label','consent');const input=document.createElement('input');input.type='checkbox';input.name='consent';input.required=true;consent.append(input,el('span','','I agree to store my contact details, submission, and assessment results for this audition. I can delete my application while signed in.'));
    const status=message();form.append(consent,submitButton('Begin audition →'),status);
    bindForm(form,async values=>{const result=await api('/api/recruitment/enroll',{method:'POST',body:JSON.stringify({...values,consent:values.consent==='on'})});candidate=result.candidate;loadDraft(candidate.id);showRecovery(result.recovery_code);},status);grid.append(form);
  } else grid.append(el('div','panel','New auditions are closed. Existing candidates can still resume.'));
  const resume=el('form','panel');const status=message();resume.append(el('h2','','Resume your audition'),el('p','muted','Use the recovery code you saved when you enrolled. Keep this code private.'),field('Recovery code','recovery_code',{type:'password',minLength:40,maxLength:100}),submitButton('Resume →'),status);
  bindForm(resume,async values=>{candidate=await api('/api/recruitment/resume',{method:'POST',body:JSON.stringify(values)});loadDraft(candidate.id);selected='signal';renderCandidate();},status);grid.append(resume);root.append(grid);
  if(config.storage==='local')root.append(el('p','notice','Local development mode: records are stored on this server. Production auditions require the hosted database configuration.'));
}
function showRecovery(code) {
  root.replaceChildren(heading('IDENTITY REGISTERED',candidate.id,'Save your recovery code now. It restores your application on another browser or device.'));
  const panel=el('section','panel');const input=document.createElement('textarea');input.value=code;input.readOnly=true;input.setAttribute('aria-label','Recovery code');input.className='recovery-code';
  const status=message('This code is shown once. Anyone with it can access your application.');
  panel.append(input,button('Copy recovery code',async()=>{try{await navigator.clipboard.writeText(code);status.textContent='Copied. Store it somewhere private.';}catch{input.select();status.textContent='Select and copy the code manually.';}}),status,button('I saved my code · Enter mission →',()=>{selected='signal';renderCandidate();}));root.append(panel);
}
function renderCandidate() {
  root.replaceChildren();
  const top=heading(`${candidate.id} / ${candidate.status.replaceAll('_',' ').toUpperCase()}`,`Welcome, ${candidate.display_name}.`,'Suggested session: 45–60 minutes. Pause whenever you need; use your recovery code to return.');
  const actions=el('div','actions');
  const accountStatus=message();
  actions.append(button('Sign out',async()=>{try{await api('/api/recruitment/logout',{method:'POST'});wipeDraft(candidate.id);candidate=null;renderWelcome();}catch(error){accountStatus.textContent=error.message;}},'button secondary'),button('Delete my application',async()=>{if(!confirm('Delete your application, contact details, submission, and review permanently?'))return;try{await api('/api/recruitment/me',{method:'DELETE'});wipeDraft(candidate.id);candidate=null;renderWelcome();}catch(error){accountStatus.textContent=error.message;}},'button danger'));
  top.append(actions,el('p','muted','Unsubmitted notes save in this browser. Signing out clears these browser drafts; keep a copy before signing out.'),accountStatus);root.append(top);
  const tabs=el('nav','stage-tabs');tabs.setAttribute('aria-label','Audition stages');
  for(const [i,stage] of candidate.stages.entries()){const b=button(`${String(i+1).padStart(2,'0')} ${stage.complete?'✓ ':''}${stage.title}`,()=>{selected=stage.id;renderCandidate();},`stage-tab ${selected===stage.id?'active':''}`);b.disabled=!stage.unlocked;tabs.append(b);}root.append(tabs);
  const panel=el('section','panel mission-panel');root.append(panel);
  if(candidate.submission) {renderSubmitted(panel);return;}
  const stage=candidate.stages.find(s=>s.id===selected);
  if(!stage?.unlocked){selected='signal';renderCandidate();return;}
  panel.append(el('p','eyebrow',`STAGE ${stageNames.indexOf(selected)+1} / ${stage.complete?'RECOVERED':'IN PROGRESS'}`),el('h2','',stage.title));
  if(selected==='signal')renderSignal(panel,stage.complete);
  if(selected==='debug')renderDebug(panel,stage.complete);
  if(selected==='repair'||selected==='feature')renderContract(panel,selected);
  if(selected==='debrief')renderSubmission(panel);
}
function renderSignal(panel,complete) {
  panel.append(el('p','description','A recovered transmission uses standard Base64 encoding. Decode the JSON payload and submit the relay identifier, including its R- prefix. The decoy field is unrelated.'),pre(candidate.mission.transmission));
  if(complete){panel.append(el('p','success','Signal recovered.'),button('Continue to debugging →',()=>{selected='debug';renderCandidate();}));return;}
  answerForm(panel,'signal');
}
function renderDebug(panel,complete) {
  panel.append(el('p','description',`The broken processor counts repeated events and fails to normalize service names. Under the contract below, what should the total for “${candidate.mission.service}” be? Explain what causes the defect.`),pre(candidate.mission.broken_source),pre(JSON.stringify(candidate.mission.events,null,2)),el('p','muted','Count each event ID once. Normalize services with strip + lowercase; sum non-negative integer counts.'));
  if(complete){panel.append(el('p','success','Debugging mission recovered.'),button('Get your repair project →',()=>{selected='repair';renderCandidate();}));return;}
  answerForm(panel,'debug');
}
function answerForm(panel,stage) {
  const form=el('form','answer-form');const status=message();form.append(inputFromDraft(stage==='signal'?'Relay identifier':'Correct service total',`${stage}_answer`,{minLength:1,maxLength:300}));
  if(stage==='debug')form.append(inputFromDraft('Explain the defect (20+ characters)','debug_reason',{multiline:true,minLength:20,maxLength:4000}));
  form.append(submitButton('Submit evidence →'),status);rememberForm(form);
  bindForm(form,async values=>{const result=await api(`/api/recruitment/missions/${stage}/answer`,{method:'POST',body:JSON.stringify({answer:values[`${stage}_answer`],reasoning:values.debug_reason||''})});candidate=result.candidate;if(result.correct){selected=stage==='signal'?'debug':'repair';renderCandidate();}else status.textContent=result.message;},status);panel.append(form);
}
function renderContract(panel,stage) {
  panel.append(el('p','description',stage==='repair'?'Restore summarize_events in the intentionally broken Python starter. Download your project, read its contract, and add tests that demonstrate the repair.':'Implement merge_streams. Recover totals from several event streams while sharing deduplication across them. Your feature must meet the same validation and immutability rules.'),link('Download candidate-specific starter ↓','/api/recruitment/starter.zip'),pre(candidate.mission.contract));
  panel.append(el('div','notice','Use your own repository or a pull request in a repo you can access. Record the exact submitted commit. We link to your code; this website does not execute it.'));
  const note=field(stage==='repair'?'Repair notes (draft)':'Feature notes (draft)',stage==='repair'?'repair_notes':'feature_notes',{multiline:true,required:false,maxLength:6000,value:draft[stage==='repair'?'repair_notes':'feature_notes']||''});note.querySelector('textarea').addEventListener('input',event=>{draft[event.target.name]=event.target.value;saveDraft();});panel.append(note);
  panel.append(button(stage==='repair'?'Continue to feature contract →':'Continue to final debrief →',()=>{selected=stage==='repair'?'feature':'debrief';renderCandidate();}));
}
function renderSubmission(panel) {
  panel.append(el('p','description','Submit your repair and feature together. Explain the decisions and tests. Include your full commit SHA so the reviewer can assess that exact revision. AI assistance is allowed; describe how you verified its output.'));
  const form=el('form','submission-form');const status=message();
  form.append(inputFromDraft('GitHub repository or pull request URL','github_url',{type:'url',maxLength:300,placeholder:'https://github.com/you/archive-audition'}),inputFromDraft('Full commit SHA (40 characters)','commit_sha',{minLength:40,maxLength:40}));
  for(const [name,label,minLength,maxLength] of [['repair_notes','What did you repair? (40+ characters)',40,6000],['feature_notes','How does your feature meet the contract? (40+ characters)',40,6000],['tests_notes','Tests you ran and observed results (20+ characters)',20,4000],['explanation','Tradeoffs, edge cases, and one improvement (80+ characters)',80,8000],['ai_usage','AI use disclosure, or “None”',2,2000]])form.append(inputFromDraft(label,name,{multiline:true,minLength,maxLength}));
  const consent=el('label','consent');const check=document.createElement('input');check.type='checkbox';check.required=true;consent.append(check,el('span','','I can explain and modify this code. I understand submission locks this recorded revision for review.'));form.append(consent,submitButton('Submit audition for human review →'),status);rememberForm(form);
  bindForm(form,async values=>{candidate=await api('/api/recruitment/submit',{method:'POST',body:JSON.stringify(values)});wipeDraft(candidate.id);draft={};renderCandidate();},status);panel.append(form);
  if(storageFailed)panel.append(message('Browser draft saving is unavailable. Keep a separate copy of your notes.'));
}
function renderSubmitted(panel) {
  panel.append(el('p','eyebrow','AUDITION RECEIVED'),el('h2','','Your code is ready for review.'),el('p','description',`Application status: ${candidate.status.replaceAll('_',' ')}. A person will review your code, tests, explanation, and AI disclosure. No automatic hiring decision is made.`),link('Open submitted code ↗',candidate.submission.github_url),pre(`Recorded revision: ${candidate.submission.commit_sha}`),button('Refresh review status',async()=>{try{candidate=await api('/api/recruitment/me');renderCandidate();}catch(error){panel.append(message(error.message));}}));
}
boot();
