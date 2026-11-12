import {IMPORT_FIELDS,TYPES,TRANSACTIONS,DIRECTIONS,suggestMapping,rowCandidate,buildImportPatch,cellText} from './import-core.js';

const $=s=>document.querySelector(s);
const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;};
export function initListingImport({form,toast,isGenerating,onApply}){
 let sheets=[],rows=[],headers=[],captures=[],urls=[],busy=false;
 const root=$('.listing-import');
 const error=message=>{$('#import-error').textContent=message;$('#import-error').hidden=!message;};
 const status=message=>{$('#import-status').textContent=message;};
 function setBusy(value){busy=value;root.setAttribute('aria-busy',String(value));for(const el of root.querySelectorAll('input,button,select,textarea'))el.disabled=value;}
 function clearReview(){$('#import-review').hidden=true;$('#confirm-import').checked=false;$('#confirm-import-features').checked=false;}
 function showReview(candidate,source){
   clearReview();$('#import-source').textContent=source;
   const notes=$('#import-notes');notes.replaceChildren();
   for(const text of candidate.notes||[]){const li=document.createElement('li');li.textContent=text;notes.append(li);}
   const holder=$('#import-fields');holder.replaceChildren();
   for(const [key,label]of Object.entries(IMPORT_FIELDS)){
     const box=document.createElement('div');box.className='import-field';
     const choice=document.createElement('label');choice.className='checkbox-label';
     const check=document.createElement('input');check.type='checkbox';check.dataset.importSelect=key;check.checked=!!candidate.fields[key];
     const title=document.createElement('span');title.textContent=label;choice.append(check,title);
     const allowed=key==='propertyType'?TYPES:key==='transaction'?TRANSACTIONS:key==='direction'?DIRECTIONS:null;
     const input=document.createElement(allowed?'select':'textarea');input.dataset.importValue=key;input.setAttribute('aria-label',label+' 확인·수정');
     if(allowed){input.append(option('','직접 선택 / 확인 필요'));for(const v of allowed)input.append(option(v,v));input.value=allowed.includes(candidate.fields[key])?candidate.fields[key]:'';}
     else {input.rows=['features','checks'].includes(key)?3:2;input.value=candidate.fields[key]||'';}
     input.addEventListener('input',()=>{check.checked=!!input.value.trim();$('#confirm-import').checked=false;if(key==='features')$('#confirm-import-features').checked=false;});
     const evidence=document.createElement('small');evidence.textContent=candidate.evidence?.[key]?`캡처 근거: ${candidate.evidence[key]}`:candidate.fields[key]?`원자료: ${cellText(candidate.fields[key])}`:'원자료 없음 · 필요한 경우 직접 입력';
     box.append(choice,input,evidence);holder.append(box);
   }
   $('#import-review').hidden=false;status('가져온 내용은 아직 입력란에 적용되지 않았습니다. 원자료와 대조해주세요.');
 }
 function mapping(){return Object.fromEntries([...$('#import-columns').querySelectorAll('select')].map(el=>[el.dataset.field,Number(el.value)]));}
 function updateRows(){
   clearReview();const selection=$('#import-row');selection.replaceChildren();const map=mapping();
   const start=Number($('#import-header').value)+1;
   rows.forEach((row,i)=>{if(i<start||!row.some(cell=>cellText(cell)))return;
     const p=rowCandidate(row,headers,map).fields;
     selection.append(option(String(i),`${i+1}행 · ${[p.region||p.exactAddress,p.propertyType,p.transaction,p.salePrice||p.deposit].filter(Boolean).join(' / ').slice(0,120)||row.filter(Boolean).slice(0,3).join(' / ').slice(0,120)}`));
   });
   $('#review-excel').disabled=!selection.options.length;status(selection.options.length?`${selection.options.length}개 행을 읽었습니다. 가져올 매물 한 건을 선택하세요.`:'가져올 데이터 행이 없습니다. 시트·열 제목 행을 확인해주세요.');
 }
 function updateColumns(){
   clearReview();const index=Number($('#import-header').value);headers=(rows[index]||[]).map(cellText);
   const guess=suggestMapping(headers),container=$('#import-columns');container.replaceChildren();
   for(const [key,label]of Object.entries(IMPORT_FIELDS)){
     const l=document.createElement('label');l.textContent=label;const select=document.createElement('select');select.dataset.field=key;
     select.append(option('-1','가져오지 않음'));headers.forEach((h,i)=>select.append(option(String(i),`${i+1}열 · ${h||'(빈 제목)'}`)));
     select.value=String(guess[key]);select.addEventListener('change',updateRows);l.append(select);container.append(l);
   }
   updateRows();
 }
 function selectSheet(){rows=sheets[Number($('#import-sheet').value)]?.rows||[];const header=$('#import-header');header.replaceChildren();
   for(let i=0;i<Math.min(20,rows.length);i++)header.append(option(String(i),`${i+1}행 · ${rows[i].filter(Boolean).slice(0,3).join(' / ').slice(0,80)}`));
   const guess=rows.slice(0,20).findIndex(row=>Object.values(suggestMapping(row)).filter(i=>i>=0).length>=2);if(guess>=0)header.value=String(guess);
   updateColumns();
 }
 function parseWorkbook(buffer){return new Promise((resolve,reject)=>{
   const worker=new Worker('./excel-worker.js');const timer=setTimeout(()=>{worker.terminate();reject(new Error('파일 처리 시간이 초과되었습니다. 필요한 시트와 행만 남겨 다시 올려주세요.'));},20000);
   worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(new Error(data.error)):resolve(data.sheets);};
   worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('엑셀 읽기 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.'));};
   worker.postMessage(buffer,[buffer]);
 });}
 $('#listing-excel').addEventListener('change',async event=>{
   if(busy)return;const file=event.target.files[0];if(!file)return;clearReview();$('#excel-mapping').hidden=true;error('');
   if(!/\.(xlsx|xls|csv)$/i.test(file.name)||!file.size||file.size>5*1024*1024){error('5MB 이하의 XLSX·XLS·CSV 파일을 선택해주세요.');event.target.value='';return;}
   setBusy(true);status('엑셀을 브라우저에서 읽고 있습니다…');
   try{sheets=await parseWorkbook(await file.arrayBuffer());if(!sheets.some(s=>s.rows.length))throw new Error('데이터가 있는 시트를 찾지 못했습니다.');
     const select=$('#import-sheet');select.replaceChildren(...sheets.map((s,i)=>option(String(i),s.name)));select.value=String(sheets.findIndex(s=>s.rows.length));selectSheet();$('#excel-mapping').hidden=false;
   }catch(e){error(e.message);status('기존 매물 입력은 유지했습니다. 다른 파일로 다시 시도할 수 있습니다.');}
   finally{setBusy(false);$('#review-excel').disabled=!$('#import-row').options.length;event.target.value='';}
 });
 $('#import-sheet').addEventListener('change',selectSheet);$('#import-header').addEventListener('change',updateColumns);$('#import-row').addEventListener('change',clearReview);
 $('#review-excel').addEventListener('click',()=>{error('');const index=Number($('#import-row').value);if(!rows[index])return;showReview(rowCandidate(rows[index],headers,mapping()),`엑셀 · ${sheets[Number($('#import-sheet').value)].name} / ${index+1}행`);});
 $('#cancel-import').addEventListener('click',clearReview);
 function releaseUrls(){urls.forEach(URL.revokeObjectURL);urls=[];}
 $('#listing-captures').addEventListener('change',event=>{
   if(busy)return;clearReview();error('');releaseUrls();captures=[];$('#capture-consent').checked=false;$('#capture-previews').replaceChildren();
   const files=[...event.target.files];
   if(files.length>3||files.some(f=>!/^image\/(jpeg|png|webp)$/.test(f.type)||!f.size||f.size>5*1024*1024)){error('동일한 매물의 JPG·PNG·WebP 캡처를 최대 3장, 장당 5MB 이하로 선택해주세요.');event.target.value='';return;}
   captures=files;for(const file of files){const url=URL.createObjectURL(file);urls.push(url);const box=document.createElement('div');box.className='capture-thumb';const img=document.createElement('img');img.src=url;img.alt='업로드한 등록 화면 캡처';const small=document.createElement('small');small.textContent=file.name;box.append(img,small);$('#capture-previews').append(box);}
 });
 async function compactCapture(file){
   const img=await createImageBitmap(file,{imageOrientation:'from-image'});
   try{if(img.width*img.height>40000000)throw new Error('해상도가 너무 큽니다. 4,000만 화소 이하 캡처를 사용해주세요.');
     const scale=Math.min(1,2200/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
     const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
     let value=canvas.toDataURL('image/jpeg',.88);if(value.length>900000)value=canvas.toDataURL('image/jpeg',.65);if(value.length>900000)throw new Error('캡처의 필요한 정보 부분만 잘라 다시 올려주세요.');return value;
   }finally{img.close();}
 }
 $('#read-captures').addEventListener('click',async()=>{
   if(busy)return;error('');if(!captures.length){error('먼저 등록 화면 캡처를 선택해주세요.');return;}if(!$('#capture-consent').checked){error('캡처 전송 동의를 선택해주세요.');return;}
   clearReview();setBusy(true);status('캡처를 AI로 읽고 있습니다… 입력란은 아직 바뀌지 않습니다.');
   try{const images=[];for(const file of captures)images.push(await compactCapture(file));
     const response=await fetch('/api/import-listing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images}),signal:AbortSignal.timeout(55000)});
     let result;try{result=await response.json();}catch{throw new Error('인식 서버 응답을 읽지 못했습니다. 배포 상태를 확인해주세요.');}
     if(!response.ok)throw new Error(result.error?.message||'캡처 인식에 실패했습니다.');if(!result.candidate?.fields)throw new Error('캡처 인식 결과가 올바르지 않습니다.');
     if(!Object.keys(result.candidate.fields).length)throw new Error((result.candidate.notes||[]).join(' ')||'읽을 수 있는 매물 정보를 찾지 못했습니다. 한 매물의 선명한 캡처로 다시 시도해주세요.');
     showReview(result.candidate,'등록 화면 캡처 · AI 인식 초안 / 원자료 대조 필요');
   }catch(e){error(e.name==='TimeoutError'?'캡처 인식 시간이 초과되었습니다. 다시 시도해주세요.':e.message);status('기존 매물 입력과 선택한 캡처는 유지했습니다. 다시 시도할 수 있습니다.');}
   finally{setBusy(false);}
 });
 $('#apply-import').addEventListener('click',()=>{
   if(busy)return;error('');if(isGenerating()){error('홍보 문구 작성이 끝난 뒤 적용해주세요.');return;}if(!$('#confirm-import').checked){error('원자료 대조 확인을 선택해주세요.');return;}
   const values=Object.fromEntries([...$('#import-fields').querySelectorAll('[data-import-value]')].map(el=>[el.dataset.importValue,el.value.trim()]));
   const selected=new Set([...$('#import-fields').querySelectorAll('[data-import-select]:checked')].map(el=>el.dataset.importSelect));
   if(!selected.size){error('적용할 항목을 선택해주세요.');return;}
   const patch=buildImportPatch(values,selected,{confirmFeatures:$('#confirm-import-features').checked});
   if(!patch.propertyType||!patch.transaction){error('매물 유형과 거래 유형을 확인·선택해주세요.');return;}
   for(const [key,value]of Object.entries(patch)){
     const el=form.elements[key];if(!el)continue;
     if(el.maxLength>0&&value.length>el.maxLength){error(`${IMPORT_FIELDS[key]} 내용이 너무 깁니다. 적용 전 줄여주세요.`);return;}
     if(key==='area'&&selected.has(key)&&values[key]&&!value){error('전용면적은 ㎡ 기준의 숫자로 확인해주세요. 공급면적이나 평을 넣지 마세요.');return;}
   }
   for(const [key,value]of Object.entries(patch))if(form.elements[key])form.elements[key].value=value;
   form.elements.publishAddress.checked=false;form.elements.publishContact.checked=false;
   onApply();clearReview();status('선택한 매물 정보를 입력란에 적용했습니다. 주소·연락처는 비공개입니다. 기존 사진이 같은 매물인지 확인해주세요.');toast('매물 정보를 가져왔어요. 입력란을 확인해주세요.');$('#input-title').scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('#import-sample').addEventListener('click',()=>{
   const content='\uFEFF매물유형,거래유형,공개지역,주소,매매가(만원),보증금(만원),월세(만원),전용면적(㎡),층,방향,입주가능시기,관리비,주차정보,특징,추가확인사항\r\n';
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='매물가져오기_입력양식.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 });
 window.addEventListener('pagehide',e=>{if(!e.persisted)releaseUrls();});
}
