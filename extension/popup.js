let isRunning = false;
let collectedData = [];

// Элементы интерфейса
let startBtn, testBtn, stopBtn, resetBtn, exportBtn, status, progress, progressFill, progressText, results, resultsCount;

// Функция для получения элементов интерфейса
function getUIElements() {
  startBtn = document.getElementById('startBtn');
  testBtn = document.getElementById('testBtn');
  stopBtn = document.getElementById('stopBtn');
  resetBtn = document.getElementById('resetBtn');
  exportBtn = document.getElementById('exportBtn');
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
      if (status) {
        status.textContent = 'Готово';
        status.className = 'status completed';
      }
      if (results) results.style.display = 'block';
      if (resultsCount) resultsCount.textContent = `Обработано чатов: ${collectedData.length}`;
    } else {
      if (exportBtn) exportBtn.style.display = 'none';
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

// Инициализация при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
