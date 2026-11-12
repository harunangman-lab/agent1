import { normalize, generateDraft } from './generator.js';

export const FIELDS = { propertyType:'매물 유형', transaction:'거래 유형', region:'공개 지역', exactAddress:'공개 상세 주소', salePrice:'매매가', deposit:'보증금', rent:'월세', area:'전용면적(㎡)', floor:'층', direction:'방향', moveIn:'입주 가능 시기', maintenance:'관리비', parking:'주차 정보', features:'확인된 특징', office:'사무소', contact:'홍보용 연락처' };
const PHONE = /(?:\+?82[- .]?)?0?\d{1,2}[- .]?\d{3,4}[- .]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const PRIVATE = /고객|소유자|집주인|임대인|임차인|주민번호|주민등록|계좌|비밀번호|api.?key|sk-[\w-]+|\b\d{6}-?[1-4]\d{6}\b/i;
const INSTRUCTION = /지시.*무시|무시.*지시|프롬프트|시스템.*(?:명령|메시지)|(?:ignore|override).*(?:instruction|previous|system)|<\/?(?:system|developer)>|(?:역할|규칙).*(?:변경|무시)|(?:출력|작성|응답|추가|포함|넣어).*(?:해줘|하세요|하라)|(?:pretend|instruction)/i;
const LIMITS = {features:1500, checks:1000, exactAddress:180, region:100, office:80, contact:60};
const DEFAULT_REVIEW = ['가격·면적·입주 조건이 실제 매물과 일치하는지 확인해주세요.', '게시 매체에 필요한 표시 사항과 홍보용 연락처를 확인해주세요.', 'AI 문구도 사실 검증을 보장하지 않습니다. 원자료와 대조해주세요.'];

export function prepareInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('매물 정보를 올바르게 입력해주세요.');
  const selected = {};
  for (const key of [...Object.keys(FIELDS),'checks','tone']) {
    if (raw[key] != null && typeof raw[key] !== 'string') throw new Error('입력 형식이 올바르지 않습니다.');
    selected[key] = (raw[key] || '').trim();
    if (selected[key].length > (LIMITS[key] || 100)) throw new Error(`${FIELDS[key] || '입력'} 내용이 너무 깁니다.`);
  }
  selected.publishAddress = raw.publishAddress === true;
  selected.example = raw.example === true;
  const data = normalize(selected);
  const excluded = [];
  // Checks and the private address are never sent to the model.
  data.exactAddress = data.publishAddress ? data.exactAddress : '';
  for (const key of Object.keys(FIELDS)) {
    if (key === 'contact') continue; // Only this explicitly public business field may hold a phone number.
    const safe = (data[key] || '').split('\n').filter(line => {
      const unsafe = PHONE.test(line) || EMAIL.test(line) || PRIVATE.test(line) || INSTRUCTION.test(line);
      if (unsafe) excluded.push(key);
      return !unsafe;
    }).join('\n').trim();
    data[key] = safe;
  }
  if (data.contact && (!/^[+\d\s().-]+$/.test(data.contact) || !PHONE.test(data.contact))) { excluded.push('contact'); data.contact = ''; }
  const checks = data.checks.split('\n').filter(line => line && !PHONE.test(line) && !EMAIL.test(line) && !PRIVATE.test(line)).join('\n');
  data.checks = checks;
  // Validation is identical for template and AI inputs.
  generateDraft(data, 'blog');
  const facts = [];
  for (const [key,label] of Object.entries(FIELDS)) {
    if (key === 'office' || key === 'contact' || !data[key]) continue;
    if (key === 'features') data.features.split('\n').filter(Boolean).forEach((value,index) => facts.push({id:`feature_${index}`,label:'확인된 특징',value}));
    else facts.push({id:key,label,value:data[key]});
  }
  const reviewItems = [...(checks ? checks.split('\n') : []), ...DEFAULT_REVIEW];
  if (excluded.length) reviewItems.unshift('개인정보·연락처 또는 지시문으로 보이는 입력 일부를 생성 정보에서 제외했습니다.');
  if (raw.exactAddress && !data.publishAddress) reviewItems.push('상세 주소·호수는 비공개로 처리했습니다.');
  return {data,facts,reviewItems,excluded:[...new Set(excluded)]};
}

export function publicContact(data) { return [data.office,data.contact].filter(Boolean).join(' · '); }

export function templateDraft(raw, format, variant = 0) {
  const prepared = prepareInput(raw);
  const base = generateDraft(prepared.data,format,variant);
  const cta = publicContact(prepared.data);
  // Keep video ending in its timed segment; separate contact for other formats.
  if (format !== 'video' && cta) {
    const endings = [`자세한 내용은 문의해 주시기 바랍니다.\n${cta}`,`더 궁금한 점이 있다면 문의해주세요.\n${cta}`,`상세 내용 문의\n${cta}`,`문의\n${cta}`];
    for (const ending of endings) base.body = base.body.replace(ending,'').trim();
  }
  return {...base,mode:'template',cta:format === 'video' ? '' : cta,hashtags:[],usedFacts:[...prepared.facts,...businessFacts(prepared.data)],reviewItems:prepared.reviewItems};
}

export function businessFacts(data) {
  return ['office','contact'].filter(key=>data[key]).map(key=>({id:key,label:FIELDS[key],value:data[key]}));
}

export function containsPrivateText(text) { return PHONE.test(text) || EMAIL.test(text) || PRIVATE.test(text); }
