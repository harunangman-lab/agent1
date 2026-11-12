import { FORMATS, exportText } from './generator.js';
import { prepareInput, templateDraft } from './content-policy.js';

const $=selector=>document.querySelector(selector);
const form=$('#property-form');
const tabs=[...document.querySelectorAll('[data-format]')];
const drafts=new Map();
let format='blog', mode='template', currentDraft=null, variant=0, example=false, busy=false, toastTimer;
let configured=false, serverKnown=false, lastAttempt=null;
const key=()=>`${mode}:${format}`;

function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3500);}
function readInput(){const raw={...Object.fromEntries(new FormData(form)),publishAddress:form.elements.publishAddress.checked,example};delete raw.mode;return raw;}
function fingerprint(){return JSON.stringify(readInput());}
function syncTransaction(){const t=form.elements.transaction.value;for(const [id,name,enabled]of [['sale-field','salePrice',t==='매매'],['deposit-field','deposit',t!=='매매'],['rent-field','rent',t==='월세']]){$(`#${id}`).hidden=!enabled;form.elements[name].disabled=busy||!enabled;}}
function configLabel(){ $('#ai-status').textContent=serverKnown?(configured?'AI 서버 설정 완료 · 실제 연결·사용 권한은 생성 시 확인합니다.':'AI 미설정 · 서버의 OPENAI_API_KEY를 설정해주세요. 템플릿은 바로 사용할 수 있어요.'):'AI 서버에 연결할 수 없습니다. 템플릿은 계속 사용할 수 있어요.';$('#ai-privacy').hidden=mode!=='ai'; }
async function loadConfig(){try{const r=await fetch('/api/config',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error();const c=await r.json();configured=c.configured===true;serverKnown=true;}catch{configured=false;serverKnown=false;}configLabel();}
function setBusy(value){busy=value;$('#generation-progress').hidden=!value;form.setAttribute('aria-busy',String(value));for(const el of form.querySelectorAll('input,select,textarea,button'))el.disabled=value;$('#example').disabled=value;for(const tab of tabs)tab.disabled=value;for(const el of [$('#result-title'),$('#result-text'),$('#result-cta')])el.disabled=value;$('#regenerate').disabled=value||!currentDraft;$('#retry').disabled=value;syncTransaction();}
function drawDetails(draft){
  const dl=$('#used-facts');dl.replaceChildren();
  for(const fact of draft.usedFacts||[]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=fact.label;dd.textContent=fact.value;dl.append(dt,dd);}
  const ul=$('#review-items');ul.replaceChildren();for(const item of draft.reviewItems||[]){const li=document.createElement('li');li.textContent=item;ul.append(li);}
}
function showDraft(){
  currentDraft=drafts.get(key())||null;
  $('#empty-state').hidden=!!currentDraft;$('#result').hidden=!currentDraft;
  for(const id of ['copy','download','regenerate'])$(`#${id}`).disabled=!currentDraft||busy;
  if(!currentDraft){$('#mode-badge').textContent=mode==='ai'?'AI 모드 · 미생성':'템플릿 모드';$('#pending-checks').hidden=true;return;}
  const d=currentDraft;
  $('#mode-badge').textContent=`${d.mode==='ai'?'AI 생성 초안':'템플릿 초안'}${d.edited?' · 수정본':''}`;
  $('#mode-badge').classList.toggle('ai-badge',d.mode==='ai');
  $('#result-format').textContent=FORMATS[d.format];$('#result-example').hidden=!d.example;
  $('#result-title').value=d.title;$('#result-text').value=d.body;$('#result-cta').value=d.cta||'';
  $('#result-hashtags').textContent=(d.hashtags||[]).join(' ');$('#result-hashtags').hidden=!d.hashtags?.length;
  $('#edited-badge').hidden=!d.edited;$('#pending-checks').hidden=!d.checks;$('#checks-text').textContent=d.checks||'';
  $('#stale-message').hidden=d.inputFingerprint===fingerprint();drawDetails(d);
}
function errorMessage(message){$('#form-error').textContent=message;$('#form-error').hidden=false;$('#retry').hidden=mode!=='ai';}

async function generate({next=false,retry=false}={}){
  if(busy)return;
  $('#form-error').hidden=true;$('#retry').hidden=true;
  if(!form.reportValidity())return;
  let raw,prepared;
  try{raw=retry&&lastAttempt?lastAttempt.raw:readInput();prepared=prepareInput(raw);}catch(error){errorMessage(error.message);return;}
  const requestFormat=format,requestMode=mode,requestKey=key(),inputFingerprint=JSON.stringify(raw);
  const nextVariant=next?variant+1:0;
  lastAttempt={raw,format:requestFormat,mode:requestMode};
  setBusy(true);
  try{
    let draft;
    if(requestMode==='ai'){
      const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({property:prepared.data,format:requestFormat}),signal:AbortSignal.timeout(55000)});
      let result;try{result=await response.json();}catch{throw new Error('AI 서버 응답을 읽지 못했습니다. API 배포 상태를 확인해주세요.');}
      if(!response.ok)throw new Error(result.error?.message||'AI 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
      if(result.draft?.mode!=='ai'||result.draft.format!==requestFormat)throw new Error('AI 응답 형식이 올바르지 않습니다. 결과를 표시하지 않았습니다.');
      draft=result.draft;draft.reviewItems=[...new Set([...prepared.reviewItems,...draft.reviewItems])];
    }else draft=templateDraft(raw,requestFormat,nextVariant);
    draft.inputFingerprint=inputFingerprint;draft.edited=false;
    drafts.set(requestKey,draft);variant=nextVariant;showDraft();
    toast(`${requestMode==='ai'?'AI':'템플릿'} 초안이 준비되었어요.`);
    if(window.matchMedia('(max-width:760px)').matches)$('#output-title').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(error){errorMessage(error.name==='TimeoutError'?'응답 시간이 초과되었습니다. 입력을 유지했습니다. 다시 시도해주세요.':error.message);}
  finally{setBusy(false);showDraft();}
}

form.addEventListener('submit',event=>{event.preventDefault();generate();});
form.addEventListener('input',event=>{
  if(event.target.name==='mode'){mode=event.target.value;$('#form-error').hidden=true;$('#retry').hidden=true;configLabel();showDraft();return;}
  syncTransaction();if(currentDraft)$('#stale-message').hidden=currentDraft.inputFingerprint===fingerprint();
});
form.addEventListener('change',syncTransaction);
function selectTab(tab){if(busy)return;format=tab.dataset.format;for(const other of tabs){other.setAttribute('aria-selected',String(other===tab));other.tabIndex=other===tab?0:-1;}$('#output-body').setAttribute('aria-labelledby',tab.id);$('#form-error').hidden=true;$('#retry').hidden=true;showDraft();}
for(const tab of tabs){tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=tabs.indexOf(tab);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();selectTab(tabs[next]);});}
$('#example').addEventListener('click',()=>{
  const selectedMode=mode;form.reset();form.elements.mode.value=selectedMode;
  const sample={propertyType:'아파트',transaction:'전세',region:'서울 마포구 연남동',exactAddress:'가상로 12, 예시동 302호',deposit:'3억 5,000만원',area:'59.8',floor:'3층 / 총 5층',direction:'남향',moveIn:'2027년 2월 협의',maintenance:'월 12만원, 수도 별도',parking:'세대당 1대 가능',features:'거실 남향\n주방 창문 있음\n거실과 방 2개 구조',checks:'관리비 포함 항목 재확인\n입주 가능일 최종 협의',office:'한빛공인중개사사무소 (가상)',contact:'02-000-0000'};
  for(const [name,value]of Object.entries(sample))form.elements[name].value=value;
  example=true;$('#example-banner').hidden=false;$('#form-error').hidden=true;$('#retry').hidden=true;syncTransaction();showDraft();toast('가상 예시를 입력했어요. 만들기 버튼을 눌러보세요.');
});
for(const [id,field]of [['result-title','title'],['result-text','body'],['result-cta','cta']])$(`#${id}`).addEventListener('input',()=>{if(!currentDraft)return;currentDraft[field]=$(`#${id}`).value;currentDraft.edited=true;$('#edited-badge').hidden=false;$('#mode-badge').textContent=`${currentDraft.mode==='ai'?'AI 생성 초안':'템플릿 초안'} · 수정본`;});
$('#regenerate').addEventListener('click',()=>generate({next:true}));
$('#retry').addEventListener('click',()=>generate({retry:true}));
$('#copy').addEventListener('click',async()=>{if(!currentDraft)return;const text=exportText(currentDraft);try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text);toast('현재 수정본을 복사했어요.');}catch{$('#copy-text').value=text;$('#copy-dialog').showModal();$('#copy-text').focus();$('#copy-text').select();}});
$('#close-copy').addEventListener('click',()=>$('#copy-dialog').close());$('#select-copy').addEventListener('click',()=>{$('#copy-text').focus();$('#copy-text').select();});
$('#download').addEventListener('click',()=>{if(!currentDraft)return;const blob=new Blob(['\uFEFF',exportText(currentDraft)],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`매물홍보_${currentDraft.mode}_${FORMATS[currentDraft.format].replaceAll(' ','_')}_${new Date().toLocaleDateString('sv-SE')}.txt`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('현재 수정본의 TXT 다운로드를 시작했어요.');});
syncTransaction();loadConfig();
