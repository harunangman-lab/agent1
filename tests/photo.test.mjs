import test from 'node:test';
import assert from 'node:assert/strict';
import {fileProblem,PHOTO_LIMITS,defaultEdit,cropRect,reorder,fitText,cardFields,cardPublicInfo,sanitizeCardText} from '../dist/photo-core.js';
import {templateDraft} from '../dist/content-policy.js';
const file={name:'room.jpg',type:'image/jpeg',size:1000};
test('photo intake enforces formats, individual/total size and count',()=>{
  assert.equal(fileProblem(file,0,0),'');
  assert.match(fileProblem({...file,name:'document.svg',type:'image/svg+xml'},0,0),/JPG/);
  assert.match(fileProblem({...file,name:'photo.jpg',type:'text/plain'},0,0),/JPG/);
  assert.match(fileProblem({...file,size:PHOTO_LIMITS.perFile+1},0,0),/10MB/);
  assert.match(fileProblem(file,10,0),/10장/);
  assert.match(fileProblem(file,1,PHOTO_LIMITS.total),/50MB/);
  assert.match(fileProblem({...file,size:0},0,0),/없는/);
});
test('crop remains inside rotated bounds for all quadrants, ratios and focus positions',()=>{
  for(const rotation of [0,90,180,270])for(const ratio of ['landscape','standard','square','original'])for(const zoom of [1,2,3])for(const position of [0,50,100]){
    const r=cropRect(1600,900,{...defaultEdit(),rotation,ratio,zoom,x:position,y:position});
    assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.width<=r.rotatedWidth+.001);assert.ok(r.y+r.height<=r.rotatedHeight+.001);
    assert.ok(Math.abs(r.width/r.height-r.ratio)<.00001);
  }
});
test('reordering keeps stable identity and never mutates original array',()=>{
  const photos=[{id:'a'},{id:'b'},{id:'c'}];
  assert.deepEqual(reorder(photos,'b',-1).map(p=>p.id),['b','a','c']);
  assert.deepEqual(reorder(photos,'c',1),photos);assert.deepEqual(photos.map(p=>p.id),['a','b','c']);
});
test('text fitting uses wrapping/shrinking and refuses text that would clip',()=>{
  const measure=(text,size)=>Array.from(text).length*size;
  const fit=fitText('가나다라마바사아자차',{width:100,height:80,maxFont:30,minFont:12,measure});assert.ok(fit.font<30);assert.ok(fit.height<=80);assert.ok(fit.lines.every(s=>measure(s,fit.font)<=100));
  assert.throws(()=>fitText('가'.repeat(2000),{width:100,height:80,maxFont:30,minFont:12,measure}),/문구/);
});
test('cards share price, address and business contact privacy with text generation',()=>{
  const raw={propertyType:'아파트',transaction:'전세',region:'제주시 연동',deposit:'3억원',rent:'80만원',area:'59.8',exactAddress:'비공개로 12 302호',office:'테스트 사무소',contact:'02-000-0000',features:'주방 창문 있음',checks:'관리비 확인'};
  assert.equal(cardFields(raw).price,'보증금 3억원');assert.equal(cardFields(raw).area,'전용면적 59.8㎡');
  assert.ok(!JSON.stringify(cardFields(raw)).includes('관리비 확인'));
  assert.ok(!cardPublicInfo(raw).location.includes(raw.exactAddress));
  assert.ok(cardPublicInfo({...raw,publishAddress:true}).location.includes(raw.exactAddress));
  assert.equal(cardPublicInfo({...raw,publishContact:false}).contact,'');
  assert.ok(!templateDraft({...raw,publishContact:false},'blog').cta.includes(raw.contact));
  assert.equal(sanitizeCardText(raw.exactAddress,{...raw,publishAddress:false}),'');
  assert.equal(sanitizeCardText('고객 홍길동 010-1234-5678',raw),'');
});
