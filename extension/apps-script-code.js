// Google Apps Script код для работы с Google Sheets
// Скопируйте этот код в ваш Google Apps Script проект и разверните как веб-приложение

function doGet(e) {
  const sheetName = 'max_imct';
  const ss = SpreadsheetApp.openById('1sXRB-UkFrCl4Qd2ROz36jPqqGY1-a8X9gURztZPYQpA');
  const sheet = ss.getSheetByName(sheetName);
  const callback = (e && e.parameter && e.parameter.callback) || '';
  const userId = (e && e.parameter && e.parameter.userId) || '';
  const limit = Math.min(parseInt((e && e.parameter && e.parameter.limit) || '2000', 10), 5000);

  if (!sheet) {
    const result = { ok: true, rows: [] };
    const output = callback
      ? `${callback}(${JSON.stringify(result)})`
      : JSON.stringify(result);
    return ContentService.createTextOutput(output)
      .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data.shift() || [];
  const rows = [];

  for (let i = data.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = data[i];
    const obj = {};
    headers.forEach((h, idx) => obj[h] = row[idx]);
    if (userId && obj.userId !== userId) continue;
    rows.push(obj);
  }

  const result = { ok: true, rows: rows.reverse() };
  const output = callback
    ? `${callback}(${JSON.stringify(result)})`
    : JSON.stringify(result);

  return ContentService.createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  // Проверка на существование параметра e и e.postData
  if (!e || !e.postData || !e.postData.contents) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No data received' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  const sheetName = 'max_imct';
  const ss = SpreadsheetApp.openById('1sXRB-UkFrCl4Qd2ROz36jPqqGY1-a8X9gURztZPYQpA');
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid JSON: ' + error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const headers = [
    'ts',
    'userId',
    'groupName',
    'groupUrl',
    'participants',
    'admins',
    'owners',
    'delta',
    'hasDigitalVuzAdmin',
    'hasKhlstovAdmin',
    'hasDvfuStatsUser',
    'participants_list'
  ];

  // Создаем заголовки, если лист пустой
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  // Обрабатываем каждую строку
  (body.rows || []).forEach(r => {
    // ВАЖНО: Используем participants_list в первую очередь, затем participantsListStr для обратной совместимости
    const participantsList = r.participants_list || r.participantsListStr || '';
    
    sheet.appendRow([
      body.ts || new Date().toISOString(),
      body.userId || '',
      r.name || '',
      r.url || '',
      r.participants || 0,
      r.adminsCount || 0,
      r.ownersCount || 0,
      r.delta || 0,
      r.hasDigitalVuzAdmin ? 'yes' : 'no',
      r.hasKhlstovAdmin ? 'yes' : 'no',
      r.hasDvfuStatsUser ? 'yes' : 'no',
      participantsList  // Теперь правильно используем participants_list
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
