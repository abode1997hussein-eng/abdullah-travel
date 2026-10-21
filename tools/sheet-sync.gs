// سافر مع عبدالله: أي تعديل بأكسل الشركة يحدّث الموقع خلال دقيقة تقريباً.
// سكربت مستقل بحسابك (script.google.com ← New project)، ما يحتاج صلاحية تعديل على الأكسل، بس عرض.
// كل دقيقة يشوف وقت آخر تعديل بالأكسل، وإذا تغيّر يبلّغ الموقع يتحدث.
// التوكن ينحط بإعدادات المشروع ← Script properties باسم GITHUB_TOKEN (مو بهذا الملف).
// بعدها شغّل setup مرة وحدة.

const SHEET_ID = '1EE1rFTwHFsm6fIUglgcI4zaH1i8FB4gNzmwhPbWogy0';
const REPO = 'abode1997hussein-eng/abdullah-travel';
const WORKFLOW = 'sheet-sync.yml';

function checkSheet() {
  const p = PropertiesService.getScriptProperties();
  const updated = String(DriveApp.getFileById(SHEET_ID).getLastUpdated().getTime());
  if (updated === p.getProperty('LAST')) return;
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + p.getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() === 204) p.setProperty('LAST', updated);  // إذا فشل يحاول بالدقيقة الجاية
  else console.log('GitHub:', r.getResponseCode(), r.getContentText());
}

// تشغيل مرة وحدة: يركّب الفحص كل دقيقة ويجرّبه هسه
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('checkSheet').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().deleteProperty('LAST');
  checkSheet();
}
