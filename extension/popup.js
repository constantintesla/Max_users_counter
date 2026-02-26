let isRunning = false;
let collectedData = [];

// Элементы интерфейса
let startBtn, testBtn, stopBtn, resetBtn, exportBtn, exportXlsxBtn, sendBtn, loadBtn, dashboardBtn, status, progress, progressFill, progressText, results, resultsCount;

// Функция для получения элементов интерфейса
function getUIElements() {
  startBtn = document.getElementById('startBtn');
  testBtn = document.getElementById('testBtn');
  stopBtn = document.getElementById('stopBtn');
  resetBtn = document.getElementById('resetBtn');
  exportBtn = document.getElementById('exportBtn');
  exportXlsxBtn = document.getElementById('exportXlsxBtn');
  sendBtn = document.getElementById('sendBtn');
  loadBtn = document.getElementById('loadBtn');
  dashboardBtn = document.getElementById('dashboardBtn');
  status = document.getElementById('status');
  progress = document.getElementById('progress');
  progressFill = document.getElementById('progress-fill');
  progressText = document.getElementById('progress-text');
  results = document.getElementById('results');
  resultsCount = document.getElementById('results-count');
}

// Инициализация при загрузке
function init() {
  getUIElements();
  setupEventListeners();
  loadSavedData();
}

// Функция для отправки сообщения в content script с обработкой ошибок
async function sendMessageToContentScript(tabId, message, retries = 5) {
  return new Promise((resolve, reject) => {
    const trySend = (attempt) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          const isConnectionError = errorMsg.includes('Receiving end does not exist') || 
                                   errorMsg.includes('Could not establish connection');
          
          console.error(`[imct_counter popup] Попытка ${attempt}/${retries}, ошибка: ${errorMsg}`);
          
          if (isConnectionError) {
            if (attempt < retries) {
              // Если это ошибка подключения и у нас еще есть попытки
              if (attempt === 1) {
                // При первой попытке ждем немного (скрипт может еще загружаться)
                setTimeout(() => {
                  trySend(attempt + 1);
                }, 1000);
              } else if (attempt === 2) {
                // При второй попытке пробуем инжектировать скрипт
                console.error('[imct_counter popup] Пробуем инжектировать content script');
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content.js']
                }).then(() => {
                  console.error('[imct_counter popup] Content script инжектирован, ждем и пробуем снова');
                  setTimeout(() => {
                    trySend(attempt + 1);
                  }, 2000);
                }).catch((error) => {
                  console.error('[imct_counter popup] Ошибка при инжекции скрипта:', error);
                  // Продолжаем попытки даже если инжекция не удалась
                  setTimeout(() => {
                    trySend(attempt + 1);
                  }, 1000);
                });
              } else {
                // При последующих попытках просто ждем и пробуем снова
                setTimeout(() => {
                  trySend(attempt + 1);
                }, 1500);
              }
            } else {
              // Все попытки исчерпаны
              reject(new Error('Не удалось установить соединение с content script. Убедитесь, что вы находитесь на странице web.max.ru и перезагрузите страницу (F5).'));
            }
          } else {
            // Другая ошибка
            reject(new Error('Ошибка при отправке сообщения: ' + errorMsg));
          }
        } else {
          // Успешно отправлено
          console.error('[imct_counter popup] Сообщение успешно отправлено');
          resolve(response);
        }
      });
    };
    
    trySend(1);
  });
}

// Настройка обработчиков событий
function setupEventListeners() {
  // Обработчик кнопки "Начать сбор данных"
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (isRunning) {
        return;
      }
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
          if (status) {
            status.textContent = 'Ошибка: откройте страницу web.max.ru';
            status.className = 'status error';
          }
          return;
        }

        // Проверяем, что страница полностью загружена
        if (tab.status !== 'complete') {
          if (status) {
            status.textContent = 'Ожидание загрузки страницы...';
            status.className = 'status';
          }
          // Ждем загрузки страницы
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        isRunning = true;
        collectedData = [];
        updateUI();
        
        chrome.storage.local.set({ isRunning: true, collectedData: [], processedUrls: [] });
        
        if (status) {
          status.textContent = 'Подключение к странице...';
          status.className = 'status running';
        }
        
        try {
          const response = await sendMessageToContentScript(tab.id, { action: 'start' });
          if (response && response.error) {
            if (status) {
              status.textContent = 'Ошибка: ' + response.error;
              status.className = 'status error';
            }
            isRunning = false;
            updateUI();
          }
        } catch (error) {
          if (status) {
            status.textContent = 'Ошибка: ' + error.message;
            status.className = 'status error';
          }
          isRunning = false;
          updateUI();
        }
      } catch (error) {
        if (status) {
          status.textContent = 'Ошибка: ' + error.message;
          status.className = 'status error';
        }
        isRunning = false;
        updateUI();
      }
    });
  } else {
    console.error('[imct_counter] Кнопка startBtn не найдена');
  }

  // Обработчик кнопки "Тест (3 группы)"
  if (testBtn) {
    testBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isRunning) {
        return;
      }
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
          if (status) {
            status.textContent = 'Ошибка: откройте страницу web.max.ru';
            status.className = 'status error';
          }
          return;
        }

        // Проверяем, что страница полностью загружена
        if (tab.status !== 'complete') {
          if (status) {
            status.textContent = 'Ожидание загрузки страницы...';
            status.className = 'status';
          }
          // Ждем загрузки страницы
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        isRunning = true;
        collectedData = [];
        updateUI();
        
        chrome.storage.local.set({ isRunning: true, collectedData: [], processedUrls: [] });
        
        if (status) {
          status.textContent = 'Подключение к странице...';
          status.className = 'status running';
        }
        
        try {
          const response = await sendMessageToContentScript(tab.id, { action: 'start', maxChats: 3 });
          if (response && response.error) {
            if (status) {
              status.textContent = 'Ошибка: ' + response.error;
              status.className = 'status error';
            }
            isRunning = false;
            updateUI();
          } else {
            if (status) {
              status.textContent = 'Тестовый сбор данных (3 группы)...';
              status.className = 'status running';
            }
          }
        } catch (error) {
          if (status) {
            status.textContent = 'Ошибка: ' + error.message;
            status.className = 'status error';
          }
          isRunning = false;
          updateUI();
        }
      } catch (error) {
        if (status) {
          status.textContent = 'Ошибка: ' + error.message;
          status.className = 'status error';
        }
        isRunning = false;
        updateUI();
      }
    });
  } else {
    console.error('[imct_counter] Кнопка testBtn не найдена');
  }

  // Обработчик кнопки "Остановить"
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      if (!isRunning) {
        return;
      }
      
      isRunning = false;
      updateUI();
      chrome.storage.local.set({ isRunning: false });
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && tab.url.includes('web.max.ru')) {
          chrome.tabs.sendMessage(tab.id, { action: 'stop' });
        }
      } catch (error) {
        // Игнорируем ошибки при остановке
      }
      
      if (status) {
        status.textContent = 'Остановлено';
        status.className = 'status';
      }
    });
  }

  // Обработчик кнопки "Сбросить данные"
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Вы уверены, что хотите сбросить все собранные данные?')) {
        collectedData = [];
        isRunning = false;
        
        chrome.storage.local.set({ 
          collectedData: [], 
          isRunning: false,
          processedUrls: [] 
        });
        
        updateUI();
        if (status) {
          status.textContent = 'Данные сброшены';
          status.className = 'status';
        }
        
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.url && tab.url.includes('web.max.ru')) {
            chrome.tabs.sendMessage(tab.id, { action: 'reset' });
          }
        } catch (error) {
          // Игнорируем ошибки при сбросе
        }
      }
    });
  }

  // Обработчик кнопки "Экспорт в CSV"
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (collectedData.length === 0) {
        if (status) {
          status.textContent = 'Нет данных для экспорта';
          status.className = 'status error';
        }
        return;
      }
      
      exportToCSV(collectedData);
    });
  }

  // Обработчик кнопки "Экспорт в XLSX"
  if (exportXlsxBtn) {
    exportXlsxBtn.addEventListener('click', () => {
      if (collectedData.length === 0) {
        if (status) {
          status.textContent = 'Нет данных для экспорта';
          status.className = 'status error';
        }
        return;
      }

      exportToXLSX(collectedData);
    });
  }

  // Обработчик кнопки "Отправить в Google"
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('dashboard.html');
      chrome.tabs.create({ url });
    });
  }

  // Обработчик кнопки "Загрузить из Google"
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('dashboard.html');
      chrome.tabs.create({ url });
    });
  }

  // Обработчик кнопки "Открыть дашборд"
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('dashboard.html');
      chrome.tabs.create({ url });
    });
  }
}

// Загрузка сохраненных данных
function loadSavedData() {
  chrome.storage.local.get(['collectedData', 'isRunning'], (result) => {
    if (result.collectedData && !result.isRunning) {
      collectedData = result.collectedData;
      updateUI();
    } else if (result.isRunning) {
      collectedData = [];
      isRunning = true;
      updateUI();
    }
  });
}


// Обновление интерфейса
function updateUI() {
  if (isRunning) {
    if (startBtn) startBtn.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'block';
    if (exportBtn) exportBtn.style.display = 'none';
    if (exportXlsxBtn) exportXlsxBtn.style.display = 'none';
    if (status) {
      status.textContent = 'Сбор данных...';
      status.className = 'status running';
    }
    if (progress) progress.style.display = 'block';
  } else {
    if (startBtn) startBtn.style.display = 'block';
    if (testBtn) testBtn.style.display = 'block';
    if (stopBtn) stopBtn.style.display = 'none';
    if (collectedData.length > 0) {
      if (exportBtn) exportBtn.style.display = 'block';
      if (exportXlsxBtn) exportXlsxBtn.style.display = 'block';
      if (sendBtn) sendBtn.style.display = 'block';
      if (status) {
        status.textContent = 'Готово';
        status.className = 'status completed';
      }
      if (results) results.style.display = 'block';
      if (resultsCount) resultsCount.textContent = `Обработано чатов: ${collectedData.length}`;
    } else {
      if (exportBtn) exportBtn.style.display = 'none';
      if (exportXlsxBtn) exportXlsxBtn.style.display = 'none';
      if (sendBtn) sendBtn.style.display = 'none';
      if (status) {
        status.textContent = 'Готов к работе';
        status.className = 'status';
      }
      if (results) results.style.display = 'none';
    }
    if (progress) progress.style.display = 'none';
  }
}

// Обновление прогресса
function updateProgress(current, total) {
  console.error('[imct_counter popup] updateProgress:', current, '/', total);
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  // Обновляем элементы интерфейса, если они найдены
  if (!progressFill) {
    progressFill = document.getElementById('progress-fill');
  }
  if (!progressText) {
    progressText = document.getElementById('progress-text');
  }
  if (!progress) {
    progress = document.getElementById('progress');
  }
  
  if (progressFill) {
    progressFill.style.width = percentage + '%';
  } else {
    console.error('[imct_counter popup] progressFill не найден');
  }
  
  if (progressText) {
    progressText.textContent = `${current} / ${total}`;
  } else {
    console.error('[imct_counter popup] progressText не найден');
  }
  
  // Показываем прогресс, если он есть
  if (total > 0 && progress) {
    progress.style.display = 'block';
  }
}

// Обработчик сообщений (добавляется один раз)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.error('[imct_counter popup] Получено сообщение:', message.action, message);
  
  if (message.action === 'progress' || message.action === 'updateProgress') {
    updateProgress(message.current, message.total);
  } else if (message.action === 'data') {
    collectedData = message.data;
    updateUI();
  } else if (message.action === 'completed') {
    isRunning = false;
    collectedData = message.data;
    chrome.storage.local.set({ isRunning: false, collectedData: message.data });
    updateUI();
  } else if (message.action === 'error') {
    isRunning = false;
    status.textContent = 'Ошибка: ' + message.error;
    status.className = 'status error';
    chrome.storage.local.set({ isRunning: false });
    updateUI();
  } else if (message.action === 'chatUrls') {
    // Получены ссылки на чаты
    const foundCount = message.foundWithoutOpening || message.urls.length;
    const withoutUrlCount = message.chatsWithoutUrl ? message.chatsWithoutUrl.length : 0;
    let statusText = `Найдено ссылок: ${foundCount} из ${message.total} чатов (без открытия).`;
    if (withoutUrlCount > 0) {
      statusText += ` Без URL: ${withoutUrlCount}.`;
    }
    if (status) {
      status.textContent = statusText;
      status.className = 'status';
    }
  }
});

// Экспорт в CSV
function exportToCSV(data) {
  if (data.length === 0) return;
  
  // Заголовки CSV
  const headers = [
    'Название чата', 
    'Ссылка', 
    'Количество участников',
    'Количество админов',
    'Количество владельцев',
    'Есть Цифровой вуз Бот',
    'Список участников'
  ];
  
  // Формирование CSV
  let csv = headers.join(',') + '\n';
  
  data.forEach(item => {
    // Формируем список участников с ролями
    let participantsListStr = '';
    if (item.participantsList && item.participantsList.length > 0) {
      participantsListStr = item.participantsList.map(p => {
        let role = '';
        if (p.isOwner) role = ' (Владелец)';
        else if (p.isAdmin) role = ' (Админ)';
        return p.name + role;
      }).join('; ');
    }
    
    const row = [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.url || '').replace(/"/g, '""')}"`,
      item.participants || '0',
      item.adminsCount || '0',
      item.ownersCount || '0',
      item.hasDigitalVuzBot ? 'Да' : 'Нет',
      `"${participantsListStr.replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });
  
  // Создание и скачивание файла
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `max_chats_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  
  if (status) {
    status.textContent = 'CSV файл скачан';
    status.className = 'status completed';
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toExcelColumnName(index) {
  let col = '';
  let current = index;
  while (current >= 0) {
    col = String.fromCharCode((current % 26) + 65) + col;
    current = Math.floor(current / 26) - 1;
  }
  return col;
}

function formatParticipantsList(item) {
  if (!item || !Array.isArray(item.participantsList) || item.participantsList.length === 0) {
    return '';
  }
  return item.participantsList.map(p => {
    let role = '';
    if (p.isOwner) role = ' (Владелец)';
    else if (p.isAdmin) role = ' (Админ)';
    return (p.name || '') + role;
  }).join('; ');
}

function createZipFromEntries(entries) {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c >>> 0;
  }

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;

  entries.forEach(entry => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + dataBytes.length;
    centralSize += centralHeader.length;
  });

  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function createSheetXml(rows) {
  const allRowsXml = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cellsXml = row.map((value, colIndex) => {
      const cellRef = `${toExcelColumnName(colIndex)}${rowNumber}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${cellRef}"><v>${value}</v></c>`;
      }
      const escaped = escapeXml(value == null ? '' : String(value));
      return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cellsXml}</row>`;
  }).join('');

  const lastCol = toExcelColumnName(Math.max(0, rows[0].length - 1));
  const lastRow = rows.length;
  const dimension = `A1:${lastCol}${lastRow}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${allRowsXml}</sheetData>
</worksheet>`;
}

// Экспорт в XLSX
function exportToXLSX(data) {
  if (data.length === 0) return;

  const headers = [
    'Название чата',
    'Ссылка',
    'Количество участников',
    'Количество админов',
    'Количество владельцев',
    'Есть Цифровой вуз Бот',
    'Список участников'
  ];

  const rows = [headers];
  data.forEach(item => {
    rows.push([
      item.name || '',
      item.url || '',
      Number(item.participants) || 0,
      Number(item.adminsCount) || 0,
      Number(item.ownersCount) || 0,
      item.hasDigitalVuzBot ? 'Да' : 'Нет',
      formatParticipantsList(item)
    ]);
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Данные" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1">
    <font><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="1">
    <fill><patternFill patternType="none"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  </cellXfs>
</styleSheet>`;

  const sheetXml = createSheetXml(rows);

  const xlsxBlob = createZipFromEntries([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: relsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml }
  ]);

  const url = URL.createObjectURL(xlsxBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `max_chats_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);

  if (status) {
    status.textContent = 'XLSX файл скачан';
    status.className = 'status completed';
  }
}

// Инициализация при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
