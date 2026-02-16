// Утилиты для работы с данными

/**
 * Парсит количество участников из текста
 * Примеры: "3 из 18 в сети" -> 18, "18 участников" -> 18
 */
function parseParticipants(text) {
  if (!text) return 0;
  
  // Удаляем лишние пробелы
  text = text.trim();
  
  // Ищем паттерн "X из Y" или "X/Y"
  const pattern1 = /(\d+)\s*(?:из|\/)\s*(\d+)/i;
  const match1 = text.match(pattern1);
  if (match1) {
    return parseInt(match1[2], 10); // Возвращаем второе число (общее количество)
  }
  
  // Ищем просто число перед словами "участник", "в сети" и т.д.
  const pattern2 = /(\d+)\s*(?:участник|в сети|член)/i;
  const match2 = text.match(pattern2);
  if (match2) {
    return parseInt(match2[1], 10);
  }
  
  // Ищем любое число в тексте
  const pattern3 = /\d+/;
  const match3 = text.match(pattern3);
  if (match3) {
    return parseInt(match3[0], 10);
  }
  
  return 0;
}

/**
 * Генерирует CSV из массива данных
 */
function generateCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }
  
  const headers = ['Название чата', 'Ссылка', 'Количество участников'];
  
  // Экранирование значений для CSV
  function escapeCSV(value) {
    if (value === null || value === undefined) {
      return '';
    }
    const stringValue = String(value);
    // Заменяем двойные кавычки на две двойные кавычки
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  let csv = headers.join(',') + '\n';
  
  data.forEach(item => {
    const row = [
      escapeCSV(item.name || ''),
      escapeCSV(item.url || ''),
      item.participants || '0'
    ];
    csv += row.join(',') + '\n';
  });
  
  return csv;
}

/**
 * Скачивает CSV файл
 */
function downloadCSV(csv, filename) {
  // Добавляем BOM для корректного отображения кириллицы в Excel
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `max_chats_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Экспорт функций для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseParticipants,
    generateCSV,
    downloadCSV
  };
}
