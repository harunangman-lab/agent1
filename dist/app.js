import { FORMATS, generateDraft, exportText } from './generator.js';

const $ = selector => document.querySelector(selector);
const form = $('#property-form');
let format = 'blog';
let currentDraft = null;
let snapshot = null;
let variant = 0;
let example = false;
let stale = false;
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

function readInput() {
  return { ...Object.fromEntries(new FormData(form)), publishAddress: form.elements.publishAddress.checked, example };
}

function syncTransaction() {
  const transaction = form.elements.transaction.value;
  $('#sale-field').hidden = transaction !== '매매';
  $('#deposit-field').hidden = transaction === '매매';
  $('#rent-field').hidden = transaction !== '월세';
  form.elements.salePrice.disabled = transaction !== '매매';
  form.elements.deposit.disabled = transaction === '매매';
  form.elements.rent.disabled = transaction !== '월세';
}

function render(draft) {
  currentDraft = draft;
  $('#empty-state').hidden = true;
  $('#result').hidden = false;
  $('#result-format').textContent = FORMATS[draft.format];
  $('#result-example').hidden = !draft.example;
  $('#result-title').textContent = draft.title;
  $('#result-text').textContent = draft.body;
  $('#pending-checks').hidden = !draft.checks;
  $('#checks-text').textContent = draft.checks;
  $('#stale-message').hidden = !stale;
  for (const id of ['copy','download','regenerate']) $(`#${id}`).disabled = false;
}

function generate({ next = false } = {}) {
  $('#form-error').hidden = true;
  if (!form.reportValidity()) return;
  try {
    const raw = readInput();
    const nextVariant = next ? variant + 1 : 0;
    const draft = generateDraft(raw, format, nextVariant);
    snapshot = raw;
    variant = nextVariant;
    stale = false;
    render(draft);
    toast(next ? '입력된 정보로 초안을 다시 작성했어요.' : '홍보 콘텐츠 초안이 준비되었어요.');
    if (window.matchMedia('(max-width: 760px)').matches) $('#output-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    $('#form-error').textContent = error.message;
    $('#form-error').hidden = false;
    $('#form-error').scrollIntoView({ block: 'nearest' });
  }
}

form.addEventListener('submit', event => { event.preventDefault(); generate(); });
form.addEventListener('input', () => {
  syncTransaction();
  if (currentDraft) { stale = true; $('#stale-message').hidden = false; }
});
form.addEventListener('change', syncTransaction);

const tabs = [...document.querySelectorAll('[data-format]')];
function selectTab(tab) {
  format = tab.dataset.format;
  for (const other of tabs) {
    other.setAttribute('aria-selected', String(other === tab));
    other.tabIndex = other === tab ? 0 : -1;
  }
  $('#output-body').setAttribute('aria-labelledby', tab.id);
  if (snapshot) render(generateDraft(snapshot, format, variant));
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const i = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); selectTab(tabs[next]);
  });
}

$('#example').addEventListener('click', () => {
  form.reset();
  const sample = { propertyType:'아파트', transaction:'전세', region:'서울 마포구 연남동', exactAddress:'가상로 12, 예시동 302호', deposit:'3억 5,000만원', area:'59.8', floor:'3층 / 총 5층', direction:'남향', moveIn:'2027년 2월 협의', maintenance:'월 12만원, 수도 별도', parking:'세대당 1대 가능', features:'거실 남향\n주방 창문 있음\n거실과 방 2개 구조', checks:'관리비 포함 항목 재확인\n입주 가능일 최종 협의', office:'한빛공인중개사사무소 (가상)', contact:'02-000-0000' };
  for (const [key,value] of Object.entries(sample)) form.elements[key].value = value;
  example = true;
  $('#example-banner').hidden = false;
  $('#form-error').hidden = true;
  syncTransaction();
  if (currentDraft) { stale = true; $('#stale-message').hidden = false; }
  toast('가상 예시를 입력했어요. 만들기 버튼을 눌러보세요.');
});

$('#regenerate').addEventListener('click', () => generate({ next: true }));
$('#copy').addEventListener('click', async () => {
  if (!currentDraft) return;
  const text = exportText(currentDraft);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast('제목과 본문이 복사되었어요.');
  } catch {
    $('#copy-text').value = text;
    $('#copy-dialog').showModal();
    $('#copy-text').focus(); $('#copy-text').select();
  }
});
$('#close-copy').addEventListener('click', () => $('#copy-dialog').close());
$('#select-copy').addEventListener('click', () => { $('#copy-text').focus(); $('#copy-text').select(); });
$('#download').addEventListener('click', () => {
  if (!currentDraft) return;
  const blob = new Blob(['\uFEFF', exportText(currentDraft)], { type:'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `매물홍보_${FORMATS[currentDraft.format].replaceAll(' ','_')}_${new Date().toLocaleDateString('sv-SE')}.txt`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('TXT 파일 다운로드를 시작했어요.');
});
syncTransaction();
