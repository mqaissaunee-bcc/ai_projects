const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/claude/faculty_schedule.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);
let fails = 0;
const ok = (label, cond) => { console.log((cond ? '  PASS  ' : '! FAIL  ') + label); if (!cond) fails++; };

// captured downloads
const downloads = [];
window.URL.createObjectURL = b => { downloads.push(b); return 'blob:x'; };
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
window.confirm = () => false;

setTimeout(() => {
  ok('data status populated', $('dataStatus').textContent.length > 0);

  // 1. faculty search
  const s = $('facSearch');
  s.value = 'qais';
  s.dispatchEvent(new window.Event('input', { bubbles: true }));
  const results = $('facResults').querySelectorAll('button');
  ok('search finds instructor', results.length >= 1);
  results[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  ok('faculty chip added', $('facChips').querySelectorAll('.chip').length === 1);
  const secs = $('sectionList').querySelectorAll('.sec');
  ok('sections listed (' + secs.length + ')', secs.length > 0);
  ok('name auto-filled into profile', $('fName').value.length > 0);

  // 2. sheet + grid
  let sheet = doc.querySelector('.sheet');
  ok('sheet rendered', !!sheet);
  ok('weekly grid rendered', !!doc.querySelector('.grid'));
  const blocks = doc.querySelectorAll('.blk');
  ok('course blocks drawn (' + blocks.length + ')', blocks.length > 0);
  ok('estimated-time banner shown', /estimated end time/.test($('banners').textContent));
  ok('async sections listed separately', /Not on the weekly grid/.test(sheet.textContent));
  ok('course table rendered', !!sheet.querySelector('table.tbl'));

  // 3. block geometry sanity
  const geom = [...blocks].every(b => /^calc\(var\(--rowh\) \* [0-9.]+/.test(b.style.height) && /^calc\(var\(--rowh\)/.test(b.style.top));
  ok('block geometry positive', geom);

  // 4. office hours
  const days = $('cDays').querySelectorAll('input');
  days[0].checked = true; days[2].checked = true;
  $('cLabel').value = 'Office Hours';
  $('cLoc').value = 'MAS 212';
  $('cStart').value = '10:00'; $('cEnd').value = '11:30';
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('office-hours block added', $('customList').querySelectorAll('.custom-item').length === 1);
  ok('office hours on grid', doc.querySelectorAll('.blk.oh').length === 2);

  // 5. inline section edit (end time + room)
  const firstSec = $('sectionList').querySelector('.sec');
  const editBtn = firstSec.querySelectorAll('button')[0];
  editBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const edit = firstSec.querySelector('.sec-edit');
  const times = edit.querySelectorAll('input[type=time]');
  times[1].value = '12:15';
  edit.querySelector('input[type=text]').value = 'MAS 214';
  [...edit.querySelectorAll('.btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('room override reaches the sheet', /MAS 214/.test(doc.querySelector('.sheet').textContent));
  const before = doc.querySelectorAll('.blk').length;
  [...edit.querySelectorAll('.btn')].find(b => /Add a second/.test(b.textContent))
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const rows2 = edit.querySelectorAll('.pattern');
  ok('second pattern row added', rows2.length === 2);
  rows2[1].querySelector('input[value=F]').checked = true;
  rows2[1].querySelectorAll('input[type=time]')[0].value = '09:00';
  rows2[1].querySelectorAll('input[type=time]')[1].value = '10:50';
  rows2[1].querySelector('input[type=text]').value = 'MAS 118';
  [...edit.querySelectorAll('.btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('second pattern draws a new block', doc.querySelectorAll('.blk').length === before + 1);
  ok('second pattern room on sheet', /MAS 118/.test(doc.querySelector('.sheet').textContent));

  // 6. options
  $('optEnroll').checked = true;
  $('optEnroll').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('enrollment column toggles on', /Enrolled/.test(doc.querySelector('.sheet').textContent));
  $('opt24').checked = true;
  $('opt24').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('24-hour times applied', /1[0-9]:\d\d/.test(doc.querySelector('.blk').textContent));
  $('opt24').checked = false;
  $('opt24').dispatchEvent(new window.Event('change', { bubbles: true }));

  // 7. exports
  $('btnCsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('CSV export triggered', downloads.some(d => typeof d === 'string' && d.endsWith('.csv')));

  $('btnIcs').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('ICS blocked without term dates', !downloads.some(d => typeof d === 'string' && d.endsWith('.ics')));
  $('fTermStart').value = '2026-09-09'; $('fTermStart').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('fTermEnd').value = '2026-12-22'; $('fTermEnd').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('btnIcs').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('ICS exported with term dates', downloads.some(d => typeof d === 'string' && d.endsWith('.ics')));

  $('btnSave').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('draft saved', downloads.some(d => typeof d === 'string' && d.endsWith('draft.json')));

  // 8. persistence
  ok('localStorage written', !!window.localStorage.getItem('bcc-faculty-schedule-v1'));

  // 9. chair mode: second faculty -> two sheets
  const s2 = $('facSearch');
  s2.value = 'ma';
  s2.dispatchEvent(new window.Event('input', { bubbles: true }));
  const r2 = [...$('facResults').querySelectorAll('button')].find(b => !/Qaissaunee/.test(b.textContent));
  r2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('two sheets in chair mode', doc.querySelectorAll('.sheet').length === 2);

  // 10. accessibility basics
  ok('skip link present', !!doc.querySelector('.skip-link'));
  ok('all inputs labelled', [...doc.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, textarea')]
    .every(i => doc.querySelector('label[for="' + i.id + '"]') || i.getAttribute('aria-label') || i.closest('label')));
  ok('no inline handlers', !/ on(click|change|input)=/.test(html));

  console.log(fails ? '\n' + fails + ' FAILURES' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);
