import { prepareInput } from './content-policy.js';
import { priceText } from './generator.js';

export const PHOTO_LIMITS = { count:10, perFile:10*1024*1024, total:50*1024*1024, pixels:40000000 };
export const CATEGORIES = ['거실','주방','방','욕실','외관','기타'];
export const CARD_SIZES = {square:{width:1080,height:1080},portrait:{width:1080,height:1350}};
export const defaultEdit = () => ({rotation:0,ratio:'landscape',zoom:1,x:50,y:50,brightness:100});
export function fileProblem(file,count,totalBytes) {
  if(count>=PHOTO_LIMITS.count)return '사진은 최대 10장까지 추가할 수 있습니다.';
  if(!/\.(jpe?g|png|webp)$/i.test(file.name)||!['image/jpeg','image/png','image/webp'].includes(file.type))return 'JPG·PNG·WebP 사진만 지원합니다.';
  if(!file.size)return '내용이 없는 파일입니다.';
  if(file.size>PHOTO_LIMITS.perFile)return '장당 10MB를 초과했습니다.';
  if(file.size+totalBytes>PHOTO_LIMITS.total)return '전체 사진 용량 50MB를 초과했습니다.';
  return '';
}
export function rotatedSize(width,height,rotation) {return (Math.round(rotation/90)%2+2)%2?{width:height,height:width}:{width,height};}
export function cropRect(width,height,edit) {
  const size=rotatedSize(width,height,edit.rotation);
  const ratio=edit.ratio==='square'?1:edit.ratio==='standard'?4/3:edit.ratio==='original'?size.width/size.height:16/9;
  let w=size.width,h=w/ratio;if(h>size.height){h=size.height;w=h*ratio;}
  const zoom=Math.min(3,Math.max(1,Number(edit.zoom)||1));w/=zoom;h/=zoom;
  return {x:(size.width-w)*Math.min(100,Math.max(0,Number(edit.x)||0))/100,y:(size.height-h)*Math.min(100,Math.max(0,Number(edit.y)||0))/100,width:w,height:h,ratio,...{rotatedWidth:size.width,rotatedHeight:size.height}};
}
export function reorder(items,id,direction) {
  const i=items.findIndex(p=>p.id===id),j=i+direction;
  if(i<0||j<0||j>=items.length)return [...items];
  const result=[...items];[result[i],result[j]]=[result[j],result[i]];return result;
}
export function wrapLines(text,maxWidth,measure) {
  const lines=[];
  for(const paragraph of String(text||'').split('\n')){
    if(!paragraph){lines.push('');continue;}
    let line='';for(const char of Array.from(paragraph)){if(line&&measure(line+char)>maxWidth){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;}if(line)lines.push(line);
  }
  return lines;
}
export function fitText(text,{width,height,maxFont,minFont=18,lineHeight=1.45,measure}) {
  if(!text)return {font:maxFont,lines:[],height:0,lineHeight:maxFont*lineHeight};
  for(let font=maxFont;font>=minFont;font-=1){const lines=wrapLines(text,width,s=>measure(s,font));const needed=lines.length*font*lineHeight;if(needed<=height&&lines.every(line=>measure(line,font)<=width))return{font,lines,height:needed,lineHeight:font*lineHeight};}
  throw new Error('문구가 카드 공간보다 깁니다. 제목·가격·특징 또는 사무소 정보를 줄여주세요.');
}
export function sanitizeCardText(value,raw) {
  let text=String(value||'').trim();
  if(!raw.publishAddress&&raw.exactAddress)text=text.split(String(raw.exactAddress).trim()).join('');
  return text.split('\n').filter(line=>!/(?:0\d{1,2}[- .]?\d{3,4}[- .]?\d{4})|[\w.+-]+@[\w.-]+\.[a-z]{2,}|고객|소유자|집주인|임대인|임차인|주민번호|계좌|비밀번호/i.test(line)).join('\n').trim();
}
export function cardFields(raw) {
  const {data}=prepareInput(raw);
  return {title:[data.region,data.propertyType,data.transaction].filter(Boolean).join(' '),price:priceText(data),area:data.area?`전용면적 ${data.area}㎡`:'',features:data.features};
}
export function cardPublicInfo(raw) {
  const {data}=prepareInput(raw);
  return {location:[data.region,data.publishAddress&&data.exactAddress].filter(Boolean).join(' · '),office:data.office,contact:data.contact,example:data.example,type:`${data.propertyType} · ${data.transaction}`};
}
