// سافر مع عبدالله: أي تعديل بالأكسل يحدّث الموقع خلال دقيقة تقريباً.
// ينلصق بالأكسل من: الإضافات (Extensions) ← Apps Script.
// التوكن ينحط بإعدادات المشروع ← Script properties باسم GITHUB_TOKEN (مو بهذا الملف).
// بعدها شغّل setup مرة وحدة.

const REPO = 'abode1997hussein-eng/abdullah-travel';
const WORKFLOW = 'sheet-sync.yml';

// أي تعديل يعلّم إن الأكسل تغيّر
function markDirty() {
  PropertiesService.getScriptProperties().setProperty('DIRTY', '1');
}

// كل دقيقة: إذا الأكسل تغيّر، يبلّغ الموقع يتحدث (مرة وحدة حتى لو صارت تعديلات هواية)
function pushIfDirty() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('DIRTY') !== '1') return;
  p.deleteProperty('DIRTY');
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + p.getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 204) {
    p.setProperty('DIRTY', '1');  // يحاول بالدقيقة الجاية
    console.log('GitHub:', r.getResponseCode(), r.getContentText());
  }
}

// تشغيل مرة وحدة: يركّب المراقبة
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('markDirty').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('markDirty').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('pushIfDirty').timeBased().everyMinutes(1).create();
  markDirty();
  pushIfDirty();
}
