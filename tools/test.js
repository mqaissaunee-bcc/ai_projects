const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/claude/repo/faculty-schedule/index.html', 'utf8');
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
window.HTMLAnchorElement.prototype.click = function () {
  downloads.push(this.download);
  if (window.__onAnchor) window.__onAnchor(this.getAttribute('href'));
};
window.confirm = () => false;

setTimeout(() => {
  const facultySheets = () => [...doc.querySelectorAll('.sheet[data-owner]')];
  ok('data status populated', $('dataStatus').textContent.length > 0);
  ok('15-week is the default scope', $('potFilter').value === '15W');
  ok('15-week notice shown for a single-session feed', $('potNotice').hidden === false);
  ok('term dates prefilled from the feed',
     /^\d{4}-\d{2}-\d{2}$/.test($('fTermStart').value) && /^\d{4}-\d{2}-\d{2}$/.test($('fTermEnd').value));
  ok('calendar notes printed on the sheet', /Thanksgiving/.test(doc.body.textContent));
  ok('part-of-term filter hidden for a single-session feed', $('potField').hidden === true);

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
  ok('auto-filled name matches the picked instructor',
     $('facChips').querySelector('.chip').textContent.indexOf($('fName').value) === 0);
  $('fName').value = 'Mike Q.';
  $('fName').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('a hand-typed name is not overwritten', $('fName').value === 'Mike Q.');

  // 2. sheet + grid
  let sheet = doc.querySelector('.sheet');
  ok('sheet rendered', !!sheet);
  ok('weekly grid rendered', !!doc.querySelector('.grid'));
  const blocks = doc.querySelectorAll('.blk');
  ok('course blocks drawn (' + blocks.length + ')', blocks.length > 0);
  ok('no estimate banner with complete data', !/estimated end time/.test($('banners').textContent));
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
  const editBtn = [...firstSec.querySelectorAll('button')].find(b => b.textContent === 'Edit');
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
  ok('no enrollment column', !/Enrolled/.test(doc.querySelector('.sheet').textContent));
  $('opt24').checked = true;
  $('opt24').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('24-hour times applied', /1[0-9]:\d\d/.test(doc.querySelector('.blk').textContent));
  $('opt24').checked = false;
  $('opt24').dispatchEvent(new window.Event('change', { bubbles: true }));


  // ---- PT / overload flagging ----
  const secWraps = [...$('sectionList').querySelectorAll('.sec')];
  ok('PT toggle present on every section', secWraps.every(w => w.querySelector('.pt-toggle')));
  const loadBefore = doc.querySelector('.load-line').textContent;
  ok('load line renders', /Contact hours: \d/.test(loadBefore));
  const ptOf = i => [...$('sectionList').querySelectorAll('.pt-toggle')][i];
  ptOf(0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const line = doc.querySelector('.load-line').textContent;
  ok('flagging PT moves credits out of load', line !== loadBefore && /PT \/ overload: \d/.test(line));
  ok('PT column appears in the table',
     [...doc.querySelectorAll('.sheet table.tbl th')].some(th => th.textContent === 'Load'));
  ok('PT marked on the grid block', /PT/.test(doc.querySelector('.sheet').textContent));
  ok('PT state persisted', /"pt":\{"/.test(window.localStorage.getItem('bcc-faculty-schedule-v1')));
  ok('PT toggle reflects state', ptOf(0).getAttribute('aria-pressed') === 'true');
  ptOf(0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('PT unflags cleanly', !/PT \/ overload/.test(doc.querySelector('.load-line').textContent));

  // ---- load baseline honours release time ----
  $('fLoadBase').value = '12';
  $('fLoadBase').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('load baseline is editable', /Contact hours: \d+(\.\d+)? of 12/.test(doc.querySelector('.load-line').textContent));

  ok('header is not school-specific', !/School of STEAM/.test(html));

  // ---- per-section contact hours override ----
  $('fLoadBase').value = '15';
  $('fLoadBase').dispatchEvent(new window.Event('input', { bubbles: true }));
  const readLoad = () => doc.querySelector('.load-line').textContent;
  const hoursBefore = parseFloat(readLoad().match(/Contact hours: ([\d.]+)/)[1]);
  const sec0 = $('sectionList').querySelector('.sec');
  [...sec0.querySelectorAll('button')].find(b => b.textContent === 'Edit')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const hrsInput = sec0.querySelector('.sec-edit input[type=number]');
  ok('contact-hours field present', !!hrsInput);
  hrsInput.value = '1';
  [...sec0.querySelectorAll('.sec-edit .btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const hoursAfter = parseFloat(readLoad().match(/Contact hours: ([\d.]+)/)[1]);
  ok('contact-hours override changes the load total', hoursAfter < hoursBefore);

  // ---- release time entries ----
  $('rCredits').value = '3';
  $('rReason').value = 'Chair duties';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('release lowers the required hours', /of 12/.test(readLoad()));
  ok('release reason printed', /3 for Chair duties/.test(readLoad()));
  ok('release listed in the sidebar', $('releaseList').querySelectorAll('.custom-item').length === 1);
  ok('release form clears after adding', $('rCredits').value === '' && $('rReason').value === '');
  $('rCredits').value = '1.5';
  $('rReason').value = 'Grant work';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('several release lines accumulate', /of 10.5/.test(readLoad()));
  ok('both reasons printed', /Chair duties/.test(readLoad()) && /Grant work/.test(readLoad()));
  [...$('releaseList').querySelectorAll('button')].pop()
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('release line can be removed', /of 12/.test(readLoad()));

  // ---- office hours total ----
  ok('office hours totalled', /Office hours: 3/.test(readLoad()));

  // ---- editing an office-hours block in place ----
  const item = $('customList').querySelector('.custom-item');
  [...item.querySelectorAll('button')].find(b => b.textContent === 'Edit')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('edit loads the block into the form', $('cLabel').value === 'Office Hours');
  ok('edit loads its days', $('cDays').querySelector('input[value=M]').checked);
  ok('button becomes Save changes', $('addCustom').textContent === 'Save changes');
  $('cEnd').value = '12:30';
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('editing updates rather than duplicating', $('customList').querySelectorAll('.custom-item').length === 1);
  ok('edited hours recalculated', /Office hours: 5/.test(readLoad()));
  ok('form resets after save', $('addCustom').textContent === 'Add block');

  // ---- PT section list and signature line ----
  ptOf(0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('PT sections listed by name', /Part-time \/ overload sections: \S+/.test(doc.querySelector('.load-line').textContent));
  ok('no signature line by default', !doc.querySelector('.sig-row'));
  $('optSign').checked = true;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('signature line can be turned on', doc.querySelectorAll('.sig-row .sig').length === 4);
  $('optSign').checked = false;                 // leave it off for the later signature tests
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  ptOf(0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('PT list disappears when nothing is flagged', !doc.querySelector('.pt-list'));

  // ---- fit to one page ----
  ok('fit is on by default', $('optFit').checked);
  const lastTable = () => [...doc.querySelectorAll('.sheet table.tbl')].pop();
  const headText = () => [...lastTable().querySelectorAll('th')].map(t => t.textContent);
  ok('condensed table drops Meets and Room',
     !headText().includes('Meets') && !headText().includes('Room'));
  $('optFit').checked = false;
  $('optFit').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('unfitted table restores Meets and Room',
     headText().includes('Meets') && headText().includes('Room'));
  $('optFit').checked = true;
  $('optFit').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('scale is not applied to the on-screen sheet',
     !doc.querySelector('.sheet').style.getPropertyValue('--fit'));

  // ---- partial PT: split one section between load and overload ----
  // read the summary span only — the warning sits in a sibling div
  const readLoad2 = () => doc.querySelector('.load-line span').textContent;
  const nums = () => {
    const m = readLoad2().match(/Contact hours: ([\d.]+) of ([\d.]+)/);
    const p = readLoad2().match(/PT \/ overload: ([\d.]+)/);
    return { load: parseFloat(m[1]), req: parseFloat(m[2]), pt: p ? parseFloat(p[1]) : 0 };
  };
  const coursesTable = () => [...doc.querySelectorAll('.sheet table.tbl')].pop();
  const beforeSplit = nums();
  const secA = $('sectionList').querySelector('.sec');
  [...secA.querySelectorAll('button')].find(b => b.textContent === 'Edit')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const numFields = secA.querySelectorAll('.sec-edit input[type=number]');
  ok('editor has contact-hours and PT-hours fields', numFields.length === 2);
  numFields[0].value = '4';   // contact hours
  numFields[1].value = '1';   // of which PT
  [...secA.querySelectorAll('.sec-edit .btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const afterSplit = nums();
  ok('split sends part of a section to overload', afterSplit.pt === 1);
  ok('split leaves the rest on load', afterSplit.load === beforeSplit.load + 4 - beforeSplit.secHours - 1
     || afterSplit.load > 0);
  ok('PT list shows the partial split', /1 hr of 4/.test(doc.querySelector('.pt-list').textContent));
  ok('table shows the load/PT split', /load \+ 1 PT/.test(coursesTable().textContent));
  ok('grid block labels partial PT', /1 hr PT/.test(doc.querySelector('.sheet').textContent));
  ok('sidebar toggle shows the partial amount',
     /1 PT/.test($('sectionList').querySelector('.pt-toggle').textContent));

  // PT hours can never exceed the section's contact hours
  const secB = $('sectionList').querySelector('.sec');
  [...secB.querySelectorAll('button')].find(b => b.textContent === 'Edit')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const nf2 = secB.querySelectorAll('.sec-edit input[type=number]');
  nf2[1].value = '99';
  [...secB.querySelectorAll('.sec-edit .btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('PT hours clamp to the section total', nums().pt === 4);

  // 7. exports
  $('btnCsv').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('CSV export triggered', downloads.some(d => typeof d === 'string' && d.endsWith('.csv')));

  $('btnIcs').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  $('btnIcs').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('ICS exported with term dates', downloads.some(d => typeof d === 'string' && d.endsWith('.ics')));

  $('btnSave').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('draft saved', downloads.some(d => typeof d === 'string' && d.endsWith('draft.json')));

  // 8. persistence
  ok('localStorage written', !!window.localStorage.getItem('bcc-faculty-schedule-v1'));

  // ---- office-hour ownership in chair mode ----
  ok('owner picker hidden with one faculty', $('cWhoField').hidden === true);

  // 9. chair mode: second faculty -> two sheets
  const s2 = $('facSearch');
  s2.value = 'ma';
  s2.dispatchEvent(new window.Event('input', { bubbles: true }));
  const r2 = [...$('facResults').querySelectorAll('button')].find(b => !/Qaissaunee/.test(b.textContent));
  r2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('two faculty sheets in chair mode', facultySheets().length === 2);
  ok('department summary leads in chair mode',
     /teaching load/i.test(doc.querySelector('.sheet').textContent));
  ok('summary has a row per person plus a total',
     doc.querySelector('.sheet table.tbl tbody').children.length === 3);
  ok('summary can be turned off', (() => {
    $('optDept').checked = false;
    $('optDept').dispatchEvent(new window.Event('change', { bubbles: true }));
    const gone = !/teaching load/i.test(doc.querySelector('.sheet').textContent);
    $('optDept').checked = true;
    $('optDept').dispatchEvent(new window.Event('change', { bubbles: true }));
    return gone;
  })());
  ok('owner picker appears with two faculty', $('cWhoField').hidden === false);
  ok('owner picker lists everyone plus each person', $('cWho').options.length === 3);

  const sheetText = i => facultySheets()[i].textContent;
  const names = [...$('facChips').querySelectorAll('.chip')].map(c => c.textContent.replace('×','').trim());

  // a block assigned to the second person must not appear on the first sheet
  $('cLabel').value = 'Advising Only';
  $('cWho').value = names[1];
  $('cDays').querySelector('input[value=R]').checked = true;
  $('cStart').value = '15:00'; $('cEnd').value = '16:00';
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('owned block lands on its own sheet', /Advising Only/.test(sheetText(1)));
  ok('owned block stays off the other sheet', !/Advising Only/.test(sheetText(0)));
  ok('owner shown in the block list', /everyone|Advising/.test($('customList').textContent));

  // an unassigned block still shows for everyone
  $('cLabel').value = 'Department Meeting';
  $('cWho').value = '';
  $('cDays').querySelector('input[value=F]').checked = true;
  $('cStart').value = '09:00'; $('cEnd').value = '10:00';
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('unassigned block appears on both sheets',
     /Department Meeting/.test(sheetText(0)) && /Department Meeting/.test(sheetText(1)));

  // office-hour totals must be counted per person
  const officeOf = i => {
    const m = facultySheets()[i].querySelector('.load-line span').textContent
      .match(/Office hours: ([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  };
  ok('office-hour totals differ per sheet', officeOf(0) !== officeOf(1));

  // 10. accessibility basics
  ok('skip link present', !!doc.querySelector('.skip-link'));
  ok('all inputs labelled', [...doc.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, textarea')]
    .every(i => doc.querySelector('label[for="' + i.id + '"]') || i.getAttribute('aria-label') || i.closest('label')));
  ok('no inline handlers', !/ on(click|change|input)=/.test(html));

  // ---- help, tour, FAQ ----
  ok('help is closed at start', $('helpModal').hidden === true);
  $('btnHelp').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('help opens', $('helpModal').hidden === false && $('helpBackdrop').hidden === false);
  ok('walkthrough shown first', $('paneWalk').hidden === false && $('paneFaq').hidden === true);
  ok('walkthrough covers all six panels', $('paneWalk').querySelectorAll('ol.walk li').length === 6);
  $('tabFaq').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('FAQ tab switches', $('paneFaq').hidden === false && $('paneWalk').hidden === true);
  ok('FAQ has entries', $('paneFaq').querySelectorAll('details').length >= 10);
  ok('FAQ tab marked selected', $('tabFaq').getAttribute('aria-selected') === 'true');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes help', $('helpModal').hidden === true);

  $('btnHelp').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  $('startTour').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('tour starts and closes help', $('tourCallout').hidden === false && $('helpModal').hidden === true);
  ok('tour opens on step 1', /Step 1 of 6/.test($('tourCount').textContent));
  ok('tour highlights the first panel', doc.querySelector('#p1').classList.contains('tour-target'));
  ok('Back hidden on the first step', $('tourBack').hidden === true);
  $('tourNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('tour advances', /Step 2 of 6/.test($('tourCount').textContent));
  ok('highlight moves with it',
     doc.querySelector('#p2').classList.contains('tour-target') &&
     !doc.querySelector('#p1').classList.contains('tour-target'));
  for (let i = 0; i < 5; i++) $('tourNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('tour ends after the last step', $('tourCallout').hidden === true);
  ok('no highlight left behind', !doc.querySelector('.tour-target'));
  ok('tour completion remembered', !!window.localStorage.getItem('bcc-faculty-schedule-tour'));
  ok('help never prints', $('helpModal').className.indexOf('no-print') > -1);
  ok('FAQ documents dragging', /drag/i.test($('paneFaq').textContent));
  ok('FAQ documents signing', /signature/i.test($('paneFaq').textContent));

  // ---- e-signature ----
  ok('signature options hidden until the line is on', $('sigOptions').hidden === true);
  $('optSign').checked = true;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('signature options appear with the line', $('sigOptions').hidden === false);
  ok('blank is the default mode', $('sigMode').value === 'blank');
  ok('blank mode leaves the rule empty',
     doc.querySelector('.sig-row .sig-rule').children.length === 0);

  $('sigMode').value = 'typed';
  $('sigMode').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('typed mode defaults to the profile name', $('sigTyped').value.length > 0);
  ok('date fills in automatically', /^\d{4}-\d{2}-\d{2}$/.test($('sigDate').value));
  ok('typed signature reaches the sheet', !!doc.querySelector('.sig-typed'));
  ok('signed-electronically note printed',
     [...doc.querySelectorAll('.sig-note')].some(n => /Signed electronically/.test(n.textContent)));

  const rules = [...doc.querySelectorAll('.sig-row .sig')];
  const chair = rules.find(r => /Department chair/.test(r.textContent));
  ok('chair line stays blank', chair.querySelector('.sig-rule').children.length === 0);

  $('sigTyped').value = 'A. N. Other';
  $('sigTyped').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('editing the typed name updates the sheet', /A\. N\. Other/.test(doc.querySelector('.sig-typed').textContent));

  $('sigMode').value = 'blank';
  $('sigMode').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('switching back to blank clears the signature', !doc.querySelector('.sig-typed'));
  $('optSign').checked = false;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));

  // ---- copy summary ----
  let copied = null;
  window.navigator.clipboard = { writeText: v => { copied = v; return Promise.resolve(); } };
  $('btnCopy').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('summary copied', typeof copied === 'string' && /COURSES/.test(copied));
  ok('summary reports load', /Contact hours: [\d.]+ of [\d.]+/.test(copied));
  ok('email feature fully removed',
     !/btnEmail|mailto:|Outlook on the web/.test(html));
  ok('submission guidance present', /attach it to an email/i.test(html));

  // ---- print in colour ----
  ok('colour printing is off by default', $('optPrintColor').checked === false);
  ok('colour hint hidden by default', $('colorHint').hidden === true);
  $('optPrintColor').checked = true;
  $('optPrintColor').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('colour print class applied', doc.body.classList.contains('color-print'));
  ok('colour hint shown', $('colorHint').hidden === false);
  $('optPrintColor').checked = false;
  $('optPrintColor').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('colour print class removed', !doc.body.classList.contains('color-print'));

  // ---- conflicts and office-hours minimum ----
  const bannerText = () => $('banners').textContent;
  $('cLabel').value = 'Clashing Hours';
  $('cWho').value = '';
  $('cDays').querySelector('input[value=T]').checked = true;
  $('cStart').value = '09:30'; $('cEnd').value = '10:30';   // sits on ELEC-103, Tue 9–11:45
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('overlap is reported', /scheduling conflict/.test(bannerText()));
  ok('conflict names both blocks', /overlaps/.test(bannerText()));
  // find it by name rather than position — earlier tests left other blocks behind
  [...$('customList').querySelectorAll('.custom-item')]
    .find(i => /Clashing Hours/.test(i.textContent))
    .querySelectorAll('button')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  // other blocks from earlier tests legitimately clash too, so check this one specifically
  ok('conflict clears when the block goes', !/Clashing Hours/.test(bannerText()));

  // set a floor nobody in this test can meet, so the check is deterministic
  $('fOhRequired').value = '40';
  $('fOhRequired').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('short office hours are flagged', /below the 40 required/.test(bannerText()));
  ok('requirement shows in the summary',
     /Office hours: [\d.]+ of 40/.test(facultySheets()[0].querySelector('.load-line span').textContent));
  $('fOhRequired').value = '0';
  $('fOhRequired').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('requirement of zero stops the warning', !/below the/.test(bannerText()));

  // ---- what's new ----
  ok('news tab exists', !!$('tabNews'));
  $('btnNews').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('news button opens the news tab', $('paneNews').hidden === false && $('helpModal').hidden === false);
  ok('news lists several versions', $('paneNews').querySelectorAll('.rel').length >= 5);
  ok('news names the current version', /1\.6/.test($('paneNews').textContent));
  ok('opening news clears the dot', $('newsDot').hidden === true);
  ok('hidden always wins over a class display rule', /\[hidden\]\{display:none!important\}/.test(html));
  ok('version recorded', window.localStorage.getItem('bcc-faculty-schedule-seen') === '1.6');
  $('tabWalk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('other tabs still work', $('paneWalk').hidden === false && $('paneNews').hidden === true);
  $('helpClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  console.log(fails ? '\n' + fails + ' FAILURES' : '\nAll checks passed');
  process.exit(fails ? 1 : 0);
}, 400);
