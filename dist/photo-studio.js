import { CATEGORIES, PHOTO_LIMITS, defaultEdit, fileProblem, reorder, cardFields } from './photo-core.js';
import { editedPhoto, renderCard } from './card-renderer.js';

const $=s=>document.querySelector(s);
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 파일을 만들 수 없습니다. 다시 시도해주세요.')),'image/png'));
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}

export function initPhotoStudio({getProperty,toast}) {
  let photos=[],heroId=null,uploadQueue=Promise.resolve(),uploading=false;
  let editingId=null,draftEdit=null,card=null,cardStale=false,cardValid=false,cardBlob=null,previewURL=null,renderSequence=0,rendering=false;
  const form=$('#property-form'),fileInput=$('#photo-files'),drop=$('#photo-drop');
  const fields={title:$('#card-headline'),price:$('#card-price'),area:$('#card-area'),features:$('#card-features')};
  const hero=()=>photos.find(p=>p.id===heroId)||photos[0];
  const total=()=>photos.reduce((sum,p)=>sum+p.file.size,0);
  function cardError(message){$('#card-error').textContent=message;$('#card-error').hidden=!message;}
  function thumb(photo){const canvas=editedPhoto(photo,photo.edit,320);photo.thumb=canvas.toDataURL('image/jpeg',.82);canvas.width=1;canvas.height=1;}
  function button(text,label,action){const b=element('button','button secondary',text);b.type='button';b.setAttribute('aria-label',label);b.addEventListener('click',action);return b;}

  function renderLibrary(){
    $('#photo-count').textContent=`${photos.length} / 10장 · ${(total()/1024/1024).toFixed(1)}MB / 50MB`;
    const list=$('#photo-list');list.replaceChildren();
    photos.forEach((photo,index)=>{
      const item=element('article','photo-item');item.dataset.photoId=photo.id;
      const preview=element('img','photo-thumb');preview.src=photo.thumb;preview.alt=`${index+1}번 ${photo.category} 사진: ${photo.file.name}`;
      const info=element('div','photo-info');
      const name=element('p','photo-name',`${index+1}. ${photo.file.name}`);name.title=photo.file.name;
      const meta=element('p','help',`${photo.originalWidth} × ${photo.originalHeight} · ${(photo.file.size/1024/1024).toFixed(1)}MB`);
      const categoryLabel=element('label','photo-category','공간 분류');const select=element('select');select.setAttribute('aria-label',`${photo.file.name} 공간 분류`);
      for(const category of CATEGORIES){const option=element('option','',category);option.value=category;select.append(option);}select.value=photo.category;
      select.addEventListener('change',()=>{photo.category=select.value;refreshCard();});categoryLabel.append(select);
      info.append(name,meta,categoryLabel);
      const actions=element('div','photo-actions');
      const featured=button(photo.id===hero()?.id?'★ 대표 사진':'☆ 대표로',`${photo.file.name} 대표 사진 선택`,()=>{heroId=photo.id;renderLibrary();refreshCard();});featured.setAttribute('aria-pressed',String(photo.id===hero()?.id));if(photo.id===hero()?.id)featured.classList.add('featured');
      const edit=button('자르기·보정',`${photo.file.name} 사진 편집`,()=>openEditor(photo));
      const up=button('↑',`${photo.file.name} 순서 앞으로`,()=>{photos=reorder(photos,photo.id,-1);renderLibrary();});up.disabled=index===0;
      const down=button('↓',`${photo.file.name} 순서 뒤로`,()=>{photos=reorder(photos,photo.id,1);renderLibrary();});down.disabled=index===photos.length-1;
      const remove=button('삭제',`${photo.file.name} 사진 삭제`,()=>{
        photos=photos.filter(p=>p.id!==photo.id);photo.bitmap.close();URL.revokeObjectURL(photo.originalUrl);
        if(heroId===photo.id)heroId=photos[0]?.id||null;renderLibrary();refreshCard();toast('사진을 목록에서 삭제했어요. 원본 파일은 그대로입니다.');
      });
      const originals=element('a','photo-file-link','원본 저장');originals.href=photo.originalUrl;originals.download=photo.file.name;originals.setAttribute('aria-label',`${photo.file.name} 원본 다운로드`);
      const edited=button('편집본 PNG',`${photo.file.name} 편집본 다운로드`,async()=>{try{const c=editedPhoto(photo);save(await png(c),`${photo.file.name.replace(/\.[^.]+$/,'')}_편집본.png`);c.width=1;c.height=1;}catch(error){toast(error.message);}});
      actions.append(featured,edit,up,down,remove,originals,edited);item.append(preview,info,actions);list.append(item);
    });
  }

  async function addFiles(files){
    const errors=[];let added=0;uploading=true;$('#add-photos').disabled=true;$('#make-card').disabled=true;drop.setAttribute('aria-busy','true');$('#photo-status').textContent='사진을 확인하고 미리보기를 만들고 있어요…';
    try{
      for(const file of files){
        const problem=fileProblem(file,photos.length,total());if(problem){errors.push(`${file.name}: ${problem}`);continue;}
        if(photos.some(p=>p.file.name===file.name&&p.file.size===file.size&&p.file.lastModified===file.lastModified)){errors.push(`${file.name}: 이미 추가한 사진입니다.`);continue;}
        let bitmap;
        try{
          bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
          const originalWidth=bitmap.width,originalHeight=bitmap.height;
          if(!originalWidth||!originalHeight||originalWidth*originalHeight>PHOTO_LIMITS.pixels)throw new Error('사진 해상도는 최대 4,000만 화소까지 지원합니다.');
          const scale=Math.min(1,1600/Math.max(originalWidth,originalHeight));
          if(scale<1){const reduced=await createImageBitmap(bitmap,{resizeWidth:Math.round(originalWidth*scale),resizeHeight:Math.round(originalHeight*scale),resizeQuality:'high'});bitmap.close();bitmap=reduced;}
          const photo={id:crypto.randomUUID(),file,bitmap,originalUrl:URL.createObjectURL(file),originalWidth,originalHeight,category:'기타',edit:defaultEdit()};
          thumb(photo);photos.push(photo);if(!heroId)heroId=photo.id;added++;
        }catch(error){bitmap?.close();errors.push(`${file.name}: ${error.message?.includes('화소')?error.message:'사진을 읽지 못했습니다. 파일 형식과 손상 여부를 확인해주세요.'}`);}
      }
      renderLibrary();$('#photo-errors').replaceChildren(...errors.map(message=>element('li','',message)));$('#photo-errors').hidden=!errors.length;
      $('#photo-status').textContent=`${added}장을 추가했습니다.${errors.length?` ${errors.length}개 파일은 추가하지 못했습니다.`:''}`;
      refreshCard();
    }finally{uploading=false;$('#add-photos').disabled=false;$('#make-card').disabled=false;drop.setAttribute('aria-busy','false');}
  }
  function enqueue(files){const snapshot=Array.from(files);if(!snapshot.length)return;uploadQueue=uploadQueue.then(()=>addFiles(snapshot)).catch(()=>{$('#photo-status').textContent='사진 처리 중 문제가 발생했습니다. 다시 추가해주세요.';});}
  $('#add-photos').addEventListener('click',()=>fileInput.click());drop.addEventListener('click',()=>{if(!uploading)fileInput.click();});drop.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();if(!uploading)fileInput.click();}});
  fileInput.addEventListener('change',()=>{enqueue(fileInput.files);fileInput.value='';});
  for(const name of ['dragenter','dragover'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('drag-over');});
  drop.addEventListener('dragleave',event=>{if(!drop.contains(event.relatedTarget))drop.classList.remove('drag-over');});
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('drag-over');enqueue(event.dataTransfer.files);});

  const editControls={ratio:$('#crop-ratio'),zoom:$('#crop-zoom'),x:$('#crop-x'),y:$('#crop-y'),brightness:$('#photo-brightness')};
  function renderEditor(){
    const photo=photos.find(p=>p.id===editingId);if(!photo||!draftEdit)return;
    try{const rendered=editedPhoto(photo,draftEdit,800),canvas=$('#crop-canvas');canvas.width=rendered.width;canvas.height=rendered.height;canvas.getContext('2d').drawImage(rendered,0,0);rendered.width=1;rendered.height=1;$('#zoom-value').textContent=`${Number(draftEdit.zoom).toFixed(2)}×`;$('#brightness-value').textContent=`${draftEdit.brightness}%`;$('#photo-edit-error').hidden=true;}catch{$('#photo-edit-error').textContent='사진 미리보기를 만들지 못했습니다. 편집을 초기화해보세요.';$('#photo-edit-error').hidden=false;}
  }
  function syncEditor(){for(const [name,input]of Object.entries(editControls))input.value=draftEdit[name];renderEditor();}
  function openEditor(photo){editingId=photo.id;draftEdit={...photo.edit};$('#editing-photo-name').textContent=photo.file.name;syncEditor();$('#photo-editor').showModal();}
  for(const [name,input]of Object.entries(editControls))input.addEventListener('input',()=>{draftEdit[name]=name==='ratio'?input.value:Number(input.value);renderEditor();});
  $('#rotate-left').addEventListener('click',()=>{draftEdit.rotation=(draftEdit.rotation+270)%360;renderEditor();});$('#rotate-right').addEventListener('click',()=>{draftEdit.rotation=(draftEdit.rotation+90)%360;renderEditor();});
  $('#reset-photo-edit').addEventListener('click',()=>{draftEdit=defaultEdit();syncEditor();});$('#close-photo-editor').addEventListener('click',()=>$('#photo-editor').close());
  $('#save-photo-edit').addEventListener('click',()=>{const photo=photos.find(p=>p.id===editingId);if(!photo)return;photo.edit={...draftEdit};thumb(photo);renderLibrary();refreshCard();$('#photo-editor').close();toast('원본을 유지하고 편집 설정을 적용했어요.');});
  $('#photo-editor').addEventListener('close',()=>{editingId=null;draftEdit=null;});

  function fieldValues(){return Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value]));}
  async function refreshCard(){
    const sequence=++renderSequence;cardValid=false;$('#download-card').disabled=true;
    if(!card)return;
    if(!hero()){$('#card-preview-wrap').hidden=true;cardError('대표 사진이 없습니다. 사진을 추가해주세요.');return;}
    rendering=true;cardError('');
    // Snapshot every render, so privacy/contact changes are reflected immediately.
    const current=getProperty();const privacyRaw={...card.raw,publishAddress:current.publishAddress,publishContact:current.publishContact,exactAddress:current.exactAddress,contact:current.contact,office:current.office};
    try{
      const staging=document.createElement('canvas');const dims=await renderCard(staging,{photo:hero(),fields:fieldValues(),raw:privacyRaw,size:$('#card-size').value});
      const blob=await png(staging);staging.width=1;staging.height=1;
      if(sequence!==renderSequence)return;
      if(previewURL)URL.revokeObjectURL(previewURL);cardBlob=blob;previewURL=URL.createObjectURL(blob);
      const image=$('#card-preview-image');image.src=previewURL;image.width=dims.width;image.height=dims.height;
      await image.decode();if(sequence!==renderSequence)return;
      $('#card-preview-wrap').hidden=false;$('#card-dimensions').textContent=`${dims.width} × ${dims.height}px · 미리보기와 동일한 PNG`;
      cardValid=true;
      $('#download-card').disabled=cardStale;
    }catch(error){if(sequence!==renderSequence)return;$('#card-preview-wrap').hidden=true;cardError(error.message||'카드를 만들지 못했습니다. 문구와 사진을 확인해주세요.');}
    finally{if(sequence===renderSequence)rendering=false;}
  }
  $('#make-card').addEventListener('click',()=>{
    if(uploading)return;if(!hero()){cardError('매물 사진을 한 장 이상 추가해주세요.');return;}
    try{const raw=getProperty();const values=cardFields(raw);for(const [name,input]of Object.entries(fields))input.value=values[name];card={raw};cardStale=false;$('#card-stale').hidden=true;$('#card-edit-fields').hidden=false;$('#card-empty').hidden=true;refreshCard();}
    catch(error){cardError(error.message);}
  });
  for(const input of Object.values(fields))input.addEventListener('input',()=>refreshCard());$('#card-size').addEventListener('change',()=>refreshCard());
  function propertyChanged(){if(!card)return;cardStale=true;$('#card-stale').hidden=false;refreshCard();}
  form.addEventListener('input',event=>{if(event.target.name!=='mode'&&event.target.name!=='tone')propertyChanged();});form.addEventListener('propertychange',propertyChanged);
  $('#download-card').addEventListener('click',async()=>{
    if(!card||!cardBlob||!cardValid||cardStale||rendering||$('#download-card').disabled)return;
    $('#download-card').disabled=true;
    try{save(cardBlob,`매물홍보카드_${$('#card-size').value}_${Date.now()}.png`);toast('미리보기와 같은 PNG를 저장했어요.');}catch(error){cardError(error.message);}finally{$('#download-card').disabled=cardStale||rendering||!cardValid;}
  });
  window.addEventListener('pagehide',event=>{if(!event.persisted){for(const photo of photos){photo.bitmap.close();URL.revokeObjectURL(photo.originalUrl);}if(previewURL)URL.revokeObjectURL(previewURL);}});
  renderLibrary();
}
