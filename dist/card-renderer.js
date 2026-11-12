import { CARD_SIZES, cropRect, fitText, sanitizeCardText, cardPublicInfo } from './photo-core.js';

const FONT='"Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
export function editedPhoto(photo,edit=photo.edit,maxWidth=1600) {
  const rect=cropRect(photo.bitmap.width,photo.bitmap.height,edit);
  const oriented=document.createElement('canvas');oriented.width=rect.rotatedWidth;oriented.height=rect.rotatedHeight;
  const o=oriented.getContext('2d');o.translate(oriented.width/2,oriented.height/2);o.rotate(edit.rotation*Math.PI/180);o.drawImage(photo.bitmap,-photo.bitmap.width/2,-photo.bitmap.height/2);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(Math.min(rect.width,maxWidth)));canvas.height=Math.max(1,Math.round(canvas.width/rect.ratio));
  const ctx=canvas.getContext('2d');ctx.filter=`brightness(${edit.brightness}%)`;ctx.drawImage(oriented,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);ctx.filter='none';oriented.width=1;oriented.height=1;return canvas;
}
function block(ctx,text,x,y,width,height,maxFont,minFont=18,weight=500,color='#263f34') {
  const measure=(s,size)=>{ctx.font=`${weight} ${size}px ${FONT}`;return ctx.measureText(s).width;};
  const fit=fitText(text,{width,height,maxFont,minFont,lineHeight:1.4,measure});
  ctx.font=`${weight} ${fit.font}px ${FONT}`;ctx.fillStyle=color;ctx.textBaseline='top';
  for(let i=0;i<fit.lines.length;i++)ctx.fillText(fit.lines[i],x,y+i*fit.lineHeight);
  return fit.height;
}
export async function renderCard(canvas,{photo,fields,raw,size='square'}) {
  await document.fonts.ready;
  const dims=CARD_SIZES[size];if(!dims)throw new Error('카드 크기를 선택해주세요.');
  if(!photo)throw new Error('매물 사진을 먼저 추가해주세요.');
  // Draw offscreen. A failed layout never exports a partial or clipped card.
  const work=document.createElement('canvas');work.width=dims.width;work.height=dims.height;
  const ctx=work.getContext('2d');const pub=cardPublicInfo(raw);const safe={};for(const [k,v]of Object.entries(fields))safe[k]=sanitizeCardText(v,raw);
  const W=dims.width,H=dims.height,pad=48,width=W-pad*2;
  ctx.fillStyle='#f7f6ef';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#203e34';ctx.fillRect(0,0,W,88);
  block(ctx,'매물 브리핑',pad,26,300,46,26,22,650,'#e8efdb');
  block(ctx,pub.example?'가상 예시 · 실제 매물 아님':pub.type,510,30,W-510-pad,38,21,17,500,'#d6e3c4');
  const photoY=112,photoH=size==='portrait'?604:434;
  const image=editedPhoto(photo);
  const srcRatio=image.width/image.height,destRatio=width/photoH;
  const sw=srcRatio>destRatio?image.height*destRatio:image.width,sh=srcRatio>destRatio?image.height:image.width/destRatio;
  ctx.drawImage(image,(image.width-sw)/2,(image.height-sh)/2,sw,sh,pad,photoY,width,photoH);
  image.width=1;image.height=1;
  ctx.fillStyle='#203e34e8';ctx.fillRect(pad+18,photoY+photoH-58,225,38);
  block(ctx,`${photo.category} · 대표 사진`,pad+31,photoY+photoH-51,200,30,19,17,500,'#fff');
  let y=photoY+photoH+26;const footerY=H-130;
  y+=block(ctx,safe.title,pad,y,width,102,43,26,700)+10;
  if(pub.location){y+=block(ctx,pub.location,pad,y,width,42,21,16,400,'#758468')+10;}
  if(safe.price){y+=block(ctx,safe.price,pad,y,width,79,45,25,750)+8;}
  if(safe.area){y+=block(ctx,safe.area,pad,y,width,43,25,18,500)+8;}
  if(safe.features){const available=footerY-20-y;if(available<25)throw new Error('카드 문구가 너무 깁니다. 제목·가격·특징을 줄여주세요.');block(ctx,safe.features,pad,y,width,available,24,18,400,'#596b4c');}
  if(y>footerY-12)throw new Error('카드 정보가 너무 많습니다. 제목이나 문구를 줄여주세요.');
  ctx.fillStyle='#203e34';ctx.fillRect(0,footerY,W,130);
  const footer=[pub.office,pub.contact].filter(Boolean).join('\n');
  if(footer)block(ctx,footer,pad,footerY+24,width,88,27,18,500,'#f1f4e6');
  canvas.width=W;canvas.height=H;canvas.getContext('2d').drawImage(work,0,0);work.width=1;work.height=1;
  return {width:W,height:H};
}
