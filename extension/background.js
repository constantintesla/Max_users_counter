// Background Service Worker для расширения imct_counter

// Обработка сообщений от content script и popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveData') {
    // Сохранение данных
    chrome.storage.local.set({ collectedData: message.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === 'getData') {
    // Получение данных
    chrome.storage.local.get(['collectedData'], (result) => {
      sendResponse({ data: result.collectedData || [] });
    });
    return true;
  } else if (message.action === 'updateProgress') {
    // Пересылка прогресса в popup
    chrome.runtime.sendMessage({
      action: 'progress',
      current: message.current,
      total: message.total
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'completed') {
    // Завершение работы
    chrome.storage.local.set({ isRunning: false, collectedData: message.data });
    chrome.runtime.sendMessage({
      action: 'completed',
      data: message.data
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'error') {
    // Ошибка
    chrome.storage.local.set({ isRunning: false });
    chrome.runtime.sendMessage({
      action: 'error',
      error: message.error
    });
    sendResponse({ success: true });
    return true;
  }
});

// Обработка установки расширения
chrome.runtime.onInstalled.addListener(() => {
  console.log('imct_counter установлен');
});
