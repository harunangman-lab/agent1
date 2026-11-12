import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDraft, publicRegion, exportText } from '../dist/generator.js';

const sample = { propertyType:'아파트', transaction:'월세', region:'서울 마포구 연남동', exactAddress:'비공개로 12 101동 203호', salePrice:'9억원', deposit:'1억원', rent:'80만원', area:'59.8', features:'주방 창문 있음', checks:'입주일 재확인', office:'테스트사무소', contact:'02-000-0000' };
test('all formats exclude private address, pending facts and inactive prices', () => {
  for (const format of ['blog','sns','card','video']) {
    const draft = generateDraft(sample,format);
    const text = exportText(draft);
    assert.ok(!text.includes(sample.exactAddress));
    assert.ok(!text.includes(sample.checks));
    assert.ok(!text.includes('9억원'));
    assert.ok(text.includes('80만원'));
    assert.ok(text.includes('주방 창문 있음'));
    assert.equal(draft.checks, sample.checks);
    assert.ok(text.includes('게시 전'));
  }
});
test('detailed address requires explicit boolean opt-in', () => {
  for (const format of ['blog','sns','card','video']) {
    assert.ok(exportText(generateDraft({...sample,publishAddress:true},format)).includes(sample.exactAddress));
    assert.ok(!exportText(generateDraft({...sample,publishAddress:'false'},format)).includes(sample.exactAddress));
  }
});
test('public region strips road address and room numbers', () => {
  assert.equal(publicRegion('서울 마포구 동교로 123 101호'),'서울 마포구');
  assert.equal(publicRegion('서울 마포구 연남동 123-4 101동 202호'),'서울 마포구 연남동');
  assert.equal(publicRegion('서울특별시 강남구 테헤란로123'),'서울특별시 강남구');
});
test('omitted information is not invented', () => {
  const text=exportText(generateDraft({region:'제주시', propertyType:'토지',transaction:'매매'}));
  for (const item of ['주차:','방향:','관리비:','입주 가능 시기:','역 도보','수익 보장','최고의 투자처','미입력','undefined']) assert.ok(!text.includes(item));
});
test('deposit-only lease excludes hidden rent', () => {
  const text=exportText(generateDraft({...sample,transaction:'전세'}));
  assert.ok(text.includes('1억원')); assert.ok(!text.includes('80만원'));
});
test('samples remain labeled in exported output and rewriting preserves facts', () => {
  for (const format of ['blog','sns','card','video']) {
    const first=generateDraft({...sample,example:true},format,0);
    const next=generateDraft({...sample,example:true},format,1);
    assert.notEqual(first.title,next.title);
    assert.ok(exportText(next).includes('가상 예시'));
    assert.equal(first.body,next.body);
  }
});
test('empty input and invalid area are rejected', () => {
  assert.throws(()=>generateDraft({}),/한 가지 이상/);
  assert.throws(()=>generateDraft({...sample,area:'-1'}),/0보다/);
});
