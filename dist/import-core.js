export const IMPORT_FIELDS = {
  propertyType:'매물 유형',transaction:'거래 유형',region:'공개 지역',exactAddress:'상세 주소 (비공개)',
  salePrice:'매매가',deposit:'보증금',rent:'월세',area:'전용면적(㎡)',floor:'층',direction:'방향',moveIn:'입주 가능 시기',maintenance:'관리비',parking:'주차 정보',features:'특징·장점 (확인 필요)',checks:'추가 확인 사항',
};
export const TYPES=['아파트','빌라','오피스텔','원룸','상가','사무실','토지'];
export const TRANSACTIONS=['매매','전세','월세'];
export const DIRECTIONS=['남향','남동향','남서향','동향','서향','북향','북동향','북서향'];
const aliases={propertyType:['매물유형','매물종류','건물유형','propertytype'],transaction:['거래유형','거래종류','거래','transaction'],region:['공개지역','지역','소재동','동지역','region'],exactAddress:['주소','소재지','상세주소','도로명주소','exactaddress'],salePrice:['매매가','매매가격','saleprice'],deposit:['보증금','전세금','전세가','deposit'],rent:['월세','월임대료','rent'],area:['전용면적','전용면적m2','전용면적㎡','area'],floor:['층','해당층','층수','floor'],direction:['방향','향','direction'],moveIn:['입주가능시기','입주일','입주가능일','movein'],maintenance:['관리비','maintenance'],parking:['주차','주차정보','parking'],features:['특징','특징장점','장점','매물설명','확인된특징과장점','features'],checks:['확인사항','추가확인사항','추가확인이필요한사항','checks']};
const normalizeHeader=s=>String(s||'').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/[\s·_\-]/g,'');
export function suggestMapping(headers){return Object.fromEntries(Object.keys(IMPORT_FIELDS).map(key=>[key,headers.findIndex(h=>aliases[key].includes(normalizeHeader(h))&&!(key==='area'&&/평|공급|계약|연면적|대지|건축/.test(String(h))))]));}
export function cellText(cell){if(cell==null)return '';return String(cell).trim().slice(0,2000);}
export function rowCandidate(row,headers,mapping){
 const fields={};
 for(const key of Object.keys(IMPORT_FIELDS)){
   const i=Number(mapping[key]);if(!Number.isInteger(i)||i<0)continue;
   let value=cellText(row[i]);if(!value)continue;
   const header=String(headers[i]||'');
   if(['salePrice','deposit','rent','maintenance'].includes(key)&&/^[\d,.]+$/.test(value)){
     if(/만원/.test(header))value+='만원';else if(/억원/.test(header))value+='억원';else if(/\(원\)|\[원\]/.test(header))value+='원';
   }
   if(key==='area'){
     if(/평|공급|계약|연면적|대지|건축/.test(header)||/평/.test(value))continue;
     value=value.replace(/\s*(?:㎡|m²|m2)\s*$/i,'');
   }
   fields[key]=value;
 }
 return {fields,notes:['가격 단위·전용면적 여부를 원자료와 대조해주세요. 주소에서 공개 지역을 별도로 확인해주세요.'],evidence:{}};
}
export function safeImportedValue(key,value){
 let v=cellText(value);
 if(/(?:고객|소유자|집주인|임대인|임차인|주민번호|계좌|비밀번호)|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:0\d{1,2}[- .]?\d{3,4}[- .]?\d{4})|지시.*무시|무시.*지시|프롬프트|<\/?(?:system|developer)>/i.test(v))return '';
 if(key==='propertyType')return TYPES.includes(v)?v:'';
 if(key==='transaction')return TRANSACTIONS.includes(v)?v:'';
 if(key==='direction')return DIRECTIONS.includes(v)?v:'';
 if(key==='area')return /^\d+(?:\.\d{1,2})?$/.test(v)&&Number(v)>0&&Number(v)<=100000000?v:'';
 return v;
}
export function buildImportPatch(values,selected,{confirmFeatures=false}={}){
 const patch=Object.fromEntries(Object.keys(IMPORT_FIELDS).map(k=>[k,'']));
 const notes=[];
 for(const key of Object.keys(IMPORT_FIELDS)){
   if(!selected.has(key))continue;
   const value=safeImportedValue(key,values[key]);
   if(!value&&cellText(values[key]))notes.push(`${IMPORT_FIELDS[key]}: 형식 또는 개인정보 확인 후 직접 입력 필요`);
   if(key==='features'&&!confirmFeatures){if(value)notes.push(`자료에 기재된 특징 (직접 확인 필요): ${value}`);continue;}
   patch[key]=value;
 }
 patch.checks=[patch.checks,...notes].filter(Boolean).join('\n').slice(0,1000);
 return patch;
}
