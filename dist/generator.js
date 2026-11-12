// Pure content adapter. A future server-backed generator can implement this contract.
export const FORMATS = { blog: '블로그 소개글', sns: 'SNS 게시글', card: '매물 소개 카드 문구', video: '30초 세로 영상 대본' };
const clean = value => String(value ?? '').trim();
const lines = value => clean(value).split(/\n+/).map(clean).filter(Boolean);

// Region is public; detailed addresses have a separate, opt-in field.
export function publicRegion(value) {
  const text = clean(value).replace(/[,\n\r]+/g, ' ');
  const tokens = text.split(/\s+/);
  const safe = [];
  for (const token of tokens) {
    if (/\d|(?:대로|로|길)$|(?:아파트|오피스텔|빌라|타워|맨션)|[동호]실?$/.test(token) && !/^[가-힣]+동$/.test(token)) break;
    // Korean road names can themselves end in 동; a number still stops parsing.
    if (/\d/.test(token)) break;
    safe.push(token);
  }
  return safe.join(' ');
}

export function normalize(raw) {
  const data = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === 'boolean' ? value : clean(value)]));
  data.publishAddress = raw.publishAddress === true;
  data.propertyType = ['아파트','빌라','오피스텔','원룸','상가','사무실','토지'].includes(data.propertyType) ? data.propertyType : '아파트';
  data.transaction = ['매매','전세','월세'].includes(data.transaction) ? data.transaction : '매매';
  data.region = publicRegion(data.region);
  data.tone = ['polite','friendly','concise'].includes(data.tone) ? data.tone : 'polite';
  data.example = raw.example === true;
  if (data.area && (!Number.isFinite(Number(data.area)) || Number(data.area) <= 0)) throw new Error('전용면적은 0보다 큰 숫자로 입력해주세요.');
  if (data.transaction === '매매') { data.deposit = ''; data.rent = ''; }
  else { data.salePrice = ''; if (data.transaction === '전세') data.rent = ''; }
  if (!data.publishAddress && data.exactAddress) {
    for (const key of ['features','floor','moveIn','parking','maintenance','office','contact']) {
      if (data[key]) data[key] = data[key].split(data.exactAddress).join('').trim();
    }
  }
  return data;
}

export function priceText(data) {
  if (data.transaction === '매매') return data.salePrice ? `매매가 ${data.salePrice}` : '';
  return [data.deposit && `보증금 ${data.deposit}`, data.transaction === '월세' && data.rent && `월세 ${data.rent}`].filter(Boolean).join(' / ');
}

export function generateDraft(raw, format = 'blog', variant = 0) {
  if (!(format in FORMATS)) throw new Error('지원하지 않는 콘텐츠 유형입니다.');
  const data = normalize(raw);
  const meaningful = [data.region, data.publishAddress && data.exactAddress, priceText(data), data.area, data.floor, data.direction, data.moveIn, data.maintenance, data.parking, data.features].some(Boolean);
  if (!meaningful) throw new Error('공개할 지역, 가격, 면적, 확인된 특징 중 한 가지 이상을 입력해주세요. 상세 주소만 입력했다면 공개 여부도 확인해주세요.');
  const location = [data.region, data.publishAddress && data.exactAddress].filter(Boolean).join(' · ');
  const baseTitle = [data.region, data.propertyType, data.transaction].filter(Boolean).join(' ');
  const titleSuffix = data.tone === 'concise' ? '' : data.tone === 'friendly' ? ' | 함께 살펴봐요' : ' | 매물 안내';
  const titles = [baseTitle + titleSuffix, `${baseTitle} · 기본 정보`, `${data.propertyType} ${data.transaction} 안내${data.region ? ` — ${data.region}` : ''}`];
  const title = titles[variant % titles.length];
  const facts = [
    location && `위치: ${location}`,
    `유형: ${data.propertyType} / ${data.transaction}`,
    priceText(data),
    data.area && `전용면적: ${data.area}㎡`,
    data.floor && `층: ${data.floor}`,
    data.direction && `방향: ${data.direction}`,
    data.moveIn && `입주 가능 시기: ${data.moveIn}`,
    data.maintenance && `관리비: ${data.maintenance}`,
    data.parking && `주차: ${data.parking}`,
  ].filter(Boolean);
  const features = lines(data.features);
  const contact = [data.office, data.contact].filter(Boolean).join(' · ');
  const intro = data.tone === 'friendly' ? '궁금한 매물 정보, 함께 살펴봐요.' : data.tone === 'concise' ? '' : '매물의 기본 정보와 확인된 특징을 안내드립니다.';
  const closing = data.tone === 'friendly' ? '더 궁금한 점이 있다면 문의해주세요.' : data.tone === 'concise' ? '상세 내용 문의' : '자세한 내용은 문의해 주시기 바랍니다.';
  const note = '입력된 사실을 바탕으로 한 초안입니다. 게시 전 가격·면적·입주 조건과 필요한 표시 사항을 확인해주세요.';
  let body;
  if (format === 'blog') {
    body = [intro, `매물 기본 정보\n${facts.map(x=>`• ${x}`).join('\n')}`, features.length && `확인된 특징\n${features.map(x=>`• ${x}`).join('\n')}`, contact && `${closing}\n${contact}`].filter(Boolean).join('\n\n');
  } else if (format === 'sns') {
    const hashtags = [data.region && `#${data.region.replace(/[^가-힣a-zA-Z0-9]/g,'')}`, `#${data.propertyType}`, `#${data.transaction}`].filter(Boolean).join(' ');
    body = [intro, facts.join('\n'), features.length && features.map(x=>`· ${x}`).join('\n'), contact && `${closing}\n${contact}`, hashtags].filter(Boolean).join('\n\n');
  } else if (format === 'card') {
    body = [facts.join('\n'), features.length && `확인된 포인트\n${features.map(x=>`• ${x}`).join('\n')}`, contact && `문의\n${contact}`].filter(Boolean).join('\n\n');
  } else {
    const core = [priceText(data), data.area && `전용면적 ${data.area}㎡`, data.floor, data.direction].filter(Boolean).join(' · ');
    const extra = [data.moveIn && `입주: ${data.moveIn}`, data.maintenance && `관리비: ${data.maintenance}`, data.parking && `주차: ${data.parking}`].filter(Boolean);
    body = [
      `[00–03초] 시작\n화면 자막: ${baseTitle}\n내레이션: ${data.tone === 'friendly' ? '매물 정보, 함께 살펴봐요.' : '매물 정보를 안내합니다.'}`,
      `[03–12초] 기본 정보\n화면 자막: ${core || baseTitle}${location ? `\n위치 자막: ${location}` : ''}\n내레이션: ${core ? `${core}입니다.` : `${baseTitle}입니다.`}`,
      `[12–25초] 확인된 정보\n${features.length ? `화면 자막: ${features.join(' / ')}\n내레이션: ${features.join('. ')}.` : `화면 자막: ${extra.length ? extra.join(' / ') : '매물 기본 정보'}\n내레이션: ${extra.length ? extra.join('. ') + '.' : '앞서 안내한 매물 정보를 확인해주세요.'}`}${features.length && extra.length ? `\n보조 자막: ${extra.join(' / ')}` : ''}`,
      `[25–30초] 마무리\n화면 자막: ${contact || baseTitle}\n내레이션: ${contact ? closing : '입력된 매물 정보를 확인해주세요.'}`,
      '편집 메모: 30초용 대본 초안입니다. 문구 길이에 따라 낭독 속도와 자막 분량을 조정해주세요. 사진·영상·음성 파일은 생성되지 않습니다.',
    ].join('\n\n');
  }
  if (data.example) body = `[가상 예시 · 실제 매물이 아닙니다]\n\n${body}`;
  return { title: data.example ? `[가상 예시] ${title}` : title, body, note, format, checks: clean(data.checks), example: data.example };
}

export function exportText(draft) {
  const label=draft.mode==='ai'?'AI 생성 초안':'템플릿 초안';
  return [`${label}${draft.edited?' · 사용자 수정본':''} · ${FORMATS[draft.format]}`,draft.title,draft.body,draft.cta,draft.hashtags?.join(' '),draft.note].filter(Boolean).join('\n\n');
}
