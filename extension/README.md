# imct_counter - Расширение Chrome

Расширение для автоматического сбора информации о количестве участников в **групповых чатах** мессенджера Max.

**Важно:** Расширение собирает данные только для групповых чатов (ссылки формата `https://web.max.ru/-71128136750354`, начинающиеся с минуса).

## Возможности

- Сбор количества участников, админов и владельцев в группах
- Дашборд с динамикой по снимкам и графиками
- Флаги в дашборде:
  - Цифровой вуз админ
  - Константин Хлыстов админ
  - Статистика чатов ДВФУ (любой участник)
- Экспорт в CSV
- Отправка снимков в Google Sheets и загрузка данных обратно

## Установка

1. Откройте Chrome и перейдите в `chrome://extensions/`
2. Включите "Режим разработчика" (Developer mode) в правом верхнем углу
3. Нажмите "Загрузить распакованное расширение" (Load unpacked)
4. Выберите папку `extension`

## Использование

1. Откройте [web.max.ru](https://web.max.ru) и авторизуйтесь
2. Откройте список чатов
3. Нажмите на иконку расширения в панели инструментов Chrome
4. Нажмите кнопку "Начать сбор данных"
5. Дождитесь завершения процесса (можно отслеживать прогресс)
6. Нажмите "Экспорт в CSV" для сохранения данных

### Дашборд

1. В popup нажмите "Открыть дашборд"
2. Нажмите "Собрать сейчас" для нового снимка
3. В дашборде доступны графики и таблица изменений

### Google Sheets

Для отправки/загрузки используется Apps Script как веб‑приложение.
В `dashboard.js` указывается URL веб‑приложения.

Минимальный Apps Script:

```javascript
function doGet(e) {
  const sheetName = 'max_imct';
  const ss = SpreadsheetApp.openById('1sXRB-UkFrCl4Qd2ROz36jPqqGY1-a8X9gURztZPYQpA');
  const sheet = ss.getSheetByName(sheetName);
  const userId = (e && e.parameter && e.parameter.userId) || '';
  const limit = Math.min(parseInt((e && e.parameter && e.parameter.limit) || '2000', 10), 5000);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: [] }))
      .setMimeType(ContentService.MimeType.JSON);
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

  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows.reverse() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheetName = 'max_imct';
  const ss = SpreadsheetApp.openById('1sXRB-UkFrCl4Qd2ROz36jPqqGY1-a8X9gURztZPYQpA');
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const body = JSON.parse(e.postData.contents || '{}');

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

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  (body.rows || []).forEach(r => {
    // Используем participants_list в первую очередь, затем participantsListStr для обратной совместимости
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
      participantsList
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Формат данных CSV

Экспортированный файл содержит следующие колонки:
- Название чата
- Ссылка на чат
- Количество участников
- Количество админов
- Количество владельцев
- Есть Цифровой вуз Бот
- Список участников

## Примечания

- Расширение собирает данные **только для групповых чатов** (URL начинается с `/-число`)
- Расширение автоматически прокручивает список чатов для загрузки всех элементов
- Для каждого группового чата открывается страница чата для извлечения информации об участниках
- Процесс можно остановить в любой момент кнопкой "Остановить"
- Данные сохраняются автоматически, можно экспортировать после завершения
- Формат ссылок групповых чатов: `https://web.max.ru/-71128136750354`

## Требования

- Google Chrome (версия 88+)
- Доступ к web.max.ru
- Авторизация в мессенджере Max
