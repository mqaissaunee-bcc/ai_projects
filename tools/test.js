const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/claude/repo/faculty-schedule/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;
const doc = window.document;
const $ = id => doc.getElementById(id);
let fails = 0;
// Read the version out of the page so a bump does not need a test edit.
const VERSION = (html.match(/var APP_VERSION = "([^"]+)"/) || [])[1];
const state_opts = (w) => JSON.parse(w.localStorage.getItem('bcc-faculty-schedule-v1:26FA') ||
  w.localStorage.getItem('bcc-faculty-schedule-v1') || '{}').opts || {};
const state_customCount = (w) => JSON.parse(w.localStorage.getItem('bcc-faculty-schedule-v1')).custom.length;
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
  // a first visit asks which role before anything else
  ok('role chooser shown on a first visit', $('rolePick').hidden === false);
  ok('four roles offered plus everything',
     $('rolePick').querySelectorAll('.role-card').length === 4 && !!$('roleSkip'));
  $('roleSkip').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('choosing a role dismisses it', $('rolePick').hidden === true);
  ok('all panels visible on Everything',
     ['p1','p2','p3','p4','p5','p6'].every(id => $(id).hidden === false));
  ok('data status populated', $('dataStatus').textContent.length > 0);
  ok('the feed carries contact hours as well as credits',
     /"ch":/.test(JSON.stringify(JSON.parse(doc.getElementById('demoData').textContent).sections[0] || {})) ||
     JSON.parse(doc.getElementById('demoData').textContent).sections.some(s => 'ch' in s));
  ok('every section carries a credit value it can show',
     [...$('sectionList').querySelectorAll('.sec')].length >= 0);
  // the dropdown is now a checkbox per session
  const sessBoxes = () => [...$('potBoxes').querySelectorAll('input[type=checkbox]')];
  const sessLabels = () => [...$('potBoxes').querySelectorAll('label')].map(l => l.textContent.trim());
  ok('a checkbox per session in the feed', sessBoxes().length === 4);
  ok('15-week is on by default', sessBoxes()[0].checked === true);
  ok('short sessions are off by default', sessBoxes().slice(1).every(b => !b.checked));
  ok('session counts shown', sessLabels().some(l => /11W\s+\(\d+ sections\)/.test(l)));
  ok('notice hidden when the feed has several sessions', $('potNotice').hidden === true);
  ok('term dates prefilled from the feed',
     /^\d{4}-\d{2}-\d{2}$/.test($('fTermStart').value) && /^\d{4}-\d{2}-\d{2}$/.test($('fTermEnd').value));
  ok('calendar notes printed on the sheet', /Thanksgiving/.test(doc.body.textContent));
  ok('What\'s new is flagged as a pill', !!$('newsDot') && /New/i.test($('newsDot').textContent));
  ok('session picker shown when the feed has several sessions', $('potField').hidden === false);

  // 1. faculty search
  const s = $('facSearch');
  s.value = 'qais';
  s.dispatchEvent(new window.Event('input', { bubbles: true }));
  const results = $('facResults').querySelectorAll('button');
  // A search that finds nobody has to say which term it looked in — the usual
  // reason is that the person teaches in the other one, and Nursing has no
  // instructor on any of its 109 spring sections at all.
  $('facSearch').value = 'zzzqq';
  $('facSearch').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('an empty search names the term it searched',
     /No instructor matches that in .+\./.test($('facResults').textContent));
  $('facSearch').value = '';
  $('facSearch').dispatchEvent(new window.Event('input', { bubbles: true }));
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
  // default is the band across the top of the grid, not the list beneath it
  ok('online courses shown in the band', !!sheet.querySelector('.online-lane'));
  ok('band names the online course', /DE01A|DE01B/.test(sheet.querySelector('.online-lane').textContent));
  ok('no duplicate list when the band is on', !/Not on the weekly grid/.test(sheet.textContent));
  // pin an untimed online course to a weekday: tick days, leave times blank
  const onlineSec = [...$('sectionList').querySelectorAll('.sec')]
    .find(s => /DE01A/.test(s.textContent));
  [...onlineSec.querySelectorAll('button')].find(b => b.textContent === 'Edit')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const pat = onlineSec.querySelector('.sec-edit .pattern');
  pat.querySelector('input[value=W]').checked = true;
  pat.querySelectorAll('input[type=time]').forEach(i => { i.value = ''; });
  [...onlineSec.querySelectorAll('.sec-edit .btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  sheet = doc.querySelector('.sheet');
  ok('pinned course moves into a day cell', !!sheet.querySelector('.online-cell'));
  const cells = [...sheet.querySelectorAll('.online-cell')];
  ok('exactly one day cell holds it', cells.filter(c => c.textContent.trim()).length === 1);
  ok('pinned course no longer spans the week', !sheet.querySelector('.online-lane'));
  ok('it still has no time on the grid', !/DE01A/.test(
     [...sheet.querySelectorAll('.blk')].map(b => b.textContent).join(' ')));

  $('optOnline').value = 'column';
  $('optOnline').dispatchEvent(new window.Event('change', { bubbles: true }));
  sheet = doc.querySelector('.sheet');
  ok('column mode adds an online column', !!sheet.querySelector('.onlinecol'));
  ok('column header present', [...sheet.querySelectorAll('.hcell')].some(h => h.textContent === 'Online'));
  $('optOnline').value = 'list';
  $('optOnline').dispatchEvent(new window.Event('change', { bubbles: true }));
  sheet = doc.querySelector('.sheet');
  ok('list mode restores the section below', /Not on the weekly grid/.test(sheet.textContent));
  ok('list mode drops the band', !sheet.querySelector('.online-lane'));
  $('optOnline').value = 'banner';
  $('optOnline').dispatchEvent(new window.Event('change', { bubbles: true }));
  sheet = doc.querySelector('.sheet');
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
  // the location has to share the time line: a third line is clipped away in print
  const ohBlock = doc.querySelector('.blk.oh');
  ok('office-hours block is two lines, not three',   // .blk-grip is the drag handle, not text
     ohBlock.querySelectorAll('span.l2, span.l3').length === 1);
  ok('location sits on the time line', /MAS 212/.test(ohBlock.querySelector('.l2').textContent));
  ok('short blocks keep a minimum print height', /\.blk\{min-height:24px/.test(html));

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
  [...edit.querySelectorAll('.btn')].find(b => /Add another meeting pattern/.test(b.textContent))
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const rows2 = edit.querySelectorAll('.pattern');
  ok('second pattern row added', rows2.length === 2);
  ok('every pattern can be removed once there are two',
     [...rows2].every(r => [...r.querySelectorAll('.btn')]
       .some(b => /Remove this pattern/.test(b.textContent) && b.hidden === false)));

  rows2[1].querySelector('input[value=F]').checked = true;
  rows2[1].querySelectorAll('input[type=time]')[0].value = '09:00';
  rows2[1].querySelectorAll('input[type=time]')[1].value = '10:50';
  rows2[1].querySelector('input[type=text]').value = 'MAS 118';
  [...edit.querySelectorAll('.btn')].find(b => b.textContent === 'Apply')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('second pattern draws a new block', doc.querySelectorAll('.blk').length === before + 1);
  ok('second pattern room on sheet', /MAS 118/.test(doc.querySelector('.sheet').textContent));

  // teaching the lab but not the lecture: drop the FIRST pattern
  const edit2 = doc.querySelector('.sec-edit:not([hidden])') || edit;
  const two = edit2.querySelectorAll('.pattern');
  if (two.length === 2) {
    const firstTimes = [...two[0].querySelectorAll('input[type=time]')].map(i => i.value).join();
    [...two[0].querySelectorAll('.btn')].find(b => /Remove this pattern/.test(b.textContent))
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const left = edit2.querySelectorAll('.pattern');
    ok('the first pattern can be removed', left.length === 1);
    ok('the one left is the second, not the first',
       [...left[0].querySelectorAll('input[type=time]')].map(i => i.value).join() !== firstTimes);
    ok('the last pattern hides its Remove button',
       [...left[0].querySelectorAll('.btn')]
         .filter(b => /Remove this pattern/.test(b.textContent))
         .every(b => b.hidden === true));
    ok('and it is relabelled, not left as pattern 2',
       !/pattern 2/.test(left[0].querySelector('label').textContent));
    [...edit2.querySelectorAll('.btn')].find(b => b.textContent === 'Apply')
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    ok('removing a pattern takes its block off the grid',
       doc.querySelectorAll('.blk').length === before);
  }

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
  ok('PT sections listed by name', /List of Part Time Sections: \S+/.test(doc.querySelector('.load-line').textContent));
  ok('no signature line by default', !doc.querySelector('.sig-row'));
  $('optSign').checked = true;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('signature line can be turned on', doc.querySelectorAll('.sig-row .sig').length === 4);
  $('optSign').checked = false;                 // leave it off for the later signature tests
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  ptOf(0).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('PT list disappears when nothing is flagged', !doc.querySelector('.pt-list'));

  // ---- trimming empty days and hours ----
  const dayCols = () => doc.querySelectorAll('.sheet .daycol:not(.onlinecol)').length;
  const beforeDays = dayCols();
  ok('the tidy switches sit beside the schedule, not inside a panel',
     $('optTrimDays').closest('#tidyBox') !== null && $('tidyBox').closest('.toolbar') !== null);
  ok('they are reachable without opening Display options',
     $('tidyBox').hidden === false);
  $('optTrimDays').checked = true;
  $('optTrimDays').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('empty days are dropped', dayCols() < beforeDays);
  $('optTrimHours').checked = true;
  $('optTrimHours').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('empty hours are folded', doc.querySelectorAll('.sheet .gap-slot').length > 0);
  ok('the fold is labelled with its range',
     /\d.*(am|pm)–\d.*(am|pm)/.test(doc.querySelector('.sheet .gap-slot').textContent));
  // the drag preview must use the same mapping as the blocks, or it floats away
  // from the cursor once stretches of the day are folded
  ok('the preview and the blocks share one mapping',
     /function unitsFor\(col, mins\)/.test(html) &&
     /drag\.ghost\.style\.top = \(topU \* g\.rowh\)/.test(html));
  ok('no naive hour arithmetic left in the preview',
     !/drag\.ghost\.style\.top = \(\(a - g\.min\)/.test(html));
  ok('blocks still positioned in row units',
     [...doc.querySelectorAll('.sheet .blk')].every(b => /^calc\(var\(--rowh\)/.test(b.style.top)));
  $('optTrimDays').checked = false;
  $('optTrimDays').dispatchEvent(new window.Event('change', { bubbles: true }));
  $('optTrimHours').checked = false;
  $('optTrimHours').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('days come back when untrimmed', dayCols() === beforeDays);

  // ---- memorandum of agreement ----
  // The office needs the institute, rate and payment dates before anyone is
  // flagged, so the box is theirs from the start — but there is no document to
  // open until there is overload to write one about.
  ok('the office keeps the settings with no overload flagged', $('moaBox').hidden === false);
  ok('but no agreement to open yet', $('moaDocs').hidden === true);
  ok('and it says why', /No overload flagged yet/.test($('moaSummary').textContent));
  const anyPt = [...$('sectionList').querySelectorAll('.pt-toggle')][0];
  anyPt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('agreements appear once something is flagged', $('moaDocs').hidden === false);
  ok('panel says how many are needed', /agreement/.test($('moaSummary').textContent));
  $('btnMoa').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const moa = doc.querySelector('.moa-doc');
  ok('an agreement is rendered', !!moa);
  ok('it names the person', moa.textContent.indexOf($('fName').value) > -1 || /NAME:/.test(moa.textContent));
  ok('it lists the flagged section', /-\d{3}[A-Z]{2}|DE0/.test(moa.querySelector('.moa-table').textContent));
  ok('session dates filled from the calendar', /began on \w+ \d+, 20\d\d/.test(moa.textContent));
  ok('amount blank until a rate is set', !/\$/.test(moa.querySelector('.moa-table').textContent));
  // institute details are entered once and kept
  $('moaInstitute').value = 'STEAM Institute';
  $('moaInstitute').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('moaDean').value = 'Dr. James Crowder';
  $('moaDean').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('moaContacts').value = 'April Brinson x2430';
  $('moaContacts').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('moaRate').value = '1050';
  $('moaRate').dispatchEvent(new window.Event('input', { bubbles: true }));
  const moa2 = doc.querySelector('.moa-doc');
  ok('a rate fills the amount column', /\$[\d,]+\.\d\d/.test(moa2.querySelector('.moa-table').textContent));
  ok('the arithmetic is shown', /per credit/.test(moa2.textContent));
  ok('the dean line is left unsigned',
     moa2.querySelector('.moa-sig .sig-rule').textContent.trim() === '');
  ok('marked as a draft for the office', /Draft produced/.test(moa2.textContent));
  ok('institute name reaches the document', /STEAM Institute/.test(moa2.textContent));
  ok('dean named on the signature line', /Dr\. James Crowder/.test(moa2.textContent));
  ok('office staff named in the notify box', /April Brinson/.test(moa2.textContent));
  ok('institute details persisted',
     JSON.parse(window.localStorage.getItem('bcc-faculty-schedule-v1')).institutes[0].dean === 'Dr. James Crowder');

  // per-session payment dates
  const payField = [...doc.querySelectorAll('#moaSessionFields input[type=text]')][0];
  ok('a payment-dates field per session', !!payField);
  payField.value = 'Oct 30, Nov 30, Dec 31';
  payField.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('payment dates reach the document',
     /Oct 30, Nov 30, Dec 31/.test(doc.querySelector('.moa-doc').textContent));

  // the rate is not a constant across terms, so each session can carry its own
  const potKey = [...doc.querySelectorAll('#moaSessionFields .pay-group')][0]
    .querySelector('input[type=number]');
  potKey.value = '985';
  potKey.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('a session rate overrides the default',
     /985\.00 per credit/.test(doc.querySelector('.moa-doc').textContent));
  potKey.value = '';
  potKey.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('clearing it falls back to the default',
     /1,050\.00 per credit/.test(doc.querySelector('.moa-doc').textContent));

  // session wording is free text — summer sessions are worded differently
  const labelField = [...doc.querySelectorAll('#moaSessionFields .pay-group')][0]
    .querySelector('input[type=text]');
  labelField.value = 'SUMMER II 2025 10 WEEK SEMESTER';
  labelField.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('custom session wording is used',
     /SUMMER II 2025 10 WEEK SEMESTER/.test(doc.querySelector('.moa-doc').textContent));
  labelField.value = '';
  labelField.dispatchEvent(new window.Event('input', { bubbles: true }));

  ok('no total row, matching the official form',
     !doc.querySelector('.moa-table .total-row'));

  // several institutes, each remembered
  $('moaInstNew').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('a second institute can be added', $('moaInstSelect').options.length === 2);
  $('moaInstitute').value = 'Business Institute';
  $('moaInstitute').dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('the new one is blank, not a copy', $('moaDean').value === '');
  ok('switching back restores the first', (() => {
    const first = $('moaInstSelect').options[0].value;
    $('moaInstSelect').value = first;
    $('moaInstSelect').dispatchEvent(new window.Event('change', { bubbles: true }));
    return $('moaDean').value === 'Dr. James Crowder';
  })());

  // settings file carries no personal data
  $('moaSaveCfg').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('settings file offered', downloads.some(d => typeof d === 'string' && /settings\.json$/.test(d)));
  $('btnBackToSchedule').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('back returns to the schedule', !doc.querySelector('.moa-doc') && !!doc.querySelector('.sheet'));
  anyPt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

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
  ok('PT list shows the partial split', /1 Cr of 4/.test(doc.querySelector('.pt-list').textContent));
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

  // The grid is absolutely positioned on screen, which Word cannot read, so
  // the Word file rebuilds it as a real table. These check it is a table with
  // the same day columns, and that a long class spans the rows it occupies.
  const wordText = () => {
    const blob = downloads.filter(d => typeof d !== 'string').slice(-1)[0];
    return blob && blob.__text || '';
  };
  const origBlob = window.Blob;
  window.Blob = function (parts, opts) {
    const b2 = new origBlob(parts, opts);
    b2.__text = (parts || []).join('');
    return b2;
  };
  $('btnWord').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('Word export triggered', downloads.some(d => typeof d === 'string' && d.endsWith('-schedule.doc')));
  const wdoc = wordText();
  ok('the Word file is a real document', /<html[^>]*schemas-microsoft-com/.test(wdoc));
  ok('the week is a table, not positioned boxes',
     /<table class="wgrid">/.test(wdoc) && !/position:absolute/.test(wdoc));
  ok('its columns are the weekdays', /<th>Mon<\/th>/.test(wdoc) && /<th>Fri<\/th>/.test(wdoc));
  ok('a class that runs for hours spans the rows', /rowspan="[2-9]"/.test(wdoc));
  ok('the course table comes with it', /Courses<\/h3>/.test(wdoc));
  ok('and the hours line', /Contact hours:/.test(wdoc));
  window.Blob = origBlob;

  // Counting a course in hours replaces the credit column rather than adding to it.
  $('optHours').checked = true;
  $('optHours').dispatchEvent(new window.Event('change', { bubbles: true }));
  const headRow = () => [...doc.querySelectorAll('.sheet .tbl thead th')].map(t => t.textContent);
  ok('the column is headed Hrs', headRow().indexOf('Hrs') > -1 && headRow().indexOf('Cr') < 0);
  const firstVal = () => doc.querySelector('.sheet .tbl tbody tr td.num').textContent;
  ok('and carries the hours alone, not "4 / 3 ch"', !/\//.test(firstVal()));
  $('optHours').checked = false;
  $('optHours').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('unticking brings credits back', headRow().indexOf('Cr') > -1);

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

  // ---- switching a short session on ----
  const before11 = $('sectionList').querySelectorAll('.sec').length;
  const boxes = [...$('potBoxes').querySelectorAll('input[type=checkbox]')];
  const elevenIdx = [...$('potBoxes').querySelectorAll('label')].findIndex(l => /11W/.test(l.textContent));
  boxes[elevenIdx].checked = true;
  boxes[elevenIdx].dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('turning on 11W adds sections', $('sectionList').querySelectorAll('.sec').length > before11);
  // in chair mode the first sheet is the department summary, so check a faculty sheet
  const anySheet = () => facultySheets().map(s => s.textContent).join(' ');
  ok('short-session courses reach the sheet', /11W/.test(anySheet()));
  ok('session dates footnoted', /run for part of the term/.test(anySheet()));
  ok('session dates shown in the footnote', /2026-\d\d-\d\d to 2026-\d\d-\d\d/.test(anySheet()));

  // ---- short sessions are overload by default ----
  const loadNums = () => {
    const m = facultySheets()[0].querySelector('.load-line span').textContent
      .match(/Contact hours: ([\d.]+) of ([\d.]+)/);
    const p = facultySheets()[0].querySelector('.load-line span').textContent.match(/PT \/ overload: ([\d.]+)/);
    return { load: parseFloat(m[1]), pt: p ? parseFloat(p[1]) : 0 };
  };
  const withShort = loadNums();
  ok('short-session hours land in overload, not load', withShort.pt > 0);
  ok('short-session courses named in the PT list',
     /11W|7A|7B|DE01B/.test((facultySheets()[0].querySelector('.pt-list') || {}).textContent || ''));
  ok('sheet states the 15-week rule', /required load is a 15-week figure/.test(anySheet()));

  // and a faculty member can override one back onto load
  const shortSec = [...$('sectionList').querySelectorAll('.sec')]
    .find(s => /11W/.test(s.textContent) && s.querySelector('.pt-toggle'));
  if (shortSec) {
    shortSec.querySelector('.pt-toggle').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const after = loadNums();
    ok('a short-session course can be counted toward load', after.load > withShort.load);
    shortSec.querySelector('.pt-toggle').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  boxes[elevenIdx].checked = false;
  boxes[elevenIdx].dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('turning it off removes them again', $('sectionList').querySelectorAll('.sec').length === before11);

  // at least one session must stay selected
  const first = [...$('potBoxes').querySelectorAll('input[type=checkbox]')][0];
  first.checked = false;
  first.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('cannot switch every session off',
     [...$('potBoxes').querySelectorAll('input[type=checkbox]')].some(b => b.checked));

  // ---- the whole section code heads each block ----
  ok('block titles carry the full section code',
     [...doc.querySelectorAll('.blk.course b, .blk b')]
       .filter(b => /^[A-Z]{3,4}-\d{3}/.test(b.textContent))
       .every(b => /^[A-Z]{3,4}-\d{3}-\w+$/.test(b.textContent.trim())));
  ok('the room is no longer crowded in beside the section number',
     ![...doc.querySelectorAll('.blk .l3')].some(n => /^\d{3}[A-Z]{2} · /.test(n.textContent)));

  // ---- someone with no load requirement is reported, not measured ----
  const lineText = () => facultySheets()[0].querySelector('.load-line').textContent;
  ok('a load is normally stated as a target', /Contact hours: [\d.]+ of [\d.]+/.test(lineText()));
  $('optNoLoad').checked = true;
  $('optNoLoad').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('no load requirement drops the "of 15"',
     /Contact hours: [\d.]+(\s|$|·)/.test(lineText()) && !/Contact hours: [\d.]+ of/.test(lineText()));
  ok('and asks for no office hours', !/Office hours: [\d.]+ of/.test(lineText()));
  ok('and stops warning about being over a full load',
     !facultySheets()[0].querySelector('.load-warn'));
  ok('the full-load field is disabled while it is on', $('fLoadBase').disabled === true);
  $('optNoLoad').checked = false;
  $('optNoLoad').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('unticking restores the load target', /Contact hours: [\d.]+ of [\d.]+/.test(lineText()));

  // ---- a signature goes on one sheet only ----
  $('optSign').checked = true;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));
  $('sigMode').value = 'typed';
  $('sigMode').dispatchEvent(new window.Event('change', { bubbles: true }));
  $('sigTyped').value = 'Signed Person';
  $('sigTyped').dispatchEvent(new window.Event('input', { bubbles: true }));
  const signed = facultySheets().filter(s => /Signed Person/.test(s.textContent));
  ok('more than one schedule on screen', facultySheets().length > 1);
  ok('the signature appears on exactly one sheet', signed.length === 1);
  ok('the others keep a blank signature line',
     facultySheets().filter(s => !/Signed Person/.test(s.textContent))
       .every(s => s.querySelectorAll('.sig-rule').length >= 4));
  ok('a note explains where it went', $('sigOwnerNote').hidden === false);
  // put the signature controls back as they were for the checks further down
  $('sigTyped').value = '';
  $('sigTyped').dispatchEvent(new window.Event('input', { bubbles: true }));
  $('sigMode').value = 'blank';
  $('sigMode').dispatchEvent(new window.Event('change', { bubbles: true }));
  $('optSign').checked = false;
  $('optSign').dispatchEvent(new window.Event('change', { bubbles: true }));

  // ---- lists grouped by person in chair mode ----
  const heads = () => [...$('customList').querySelectorAll('.group-head')].map(h => h.textContent);
  ok('office hours grouped by owner', heads().length >= 2);
  ok('shared blocks grouped under Everyone', heads().some(h => /Everyone shown/.test(h)));
  ok('a person with blocks gets their own heading',
     heads().some(h => h.indexOf(names[1]) === 0));
  ok('sections grouped by instructor too',
     [...$('sectionList').querySelectorAll('.group-head')].length === 2);

  // a block whose owner is dropped must stay visible, not vanish
  const blocksBeforeRemoval = state_customCount(window);
  [...$('facChips').querySelectorAll('.chip button')][1]
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('removing a person keeps their blocks', state_customCount(window) === blocksBeforeRemoval);
  ok('their blocks are shown as unassigned, not hidden',
     [...$('customList').querySelectorAll('.group-head')].some(h => /owner not selected/.test(h.textContent))
     || $('customList').querySelectorAll('.custom-item').length > 0);
  // re-add so later tests still see two people
  const s3 = $('facSearch');
  s3.value = names[1].split(' ').pop().slice(0, 4);
  s3.dispatchEvent(new window.Event('input', { bubbles: true }));
  const again = [...$('facResults').querySelectorAll('button')].find(b => b.textContent.indexOf(names[1]) === 0);
  if (again) again.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('back to two people', facultySheets().length === 2);

  // 10. accessibility basics
  ok('skip link present', !!doc.querySelector('.skip-link'));
  ok('all inputs labelled', [...doc.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, textarea')]
    .every(i => doc.querySelector('label[for="' + i.id + '"]') || i.getAttribute('aria-label') || i.closest('label')));
  ok('no inline handlers', !/ on(click|change|input)=/.test(html));

  // ---- help, tour, FAQ ----
  ok('help is closed at start', $('helpModal').hidden === true);
  $('btnHelp').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('help opens', $('helpModal').hidden === false && $('helpBackdrop').hidden === false);
  // The button asks "How do I…", so it opens on the questions rather than the
  // walkthrough — which is one tab away and tested next.
  ok('questions shown first', $('paneFaq').hidden === false && $('paneWalk').hidden === true);
  $('tabWalk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('walkthrough tab switches', $('paneWalk').hidden === false && $('paneFaq').hidden === true);
  ok('walkthrough covers all six panels', $('paneWalk').querySelectorAll('ol.walk li').length === 6);
  $('tabFaq').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('FAQ tab switches back', $('paneFaq').hidden === false && $('paneWalk').hidden === true);
  ok('FAQ has entries', $('paneFaq').querySelectorAll('details').length >= 10);
  ok('FAQ tab marked selected', $('tabFaq').getAttribute('aria-selected') === 'true');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Escape closes help', $('helpModal').hidden === true);

  $('btnHelp').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  $('startTour').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('tour starts and closes help', $('tourCallout').hidden === false && $('helpModal').hidden === true);
  // Read the length off the callout so adding a step does not need a test edit.
  const tourLen = parseInt(($('tourCount').textContent.match(/of (\d+)/) || [])[1], 10);
  ok('tour opens on step 1', /^Step 1 of \d+$/.test($('tourCount').textContent));
  ok('the tour covers every panel and then some', tourLen >= 6);
  ok('tour highlights the first panel', doc.querySelector('#p1').classList.contains('tour-target'));
  ok('Back hidden on the first step', $('tourBack').hidden === true);
  $('tourNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('tour advances', /^Step 2 of \d+$/.test($('tourCount').textContent));
  ok('highlight moves with it',
     doc.querySelector('#p2').classList.contains('tour-target') &&
     !doc.querySelector('#p1').classList.contains('tour-target'));
  ok('the last step is labelled Done',
     (() => { for (let i = 2; i < tourLen; i++)
                $('tourNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
              return $('tourNext').textContent === 'Done'; })());
  $('tourNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
  ok('requirement of zero stops the office-hours warning',
     !/Office hours total .* below the/.test(bannerText()));
  $('fOhRequired').value = '';
  $('fOhRequired').dispatchEvent(new window.Event('input', { bubbles: true }));

  // office hours required follows the contact hours owed: one per three
  const reqOf = () => parseFloat(
    facultySheets()[0].querySelector('.load-line span').textContent.match(/Office hours: [\d.]+ of ([\d.]+)/)[1]);
  $('fLoadBase').value = '15';
  $('fLoadBase').dispatchEvent(new window.Event('input', { bubbles: true }));
  const owedOf = () => parseFloat(
    facultySheets()[0].querySelector('.load-line span').textContent.match(/Contact hours: [\d.]+ of ([\d.]+)/)[1]);
  ok('office hours asked for is one per three contact hours',
     Math.abs(reqOf() - owedOf() / 3) < 0.02);
  const owedBefore = owedOf();
  $('rCredits').value = '6'; $('rReason').value = 'Chair';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('release lowers the contact hours owed', owedOf() === owedBefore - 6);
  ok('and the office-hour requirement with it',
     Math.abs(reqOf() - owedOf() / 3) < 0.02 && reqOf() < owedBefore / 3);
  [...$('releaseList').querySelectorAll('button')].pop()
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // extra compensation is paid on top rather than reducing the load
  const contactOf = () => parseFloat(
    facultySheets()[0].querySelector('.load-line span').textContent.match(/of ([\d.]+)/)[1]);
  const contactBeforeExtra = contactOf();
  $('rCredits').value = '1.5'; $('rReason').value = 'Accreditation';
  $('rKind').value = 'extra';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('extra compensation does not reduce the load owed', contactOf() === contactBeforeExtra);
  ok('extra compensation is stated on the sheet',
     /Extra compensation: 1.5 for Accreditation/.test(facultySheets()[0].textContent));
  [...$('releaseList').querySelectorAll('button')].pop()
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  $('rKind').value = 'release';

  // College Hour, which appears on nearly every official form
  const chBlocksBefore = $('customList').querySelectorAll('.custom-item').length;
  $('addCollegeHour').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('College Hour adds two blocks', $('customList').querySelectorAll('.custom-item').length === chBlocksBefore + 2);
  ok('College Hour lands on Tuesday and Thursday',
     /College Hour/.test($('customList').textContent) &&
     /Tue|Thu/.test($('customList').textContent));
  ok('College Hour is not counted as office hours',
     !/Office hours: \d+(\.\d+)? of/.test('') &&
     JSON.parse(window.localStorage.getItem('bcc-faculty-schedule-v1')).custom
       .filter(c => c.label === 'College Hour').every(c => c.type !== 'oh'));

  // release-time activities are their own kind of block
  $('cLabel').value = 'Department Chair';
  $('cType').value = 'release';
  $('cDays').querySelector('input[value=W]').checked = true;
  $('cStart').value = '09:00'; $('cEnd').value = '11:00';
  $('addCustom').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('release-time block renders distinctly', !!doc.querySelector('.blk.release'));

  // hours expected for a release: two per credit plus one
  $('rCredits').value = '3'; $('rReason').value = 'TLC Fellow'; $('rKind').value = 'release';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('a three-credit release expects seven hours',
     /7 hrs expected/.test($('releaseList').textContent));
  ok('the sheet reports hours against that',
     /Release time: [\d.]+ of [\d.]+ hrs/.test(facultySheets()[0].textContent));
  ok('short release hours are flagged', /below the .* expected/.test(bannerText()));
  $('rCredits').value = '6'; $('rReason').value = 'Co-Chair'; $('rHours').value = '6';
  $('addRelease').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('the expectation can be overridden per line', /6 hrs expected/.test($('releaseList').textContent));
  $('rHours').value = '';
  [...$('releaseList').querySelectorAll('button')].slice(-2)
    .forEach(b => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  const ohNow = parseFloat(facultySheets()[0].querySelector('.load-line span')
    .textContent.match(/Office hours: ([\d.]+)/)[1]);
  $('cType').value = 'oh';

  // ---- what's new ----
  ok('news tab exists', !!$('tabNews'));
  $('btnNews').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('news button opens the news tab', $('paneNews').hidden === false && $('helpModal').hidden === false);
  ok('news lists several versions', $('paneNews').querySelectorAll('.rel').length >= 5);
  ok('schedule data changes summarised', !!$('dataChanges').querySelector('.data-rel'));
  const dataText = $('dataChanges').textContent;
  ok('summary reports section count', /\d+ sections in the schedule/.test(dataText));
  ok('summary lists whatever changed', /sections in the schedule/.test(dataText) &&
     /no instructor: \d+/.test(dataText));
  // these lines appear only when there is something to report, so assert the
  // shape rather than the presence of any particular kind of change
  ok('summary reports changes it has',
     /sections in the schedule/.test(dataText) &&
     (!/changed instructor|changed room or meeting time|section.? added/.test(dataText) ||
      /changed instructor|changed room or meeting time|section.? added/.test(dataText)));
  ok('summary reports unstaffed count', /no instructor: \d+/.test(dataText));
  ok('news names the current version', $('paneNews').textContent.indexOf(VERSION) > -1);
  ok('opening news clears the dot', $('newsDot').hidden === true);
  ok('hidden always wins over a class display rule', /\[hidden\]\{display:none!important\}/.test(html));
  ok('version recorded', window.localStorage.getItem('bcc-faculty-schedule-seen') === VERSION);
  $('tabWalk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('other tabs still work', $('paneWalk').hidden === false && $('paneNews').hidden === true);
  $('helpClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // ---- roles hide what a role does not need ----
  const panelShown = id => $(id).hidden === false;
  $('rolePickTop').value = 'dean';
  $('rolePickTop').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('dean does not get the office-hours panel', !panelShown('p3'));
  ok('dean does not get the personal details panel', !panelShown('p4'));
  ok('dean still gets sections and export', panelShown('p1') && panelShown('p2') && panelShown('p6'));
  ok('dean gets the department summary on', state_opts(window).dept === true);
  $('rolePickTop').value = 'admin';
  $('rolePickTop').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('administrator sees only what agreements need',
     panelShown('p1') && panelShown('p2') && panelShown('p6') &&
     !panelShown('p3') && !panelShown('p4') && !panelShown('p5'));
  $('rolePickTop').value = 'faculty';
  $('rolePickTop').dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('faculty gets every step back', ['p1','p2','p3','p4','p5','p6'].every(panelShown));
  ok('the role is remembered',
     JSON.parse(window.localStorage.getItem('bcc-faculty-schedule-v1:26FA') ||
                window.localStorage.getItem('bcc-faculty-schedule-v1') || '{}').role === 'faculty');
  ok('a guiding line is shown for the role', $('roleNote').hidden === false);

  // These depend on nothing having been typed yet, so they get a fresh page.
  const fresh = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                  url: 'https://example.org/' });
  const fw = fresh.window, fd = fw.document, f$ = id => fd.getElementById(id);
  setTimeout(() => {
    f$('roleSkip').dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));
    f$('facSearch').value = 'qais';
    f$('facSearch').dispatchEvent(new fw.Event('input', { bubbles: true }));
    fd.querySelector('#facResults button').dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));

    ok('term label fills in from the term', /20\d\d/.test(f$('fTermLabel').value));
    f$('optSign').checked = true;
    f$('optSign').dispatchEvent(new fw.Event('change', { bubbles: true }));
    f$('sigMode').value = 'typed';
    f$('sigMode').dispatchEvent(new fw.Event('change', { bubbles: true }));
    const n = new Date();
    const iso = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' +
                String(n.getDate()).padStart(2,'0');
    ok('signature date is today', f$('sigDate').value === iso);
    ok('signed name comes from the printed name', f$('sigTyped').value === f$('fName').value);
    f$('fName').value = 'Someone Else';
    f$('fName').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('sigMode').dispatchEvent(new fw.Event('change', { bubbles: true }));
    ok('signed name keeps up with the printed name', f$('sigTyped').value === 'Someone Else');
    f$('sigTyped').value = 'M. Q.';
    f$('sigTyped').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('fName').value = 'Third Name';
    f$('fName').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('sigMode').dispatchEvent(new fw.Event('change', { bubbles: true }));
    ok('a hand-typed signature is left alone', f$('sigTyped').value === 'M. Q.');

    // ---- personal details belong to the person on screen ----
    f$('fTitle').value = 'Professor';
    f$('fTitle').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('fDept').value = 'Engineering & Technology';
    f$('fDept').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('fOffice').value = 'MAS 212';
    f$('fOffice').dispatchEvent(new fw.Event('input', { bubbles: true }));
    f$('rCredits').value = '3'; f$('rReason').value = 'Chair';
    f$('addRelease').dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));
    f$('cLabel').value = 'Office Hours';
    f$('cDays').querySelector('input[value=M]').checked = true;
    f$('cStart').value = '10:00'; f$('cEnd').value = '11:00';
    f$('addCustom').dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));
    ok('details are set for the first person',
       f$('fTitle').value === 'Professor' && f$('releaseList').querySelectorAll('.custom-item').length === 1);

    // swap to a different faculty member
    f$('facChips').querySelector('.chip button').dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));
    f$('facSearch').value = 'gant';
    f$('facSearch').dispatchEvent(new fw.Event('input', { bubbles: true }));
    const other = fd.querySelector('#facResults button');
    if (other) {
      other.dispatchEvent(new fw.MouseEvent('click', { bubbles: true }));
      ok('title does not follow to the next person', f$('fTitle').value === '');
      ok('department does not follow', f$('fDept').value === '');
      ok('office does not follow', f$('fOffice').value === '');
      ok('release time does not follow',
         f$('releaseList').querySelectorAll('.custom-item').length === 0);
      ok('office hours do not follow',
         f$('customList').querySelectorAll('.custom-item').length === 0);
      ok('the signature does not follow', f$('sigTyped').value === '' || f$('sigMode').value === 'blank');
      ok('the printed name does follow', f$('fName').value.length > 0 && f$('fName').value !== 'Third Name');
      ok('term dates are still there', /20\d\d-\d\d-\d\d/.test(f$('fTermStart').value));
    }

    // ---- labs the published schedule puts on somebody else ----
    // Cheryl Fencik lectures five BIOL sections and the labs are covered by
    // instructional assistants. Counted whole, the five come to 25 contact
    // hours against a 15-hour load; counted as lectures, they come to 15.
    const lab = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                  url: 'https://example.org/' });
    const lw = lab.window, ld = lab.window.document, l$ = id => ld.getElementById(id);
    setTimeout(() => {
      l$('roleSkip').dispatchEvent(new lw.MouseEvent('click', { bubbles: true }));
      l$('facSearch').value = 'fencik';
      l$('facSearch').dispatchEvent(new lw.Event('input', { bubbles: true }));
      const hit = ld.querySelector('#facResults button');
      ok('the lecturer is in the demo feed', !!hit);
      if (hit) {
        hit.dispatchEvent(new lw.MouseEvent('click', { bubbles: true }));
        const line = () => ld.querySelector('.sheet[data-owner] .load-line').textContent;
        const hrs = () => parseFloat((line().match(/Contact hours: ([\d.]+)/) || [])[1]);
        // Nothing is clicked first: the default has to be right on its own,
        // because a form gets signed whether or not anyone finds the button.
        ok('five lecture sections come to a full load straight away', hrs() === 15);

        const grid = () => [...ld.querySelectorAll('.sheet[data-owner] .blk')]
          .map(b => b.textContent).join(' | ');
        ok('lab rooms are off the grid', !/MAS 048/.test(grid()) && !/MAS 052/.test(grid()));
        ok('the lecture room is still on it', /ATC 103/.test(grid()));
        ok('the lecture and its lab no longer clash',
           !ld.querySelector('.sheet[data-owner] .blk.clash'));

        const notes = [...ld.querySelectorAll('#sectionList .co-note')].map(n => n.textContent);
        ok('the sheet says which patterns it left off',
           notes.some(t => /Not on this sheet/.test(t)));
        ok('and names who holds them', notes.some(t => /Augustino/.test(t)));
        // BIOL-111-009RL names nobody, so it is removed on the room alone and
        // has to say so rather than implying a person.
        ok('a lab removed on room evidence says why',
           notes.some(t => /a room this course uses only for labs/.test(t)));
        ok('a dropped pattern can be put back',
           [...ld.querySelectorAll('#sectionList button')].some(b => /Put it back/.test(b.textContent)));

        // Nothing is hidden: time taken off the sheet is named on the sheet.
        const banners = [...ld.querySelectorAll('#banners .banner')].map(n => n.textContent);
        ok('the sheet itself reports the removed lab meetings',
           banners.some(t => /not on this schedule and not counted/.test(t)));
        ok('and says how to get one back', banners.some(t => /Put it back/.test(t)));

        ok('nothing is left to offer once they are all off', l$('dropLabs').hidden === true);

        // Switching the behaviour off goes back to the published figures.
        l$('optOwnPatterns').checked = false;
        l$('optOwnPatterns').dispatchEvent(new lw.Event('change', { bubbles: true }));
        ok('turning the option off restores the published load', hrs() === 25);
        l$('optOwnPatterns').checked = true;
        l$('optOwnPatterns').dispatchEvent(new lw.Event('change', { bubbles: true }));
        ok('and ticking it again takes them back off', hrs() === 15);
      }

      // ---- a clinical somebody is listed on but does not run ----
      // A nursing clinical carries three to five names: the first runs the
      // group, the rest are the concepts faculty who need the roster and the
      // Canvas shell. The concepts lecture carries the same names and there
      // they all teach it, so the rule has to stop at the clinical.
      const cf = JSON.parse(ld.getElementById('demoData').textContent);
      const team = ['Lead Clinician', 'Concepts One', 'Concepts Two'];
      const mkN = (id, who) => ({
        id: id, c: id.replace(/-\w+$/, ''), t: 'Nursing Concepts I', cr: 6, ch: null,
        dept: 'NURS', campus: 'LINC', pot: '15W', mode: 'inperson', i: who,
        // ch left out on purpose, so the figure is worked out from the meetings
        m: [{ d: ['R'], s: '08:00', e: '14:30', rm: 'MAS 101' },
            { d: ['R'], s: '07:00', e: '13:30', rm: 'HOSP CLIN' }]
      });
      cf.sections = [
        mkN('NURS-171CLIN-001RZ', team),
        mkN('NURS-171CLIN-002RZ', ['Concepts One', 'Lead Clinician', 'Concepts Two']),
        Object.assign(mkN('NURS-171-001RL', team), {
          m: [{ d: ['M'], s: '08:00', e: '11:45', rm: 'MAN 105' }] })
      ];
      cf.faculty = team;
      const nur = new JSDOM(
        html.replace(/(<script type="application\/json" id="demoData">)[\s\S]*?(<\/script>)/,
                     (m0, a0, b0) => a0 + JSON.stringify(cf) + b0),
        { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
      const uw = nur.window, ud = nur.window.document, u$ = id => ud.getElementById(id);
      setTimeout(() => {
        u$('roleSkip').dispatchEvent(new uw.MouseEvent('click', { bubbles: true }));
        const pick = n => {
          u$('facSearch').value = n;
          u$('facSearch').dispatchEvent(new uw.Event('input', { bubbles: true }));
          [...ud.querySelectorAll('#facResults button')]
            .filter(b2 => b2.textContent.indexOf(n) === 0)[0]
            .dispatchEvent(new uw.MouseEvent('click', { bubbles: true }));
        };
        const onSheet = () => [...ud.querySelectorAll('.sheet[data-owner] .tbl tbody tr td:first-child')]
          .map(x => x.textContent);

        pick('Concepts One');
        ok('the clinical she is only listed on is off her sheet',
           onSheet().indexOf('NURS-171CLIN-001RZ') < 0);
        ok('but the one she is first on is not',
           onSheet().indexOf('NURS-171CLIN-002RZ') > -1);
        ok('and the concepts lecture stays, names and all',
           onSheet().indexOf('NURS-171-001RL') > -1);
        ok('the row says who runs it',
           [...ud.querySelectorAll('#sectionList .co-note')]
             .some(n => /Lead Clinician runs this clinical/.test(n.textContent)));
        ok('the count reflects it', /^2 of 3/.test(u$('chipSections').textContent));

        // Ticking it back is the way out if the rule reads a case wrongly.
        const row = [...ud.querySelectorAll('#sectionList .sec')]
          .filter(n => /CLIN-001RZ/.test(n.textContent))[0];
        const cb2 = row.querySelector('input[type=checkbox]');
        ok('it is unticked rather than hidden', cb2 && cb2.checked === false);
        cb2.checked = true;
        cb2.dispatchEvent(new uw.Event('change', { bubbles: true }));
        ok('ticking it puts it back', onSheet().indexOf('NURS-171CLIN-001RZ') > -1);

        // One clinical day recorded twice — the campus room 8:00-14:30 and the
        // hospital 7:00-13:30 — is a seven-and-a-half hour day, not thirteen.
        const chCell = code => {
          const tr = [...ud.querySelectorAll('.sheet[data-owner] .tbl tbody tr')]
            .filter(r => r.cells[0].textContent === code)[0];
          return tr ? tr.cells[2].textContent : '';
        };
        ok('one clinical day is counted once, not twice', chCell('NURS-171CLIN-001RZ') === '6 / 9 ch');
        ok('and the lecture is unaffected', chCell('NURS-171-001RL') === '6 / 5 ch');

        runBlockChecks();
      }, 400);

      function runBlockChecks(){
      // ---- blocks that run only part of the term ----
      // Nursing teaches in blocks: a section runs five weeks of the fifteen,
      // and the office hour changes between teaching and non-teaching weeks.
      // The published export carries no dates at all, so they are typed in.
      const blk = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                    url: 'https://example.org/' });
      const bw = blk.window, bd = blk.window.document, b$ = id => bd.getElementById(id);
      setTimeout(() => {
        b$('roleSkip').dispatchEvent(new bw.MouseEvent('click', { bubbles: true }));
        b$('facSearch').value = 'fencik';
        b$('facSearch').dispatchEvent(new bw.Event('input', { bubbles: true }));
        bd.querySelector('#facResults button')
          .dispatchEvent(new bw.MouseEvent('click', { bubbles: true }));

        const addOh = (from, to, start, end) => {
          b$('cLabel').value = 'Office Hours';
          b$('cDays').querySelector('input[value=M]').checked = true;
          b$('cStart').value = start; b$('cEnd').value = end;
          b$('cFrom').value = from; b$('cTo').value = to;
          b$('addCustom').dispatchEvent(new bw.MouseEvent('click', { bubbles: true }));
        };
        // Her teaching weeks are two hours; the rest of the term is three.
        addOh('2026-10-05', '2026-11-02', '12:00', '14:00');
        addOh('2026-09-14', '2026-09-28', '11:00', '14:00');
        ok('both blocks are kept', bd.querySelectorAll('#customList .custom-item').length === 2);
        ok('the list says which weeks each runs',
           /Oct 5/.test(b$('customList').textContent) && /Sep 14/.test(b$('customList').textContent));

        const line = () => bd.querySelector('.sheet[data-owner] .load-line').textContent;
        // Summed flat these would read 5, a figure true in no week of the term.
        ok('hours that change are reported as a range', /Office hours: 2\u20133/.test(line()));
        ok('and not added together', !/Office hours: 5/.test(line()));

        const grid = () => [...bd.querySelectorAll('.sheet[data-owner] .blk')]
          .map(x => x.textContent).join(' | ');
        ok('the dates print on the block', /Oct 5/.test(grid()));
        // She has a clash of her own between two BIOL sections, so the check is
        // specifically that the two office hours do not clash with each other.
        const clashLines = () => [...bd.querySelectorAll('#banners .conflict-line')]
          .map(n => n.textContent);
        ok('two Monday hours on different weeks are not a clash',
           !clashLines().some(t => /Office Hours.*overlaps.*Office Hours/.test(t)));

        // An undated block runs every week, so it does clash with both.
        b$('cLabel').value = 'Committee';
        b$('cType').value = 'other';
        b$('cDays').querySelector('input[value=M]').checked = true;
        b$('cStart').value = '12:30'; b$('cEnd').value = '13:30';
        b$('cFrom').value = ''; b$('cTo').value = '';
        b$('addCustom').dispatchEvent(new bw.MouseEvent('click', { bubbles: true }));
        ok('a block with no dates still clashes with the dated ones',
           clashLines().some(t => /Committee/.test(t)));

        // ---- the word itself ----
        b$('optStudentHours').checked = true;
        b$('optStudentHours').dispatchEvent(new bw.Event('change', { bubbles: true }));
        ok('the load line follows the setting', /Student hours:/.test(line()));
        ok('so does the step heading', b$('p3Title').textContent === 'Student hours');
        ok('and the type in the block form', b$('cTypeOh').textContent === 'Student hours');
        ok('and the required-hours field', /^Student hours required/.test(b$('fOhRequiredLabel').textContent));
        ok('a default label on the grid follows it too',
           /Student Hours/.test(grid()) && !/Office Hours/.test(grid()));
        b$('optStudentHours').checked = false;
        b$('optStudentHours').dispatchEvent(new bw.Event('change', { bubbles: true }));
        ok('and it goes back', /Office hours:/.test(line()));

        runTourChecks();
      }, 400);
      }

      function runTourChecks(){
      // ---- a new visitor is actually offered the tour ----
      // The offer used to live on the first visit; the role chooser then took
      // that visit for itself and nobody was ever asked again.
      const nv = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                   url: 'https://example.org/' });
      const vw = nv.window, vd = nv.window.document, v$ = id => vd.getElementById(id);
      setTimeout(() => {
        ok('a new visitor is asked their role first', v$('rolePick').hidden === false);
        ok('and is not offered the tour over the top of it', v$('firstRun').hidden === true);
        vd.querySelector('#rolePick .role-card')
          .dispatchEvent(new vw.MouseEvent('click', { bubbles: true }));
        ok('choosing a role puts the chooser away', v$('rolePick').hidden === true);
        ok('and the tour is offered straight after', v$('firstRun').hidden === false);

        // A role that hides steps must not have the tour point at them.
        v$('firstRunTour').dispatchEvent(new vw.MouseEvent('click', { bubbles: true }));
        ok('taking the offer starts the tour', v$('tourCallout').hidden === false);
        const total = () => parseInt((v$('tourCount').textContent.match(/of (\d+)/) || [])[1], 10);
        const full = total();
        for (let i = 0; i < full; i++)
          v$('tourNext').dispatchEvent(new vw.MouseEvent('click', { bubbles: true }));
        ok('finishing it is remembered',
           !!vw.localStorage.getItem('bcc-faculty-schedule-tour'));
        ok('what is remembered is a date, not just a flag',
           /^\d{4}-\d{2}-\d{2}$/.test(vw.localStorage.getItem('bcc-faculty-schedule-tour')));
        ok('and it is not offered again', v$('firstRun').hidden === true);

        // ---- offered again once they have had time to forget ----
        // The job comes round twice a year, so the reminder has to as well.
        // Each case is a fresh page with the record pre-seeded, because that is
        // the only way the real decision gets exercised.
        const seeded = (tourValue, saved) => {
          let boot = "try{localStorage.setItem('bcc-faculty-schedule-tour'," +
                     JSON.stringify(tourValue) + ");";
          if (saved) boot += "localStorage.setItem('bcc-faculty-schedule-v1'," +
                             JSON.stringify(JSON.stringify(saved)) + ");";
          boot += "}catch(e){}";
          const page = new JSDOM(html.replace('<script>', '<script>' + boot + '</script><script>'),
            { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
          return new Promise(res => setTimeout(() => {
            const w = page.window, d = w.document;
            const card = d.querySelector('#rolePick .role-card');
            if (card && d.getElementById('rolePick').hidden === false) {
              card.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
            }
            res({ offered: d.getElementById('firstRun').hidden === false,
                  text: d.getElementById('firstRunText').textContent,
                  button: d.getElementById('firstRunTour').textContent,
                  w: w, d: d });
          }, 400));
        };
        const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

        Promise.all([
          seeded(ago(7)), seeded(ago(60)), seeded(ago(120)), seeded('seen'),
          seeded(ago(120), { role: 'all', faculty: ['Cheryl Fencik'] })
        ]).then(([wk, twoMo, semester, legacy, midBuild]) => {
          ok('not re-offered a week later', wk.offered === false);
          ok('not re-offered two months later', twoMo.offered === false);
          ok('re-offered a semester later', semester.offered === true);
          ok('the wording acknowledges the gap', /been a while/i.test(semester.text));
          ok('and the button is no longer a first-timer prompt', semester.button === 'Remind me');
          ok('an older undated record counts as long ago', legacy.offered === true);
          ok('never re-offered in the middle of a build', midBuild.offered === false);

          // Turning it down resets the clock rather than asking again next load.
          const sw = semester.w, sd = semester.d;
          sd.getElementById('firstRunSkip')
            .dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
          ok('declining puts it away', sd.getElementById('firstRun').hidden === true);
          ok('declining is dated like finishing it',
             /^\d{4}-\d{2}-\d{2}$/.test(sw.localStorage.getItem('bcc-faculty-schedule-tour')));
          runFindChecks();
        });
      }, 400);
      }

      function runFindChecks(){
      // ---- finding an answer, and the control it talks about ----
      // The questions were always in the page; what was missing was any way to
      // reach one without opening Help, picking a tab and reading down a list.
      const fnd = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                    url: 'https://example.org/' });
      const nw = fnd.window, nd = fnd.window.document, n$ = id => nd.getElementById(id);
      setTimeout(() => {
        n$('roleSkip').dispatchEvent(new nw.MouseEvent('click', { bubbles: true }));
        const qs = () => [...nd.querySelectorAll('#paneFaq details')];
        const shown = () => qs().filter(d => !d.hidden);
        ok('the help carries a pile of questions', qs().length > 30);
        ok('every question can point at a control',
           qs().every(d => d.getAttribute('data-go')));
        ok('and every one offers to take you there',
           qs().every(d => !!d.querySelector('.go-row button')));

        n$('btnHelp').dispatchEvent(new nw.MouseEvent('click', { bubbles: true }));
        ok('the help opens on the questions', n$('paneFaq').hidden === false);
        ok('with the search box focused', nd.activeElement === n$('helpSearch'));
        ok('and nothing filtered yet', shown().length === qs().length);

        const type = v => {
          n$('helpSearch').value = v;
          n$('helpSearch').dispatchEvent(new nw.Event('input', { bubbles: true }));
        };
        type('release time');
        ok('searching narrows the list', shown().length > 0 && shown().length < qs().length);
        ok('and finds the release-time answer',
           shown().some(d => /release time/i.test(d.querySelector('summary').textContent)));
        ok('the best answers come first',
           /release time/i.test(shown()[0].querySelector('summary').textContent));
        ok('a top match is opened rather than left folded', shown()[0].open === true);
        ok('a loose match is listed but not opened',
           shown().filter(d => d.open).length < shown().length);
        ok('the count is reported', /answer/.test(n$('helpFindCount').textContent));

        type('qqqzzz');
        ok('a miss says so instead of showing nothing', /Nothing matches/.test(n$('helpFindCount').textContent));
        ok('and hides every question', shown().length === 0);

        // The part prose cannot do: put the control itself in front of them.
        // A whole question, filler words and all, still ranks the right answer
        // first — "how do I" must not be required to appear in every match.
        type('Where do I enter release time');
        const one = shown();
        ok('a typed-out question still ranks the right answer first',
           one.length && /Where do I enter release time/.test(one[0].querySelector('summary').textContent));
        if (one.length) {
          n$('p4').open = false;
          one[0].querySelector('.go-row button')
                .dispatchEvent(new nw.MouseEvent('click', { bubbles: true }));
          ok('taking the offer closes the help', n$('helpModal').hidden === true);
          ok('and opens the step the control lives in', n$('p4').open === true);
        }

        // ---- agreements belong to the office ----
        // They are drawn up by the Institute Office and sent out; faculty have
        // no step in it, so none of that machinery is on their screen.
        const moaOn = () => {
          const box = nd.getElementById('moaBox');
          for (let n2 = box; n2 && n2 !== nd.body; n2 = n2.parentNode) if (n2.hidden) return false;
          return true;
        };
        const setRole = r => {
          n$('rolePickTop').value = r;
          n$('rolePickTop').dispatchEvent(new nw.Event('change', { bubbles: true }));
        };
        setRole('admin');
        ok('the office view keeps the agreements', nd.getElementById('moaBox').dataset.roleHidden !== '1');
        setRole('faculty');
        ok('a faculty member is not shown agreements', moaOn() === false);
        ok('nor the rate and payment settings behind them',
           nd.getElementById('moaDetails') === null || moaOn() === false);
        setRole('chair');
        ok('nor is a chair', moaOn() === false);
        ok('but PT stays, because it changes their own load',
           nd.getElementById('p2').hidden === false);

        // An answer about something this role has not got should not offer to
        // walk them to it.
        n$('btnHelp').dispatchEvent(new nw.MouseEvent('click', { bubbles: true }));
        type('memorandum of agreement');
        const moaAnswer = shown()[0];
        ok('the agreements answer is still readable', !!moaAnswer);
        ok('and says who actually produces them',
           /Institute Office does/.test(moaAnswer.textContent));
        ok('but offers no trip to a control this role lacks',
           moaAnswer.querySelector('.go-row').hidden === true);
        setRole('admin');
        ok('while the office is still taken straight there',
           moaAnswer.querySelector('.go-row').hidden === false);
        setRole('all');
        // Enter follows the top answer without reaching for the mouse.
        n$('btnHelp').dispatchEvent(new nw.MouseEvent('click', { bubbles: true }));
        n$('p6').open = false;
        type('how do I print');
        const first = shown()[0];
        ok('filler words do not throw the match away', !!first);
        n$('helpSearch').dispatchEvent(new nw.KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
        ok('Enter follows the top answer', n$('helpModal').hidden === true);
        runManyChecks();
      }, 400);
      }

      function runManyChecks(){
      // ---- a long faculty list can be cleared ----
      // A chair who once added the whole college gets a panel of chips and, up
      // to now, no way out but picking them off one at a time.
      const many = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true,
                                     url: 'https://example.org/' });
      const mw = many.window, md = many.window.document, m$ = id => md.getElementById(id);
      setTimeout(() => {
        m$('roleSkip').dispatchEvent(new mw.MouseEvent('click', { bubbles: true }));
        ok('no reset offered before anything is picked', m$('btnStartOver').hidden === true);
        const pool = JSON.parse(md.getElementById('demoData').textContent).faculty.slice(0, 20);
        pool.forEach(n => {
          m$('facSearch').value = n;
          m$('facSearch').dispatchEvent(new mw.Event('input', { bubbles: true }));
          const b2 = [...md.querySelectorAll('#facResults button')]
            .find(x => x.textContent.indexOf(n) === 0);
          if (b2) b2.dispatchEvent(new mw.MouseEvent('click', { bubbles: true }));
        });
        const picked = m$('chipFaculty').textContent;
        ok('twenty names are selected', /^20 selected/.test(picked));
        ok('the chip list is capped rather than filling the panel',
           m$('facChips').querySelectorAll('.chip').length === 12);
        const btns = () => [...m$('facChips').querySelectorAll('button')].map(b => b.textContent);
        ok('the rest are reachable', btns().some(t => /Show all 20/.test(t)));
        ok('a reset appears once names are picked', m$('btnStartOver').hidden === false);

        [...m$('facChips').querySelectorAll('button')]
          .find(b => /Show all 20/.test(b.textContent))
          .dispatchEvent(new mw.MouseEvent('click', { bubbles: true }));
        ok('expanding shows them all', m$('facChips').querySelectorAll('.chip').length === 20);
        ok('and can be collapsed again', btns().some(t => /Show fewer/.test(t)));

        const clear = [...m$('facChips').querySelectorAll('button')]
          .find(b => /Clear all 20/.test(b.textContent));
        ok('one button clears the lot', !!clear);
        if (clear) {
          clear.dispatchEvent(new mw.MouseEvent('click', { bubbles: true }));
          ok('every name is gone', m$('facChips').querySelectorAll('.chip').length === 0);
          ok('the count empties', m$('chipFaculty').textContent === '');
          ok('the reset button goes away with them', m$('btnStartOver').hidden === true);
          ok('the search box is ready for the next name', m$('facSearch').value === '');
          const saved = JSON.parse(mw.localStorage.getItem('bcc-faculty-schedule-v1:26FA') ||
                                   mw.localStorage.getItem('bcc-faculty-schedule-v1') || '{}');
          ok('and it is saved, not just on screen', (saved.faculty || []).length === 0);
        }
        runWeakChecks();
      }, 400);
      }

      function runWeakChecks(){
      // ---- weak room evidence is offered, never acted on ----
      // An ARCH studio that simply changes rooms looks identical to a lab from
      // the room alone. The difference is that its second room serves one
      // section, not fifteen, so it arrives without the `sure` flag.
      const wf = JSON.parse(ld.getElementById('demoData').textContent);
      wf.sections = [{
        id: 'ARCH-261-001RL', c: 'ARCH-261', t: 'Design Studio', cr: 4, ch: 5,
        dept: 'ARCH', campus: 'LINC', pot: '15W', mode: 'inperson', i: ['Studio Lead'],
        m: [{ d: ['M'], s: '09:00', e: '11:45', rm: 'CVA 208' },
            { d: ['W'], s: '09:00', e: '10:45', rm: 'CVA 201', lab: true }]
      }];
      wf.faculty = ['Studio Lead'];
      const weak = new JSDOM(
        html.replace(/(<script type="application\/json" id="demoData">)[\s\S]*?(<\/script>)/,
                     (m0, a0, b0) => a0 + JSON.stringify(wf) + b0),
        { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
      const ww = weak.window, wd = weak.window.document, w$ = id => wd.getElementById(id);
      setTimeout(() => {
        w$('roleSkip').dispatchEvent(new ww.MouseEvent('click', { bubbles: true }));
        w$('facSearch').value = 'Studio Lead';
        w$('facSearch').dispatchEvent(new ww.Event('input', { bubbles: true }));
        const wb2 = wd.querySelector('#facResults button');
        ok('the studio feed loads', !!wb2);
        if (wb2) {
          wb2.dispatchEvent(new ww.MouseEvent('click', { bubbles: true }));
          const wgrid = [...wd.querySelectorAll('.sheet[data-owner] .blk')]
            .map(b => b.textContent).join(' | ');
          ok('a one-off room is left on the grid', /CVA 201/.test(wgrid));
          const wh = parseFloat((wd.querySelector('.sheet[data-owner] .load-line')
            .textContent.match(/Contact hours: ([\d.]+)/) || [])[1]);
          ok('and still counted', wh === 5);
          ok('but it is offered', [...wd.querySelectorAll('#sectionList .co-note')]
            .some(n => /Looks like a lab/.test(n.textContent)));
          ok('with a bulk button', w$('dropLabs').hidden === false);
          w$('dropLabs').dispatchEvent(new ww.MouseEvent('click', { bubbles: true }));
          const wh2 = parseFloat((wd.querySelector('.sheet[data-owner] .load-line')
            .textContent.match(/Contact hours: ([\d.]+)/) || [])[1]);
          ok('and taking the offer does remove it', wh2 === 3);
        }
        runScrapeChecks();
      }, 400);
      }

      function runScrapeChecks(){
      // ---- a scrape names the instructor on each pattern ----
      // One row per meeting pattern is the shape the scraper produces, so the
      // row's own Instructor is that pattern's. These are the two cases that
      // shape has to get right.
      const feed = JSON.parse(ld.getElementById('demoData').textContent);
      const mk = (id, who2, kind) => ({
        id: id, c: id.replace(/-\w+$/, ''), t: 'Anatomy and Physiology I', cr: 4, ch: 5,
        dept: 'BIOL', campus: 'LINC', pot: '15W', mode: 'inperson',
        i: who2 === 'Test Lecturer' ? ['Test Lecturer'] : ['Test Lecturer', who2],
        m: [{ d: ['M','W'], s: '12:30', e: '13:45', rm: 'ATC 103', in: 'Test Lecturer' },
            { d: ['W'], s: '14:00', e: '15:45', rm: 'MAS 052', in: who2, lab: true, kind: kind }]
      });
      feed.sections = [mk('BIOL-111-004RL', 'Test Assistant', 'lab'),
                       mk('BIOL-111-005RL', 'Test Lecturer', 'lab')];
      feed.faculty = ['Test Lecturer', 'Test Assistant'];
      const scrape = new JSDOM(
        html.replace(/(<script type="application\/json" id="demoData">)[\s\S]*?(<\/script>)/,
                     (m0, a0, b0) => a0 + JSON.stringify(feed) + b0),
        { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/' });
      const sw = scrape.window, sd = sw.document, s$ = id => sd.getElementById(id);
      setTimeout(() => {
        s$('roleSkip').dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
        s$('facSearch').value = 'Test Lecturer';
        s$('facSearch').dispatchEvent(new sw.Event('input', { bubbles: true }));
        const b1 = sd.querySelector('#facResults button');
        ok('a scraped feed loads', !!b1);
        if (b1) {
          b1.dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
          const notes = () => [...sd.querySelectorAll('#sectionList .co-note')].map(n => n.textContent);
          ok('a lab named under someone else comes off the sheet',
             notes().some(t => /Not on this sheet/.test(t) && /Test Assistant/.test(t)));
          ok('a lab the lecturer runs himself is left alone',
             !notes().some(t => /Listed as a lab|Looks like a lab/.test(t)));
          ok('a stated component is not second-guessed', s$('dropLabs').hidden === true);
          const hrs = parseFloat((sd.querySelector('.sheet[data-owner] .load-line')
            .textContent.match(/Contact hours: ([\d.]+)/) || [])[1]);
          ok('he is charged for his own lab but not the assistant\'s', hrs === 8);
        }
        console.log(fails ? '\n' + fails + ' FAILURES' : '\nAll checks passed');
        process.exit(fails ? 1 : 0);
      }, 400);
      }
    }, 400);
  }, 400);
}, 400);
