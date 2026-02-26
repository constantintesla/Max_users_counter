let isRunning = false;
let snapshots = [];

let collectBtn;
let sendBtn;
let loadBtn;
let statusEl;
let progressEl;
let progressFillEl;
let progressTextEl;
let lastUpdatedEl;
let emptyStateEl;
let tableEl;
let tableBodyEl;
let inviteTableEl;
let inviteTableBodyEl;
let summaryTotalEl;
let summaryUpEl;
let summaryDownEl;
let summarySameEl;
let summaryDigitalVuzEl;
let summaryKhlstovEl;
let summaryDvfuEl;
let summaryPercentEl;
let percentBarFillEl;
let chartsEl;
let chartTotalEl;
let chartChangesEl;
let chartTopChangesEl;
let recalcBtn;

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUL2lwOOcJCzjPKnMniEl1nihZ20bdzXNLVLac5YTNXUa7s8ATo1byI_fWAvCOdfWxEQ/exec';

function getUIElements() {
  collectBtn = document.getElementById('collectBtn');
  sendBtn = document.getElementById('sendBtn');
  loadBtn = document.getElementById('loadBtn');
  recalcBtn = document.getElementById('recalcBtn');
  statusEl = document.getElementById('status');
  progressEl = document.getElementById('progress');
  progressFillEl = document.getElementById('progress-fill');
  progressTextEl = document.getElementById('progress-text');
  lastUpdatedEl = document.getElementById('lastUpdated');
  emptyStateEl = document.getElementById('emptyState');
  tableEl = document.getElementById('resultsTable');
  tableBodyEl = document.getElementById('tableBody');
  inviteTableEl = document.getElementById('inviteTable');
  inviteTableBodyEl = document.getElementById('inviteTableBody');
  summaryTotalEl = document.getElementById('summary-total');
  summaryUpEl = document.getElementById('summary-up');
  summaryDownEl = document.getElementById('summary-down');
  summarySameEl = document.getElementById('summary-same');
  summaryDigitalVuzEl = document.getElementById('summary-digitalvuz');
  summaryKhlstovEl = document.getElementById('summary-khlstov');
  summaryDvfuEl = document.getElementById('summary-dvfu');
  summaryPercentEl = document.getElementById('summary-percent');
  percentBarFillEl = document.getElementById('percentBarFill');
  chartsEl = document.getElementById('charts');
  chartTotalEl = document.getElementById('chartTotal');
  chartChangesEl = document.getElementById('chartChanges');
  chartTopChangesEl = document.getElementById('chartTopChanges');
}

function updateStatus(text, type) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ` ${type}` : '');
}

function updateProgress(current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  if (progressFillEl) {
    progressFillEl.style.width = `${percentage}%`;
  }
  if (progressTextEl) {
    progressTextEl.textContent = `${current} / ${total}`;
  }
  if (progressEl) {
    progressEl.style.display = total > 0 ? 'block' : 'none';
  }
}

function updateUIRunning() {
  if (collectBtn) collectBtn.disabled = isRunning;
  if (isRunning) {
    updateStatus('Сбор данных...', 'running');
  } else {
    updateStatus('Готов к работе', '');
  }
}

function normalizePersonName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[·•]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAdminByName(participantsList, expectedName) {
  const target = normalizePersonName(expectedName);
  return (participantsList || []).some(p => {
    if (!p || !p.name) return false;
    const person = normalizePersonName(p.name);
    if (!person.includes(target)) return false;
    if (p.isAdmin || p.isOwner) return true;
    // Фолбек: иногда роль остается в тексте имени
    return person.includes('админ') || person.includes('admin');
  });
}

function hasParticipantByName(participantsList, expectedName) {
  const target = normalizePersonName(expectedName);
  return (participantsList || []).some(p => {
    if (!p || !p.name) return false;
    const person = normalizePersonName(p.name);
    return person.includes(target);
  });
}

function buildSnapshot(data, timestamp) {
  const groups = {};
  (data || []).forEach(item => {
    // Используем URL как ключ (если есть), иначе name
    // Это предотвращает перезапись групп с одинаковым названием
    const key = item.url ? item.url.trim() : (item.name || '').trim();
    if (!key) {
      console.warn('[imct_counter dashboard] Пропущен элемент без URL и названия:', item);
      return;
    }
    
    const participantsList = Array.isArray(item.participantsList) ? item.participantsList : [];
    const hasDigitalVuzAdmin = hasAdminByName(participantsList, 'Цифровой вуз');
    const hasKhlstovAdmin = hasAdminByName(participantsList, 'Константин Хлыстов');
    const hasDvfuStatsUser = hasParticipantByName(participantsList, 'Статистика чатов ДВФУ');
    const participantsListStr = participantsList.map(p => {
      if (!p || !p.name) return '';
      let role = '';
      if (p.isOwner) role = ' (Владелец)';
      else if (p.isAdmin) role = ' (Админ)';
      return `${p.name}${role}`;
    }).filter(Boolean).join('; ');
    
    const participants = Number(item.participants) || 0;
    const adminsCount = Number(item.adminsCount) || 0;
    const ownersCount = Number(item.ownersCount) || 0;
    
    // Проверяем, не перезаписываем ли мы существующую группу
    if (groups[key]) {
      console.warn(`[imct_counter dashboard] Дубликат ключа "${key}":`, {
        existing: groups[key],
        new: { name: item.name, participants, participantsListStr: participantsListStr.substring(0, 50) + '...' }
      });
    }
    
    // Проверка: если есть участники, но список пустой - это проблема
    if (participants > 0 && !participantsListStr && participantsList.length === 0) {
      console.warn(`[imct_counter dashboard] Группа "${item.name || key}" имеет ${participants} участников, но participantsList пустой!`, {
        key,
        name: item.name,
        url: item.url,
        participants,
        participantsListLength: participantsList.length,
        hasParticipantsList: Array.isArray(item.participantsList)
      });
    }
    
    groups[key] = {
      name: item.name || key,
      url: item.url || '',
      participants: participants,
      adminsCount: adminsCount,
      ownersCount: ownersCount,
      hasDigitalVuzAdmin: hasDigitalVuzAdmin,
      hasKhlstovAdmin: hasKhlstovAdmin,
      hasDvfuStatsUser: hasDvfuStatsUser,
      participantsListStr: participantsListStr,
      inviteLink: item.inviteLink || ''
    };
  });
  return {
    timestamp: timestamp || Date.now(),
    groups: groups
  };
}

function generateUserId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'uid-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateUserId() {
  return new Promise(resolve => {
    chrome.storage.local.get(['userId'], result => {
      if (result.userId) {
        resolve(result.userId);
        return;
      }
      const newId = generateUserId();
      chrome.storage.local.set({ userId: newId }, () => resolve(newId));
    });
  });
}

function buildRowsForSnapshot(snapshot, prevSnapshot) {
  const current = snapshot.groups || {};
  const prev = prevSnapshot ? (prevSnapshot.groups || {}) : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  const rows = [];
  const isFirstSnapshot = !prevSnapshot;
  keys.forEach(key => {
    const curr = current[key];
    const prevItem = prev[key];
    const currCount = curr ? curr.participants : 0;
    const prevCount = prevItem ? prevItem.participants : 0;
    
    // Правильный расчет дельты:
    // - Если это первый снимок, дельта = 0
    // - Если группа появилась впервые (есть в current, но нет в prev), дельта = 0
    // - Если группа исчезла (есть в prev, но нет в current), дельта = -prevCount
    // - Если группа есть в обоих, дельта = currCount - prevCount
    let delta = 0;
    if (isFirstSnapshot) {
      delta = 0; // Первый снимок - нет изменений
    } else if (curr && !prevItem) {
      delta = 0; // Новая группа - считаем что изменений нет
    } else if (!curr && prevItem) {
      delta = -prevCount; // Группа исчезла
    } else {
      delta = currCount - prevCount; // Обычное изменение
    }
    
    const participantsListStr = curr ? (curr.participantsListStr || '') : '';
    
    // Проверка: если есть участники, но список пустой - это проблема
    if (curr && currCount > 0 && !participantsListStr) {
      console.warn(`[imct_counter dashboard] Группа "${curr.name || key}" имеет ${currCount} участников, но participantsListStr пустой!`, {
        key,
        participants: currCount,
        hasParticipantsList: !!curr.participantsListStr,
        participantsListStrLength: participantsListStr.length
      });
    }
    
    rows.push({
      name: (curr && curr.name) || (prevItem && prevItem.name) || key,
      url: (curr && curr.url) || (prevItem && prevItem.url) || '',
      participants: currCount,
      adminsCount: curr ? curr.adminsCount : 0,
      ownersCount: curr ? curr.ownersCount : 0,
      delta: delta,
      hasDigitalVuzAdmin: curr ? curr.hasDigitalVuzAdmin : false,
      hasKhlstovAdmin: curr ? curr.hasKhlstovAdmin : false,
      hasDvfuStatsUser: curr ? curr.hasDvfuStatsUser : false,
      participantsListStr: participantsListStr,
      inviteLink: (curr && curr.inviteLink) || (prevItem && prevItem.inviteLink) || '',
      // Также отправляем как participants_list для совместимости с Google Apps Script
      participants_list: participantsListStr
    });
  });
  return rows;
}

async function sendSnapshotToSheets(snapshot, prevSnapshot, forceSend = false) {
  if (!APPS_SCRIPT_URL) return;
  return new Promise(resolve => {
    chrome.storage.local.get(['lastSentSnapshotTs'], async result => {
      const lastSent = result.lastSentSnapshotTs || 0;
      if (!forceSend && snapshot.timestamp <= lastSent) {
        console.log('[imct_counter dashboard] Отправка не требуется: снимок уже отправлялся');
        resolve({ skipped: true });
        return;
      }

      const userId = await getOrCreateUserId();
      const rows = buildRowsForSnapshot(snapshot, prevSnapshot);
      
      // Подробное логирование для отладки
      console.log('[imct_counter dashboard] ========== ОТПРАВКА В GOOGLE SHEETS ==========');
      console.log('[imct_counter dashboard] Timestamp снимка:', snapshot.timestamp, 'ISO:', new Date(snapshot.timestamp).toISOString());
      console.log('[imct_counter dashboard] Количество строк:', rows.length);
      console.log('[imct_counter dashboard] UserId:', userId);
      
      if (rows.length > 0) {
        // Проверяем первые 3 строки
        const sampleRows = rows.slice(0, 3);
        sampleRows.forEach((row, idx) => {
          console.log(`[imct_counter dashboard] Строка ${idx + 1}:`, {
            name: row.name,
            url: row.url,
            participants: row.participants,
            participantsListStr: row.participantsListStr ? `[${row.participantsListStr.length} символов] ${row.participantsListStr.substring(0, 100)}...` : 'ПУСТО!',
            participants_list: row.participants_list ? `[${row.participants_list.length} символов] ${row.participants_list.substring(0, 100)}...` : 'ПУСТО!',
            delta: row.delta
          });
        });
        
        // Проверяем, есть ли хотя бы одна строка с participants_list
        const rowsWithParticipants = rows.filter(r => r.participants_list && r.participants_list.length > 0);
        console.log('[imct_counter dashboard] Строк с participants_list:', rowsWithParticipants.length, 'из', rows.length);
        
        // Выводим в статус
        if (statusEl) {
          statusEl.textContent = `Отправка: ${rowsWithParticipants.length}/${rows.length} строк с участниками`;
        }
      }
      
      const payload = {
        ts: new Date(snapshot.timestamp).toISOString(),
        userId: userId,
        rows: rows
      };
      
      console.log('[imct_counter dashboard] Payload размер:', JSON.stringify(payload).length, 'символов');
      console.log('[imct_counter dashboard] Payload preview (первые 500 символов):', JSON.stringify(payload).substring(0, 500));

      try {
        console.log('[imct_counter dashboard] Отправка запроса на:', APPS_SCRIPT_URL);
        const response = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        console.log('[imct_counter dashboard] Ответ получен (no-cors режим, статус недоступен)');
        chrome.storage.local.set({ lastSentSnapshotTs: snapshot.timestamp });
        console.log('[imct_counter dashboard] lastSentSnapshotTs обновлен:', snapshot.timestamp);
        console.log('[imct_counter dashboard] ========== ОТПРАВКА ЗАВЕРШЕНА ==========');
        resolve({ ok: true, status: response.status });
      } catch (error) {
        console.error('[imct_counter dashboard] Ошибка отправки в Google Sheets:', error);
        resolve({ ok: false, error: error.message });
      }
    });
  });
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'yes' || normalized === 'true' || normalized === '1';
  }
  return Boolean(value);
}

function buildSnapshotsFromRows(rows) {
  const byTimestamp = new Map();
  rows.forEach(row => {
    const ts = row.ts || row.timestamp || '';
    if (!ts) return;
    if (!byTimestamp.has(ts)) {
      byTimestamp.set(ts, { timestamp: new Date(ts).getTime(), groups: {} });
    }
    const snapshot = byTimestamp.get(ts);
    const key = (row.groupUrl || row.groupName || '').trim();
    if (!key) return;
    snapshot.groups[key] = {
      name: row.groupName || key,
      url: row.groupUrl || '',
      participants: Number(row.participants) || 0,
      adminsCount: Number(row.admins) || 0,
      ownersCount: Number(row.owners) || 0,
      hasDigitalVuzAdmin: parseBool(row.hasDigitalVuzAdmin),
      hasKhlstovAdmin: parseBool(row.hasKhlstovAdmin),
      hasDvfuStatsUser: parseBool(row.hasDvfuStatsUser),
      participantsListStr: row.participants_list || '',
      inviteLink: row.invite_link || row.inviteLink || ''
    };
  });
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function loadSnapshotsFromSheets() {
  console.log('[imct_counter dashboard] ========== ЗАГРУЗКА ИЗ GOOGLE SHEETS ==========');
  
  // Пробуем несколько вариантов запроса
  let rows = [];
  let lastError = null;
  
  // Вариант 1: Без параметров (просто URL)
  let url = APPS_SCRIPT_URL;
  console.log('[imct_counter dashboard] Попытка 1: Без параметров, URL:', url);
  
  try {
    const response = await fetch(url, { 
      method: 'GET',
      cache: 'no-cache'
    });
    
    console.log('[imct_counter dashboard] Ответ получен, статус:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ошибка: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[imct_counter dashboard] Данные получены:', {
      ok: data?.ok,
      rowsCount: Array.isArray(data?.rows) ? data.rows.length : 0,
      dataKeys: data ? Object.keys(data) : []
    });
    
    if (!data) {
      throw new Error('Пустой ответ от сервера');
    }
    
    // Если ответ содержит rows, используем их
    if (Array.isArray(data.rows)) {
      if (data.rows.length > 0) {
        rows = data.rows;
        console.log('[imct_counter dashboard] Успешно загружено строк:', rows.length);
      } else if (data.ok === true) {
        // Если ok: true, но rows пустой - это нормально, просто нет данных
        console.log('[imct_counter dashboard] API вернул ok: true, но rows пустой - данных нет');
        // Не пробуем другие варианты, если API вернул успешный ответ
        return 0;
      }
    }
  } catch (error) {
    console.warn('[imct_counter dashboard] Ошибка при попытке 1:', error.message);
    lastError = error;
    
    // Вариант 2: С action=get, но без userId
    url = `${APPS_SCRIPT_URL}?action=get&limit=2000`;
    console.log('[imct_counter dashboard] Попытка 2: С action=get, URL:', url);
    
    try {
      const response2 = await fetch(url, { 
        method: 'GET',
        cache: 'no-cache'
      });
      
      if (response2.ok) {
        const data2 = await response2.json();
        if (Array.isArray(data2.rows) && data2.rows.length > 0) {
          rows = data2.rows;
          console.log('[imct_counter dashboard] Успешно загружено строк (попытка 2):', rows.length);
        }
      }
    } catch (error2) {
      console.warn('[imct_counter dashboard] Ошибка при попытке 2:', error2.message);
      lastError = error2;
      
      // Вариант 3: С userId
      const userId = await getOrCreateUserId();
      url = `${APPS_SCRIPT_URL}?action=get&userId=${encodeURIComponent(userId)}&limit=2000`;
      console.log('[imct_counter dashboard] Попытка 3: С userId, URL:', url);
      
      try {
        const response3 = await fetch(url, { 
          method: 'GET',
          cache: 'no-cache'
        });
        
        if (response3.ok) {
          const data3 = await response3.json();
          if (Array.isArray(data3.rows) && data3.rows.length > 0) {
            rows = data3.rows;
            console.log('[imct_counter dashboard] Успешно загружено строк (попытка 3):', rows.length);
          }
        }
      } catch (error3) {
        console.warn('[imct_counter dashboard] Ошибка при попытке 3:', error3.message);
        lastError = error3;
      }
    }
  }
  
  if (rows.length === 0) {
    const errorMsg = lastError 
      ? `Не удалось загрузить данные: ${lastError.message}` 
      : 'Нет данных для загрузки. Таблица пуста или запрос неверен.';
    throw new Error(errorMsg);
  }
  
  // Проверяем первые несколько строк
  if (rows.length > 0) {
    const sampleRows = rows.slice(0, 3);
    sampleRows.forEach((row, idx) => {
      console.log(`[imct_counter dashboard] Загруженная строка ${idx + 1}:`, {
        ts: row.ts,
        groupName: row.groupName,
        participants: row.participants,
        participants_list: row.participants_list ? `[${row.participants_list.length} символов] ${row.participants_list.substring(0, 100)}...` : 'ПУСТО!',
        delta: row.delta
      });
    });
  }
  
  const loaded = buildSnapshotsFromRows(rows);
  console.log('[imct_counter dashboard] Построено снимков:', loaded.length);
  if (loaded.length > 0) {
    const lastSnapshot = loaded[loaded.length - 1];
    console.log('[imct_counter dashboard] Последний снимок:', {
      timestamp: lastSnapshot.timestamp,
      iso: new Date(lastSnapshot.timestamp).toISOString(),
      groupsCount: Object.keys(lastSnapshot.groups || {}).length
    });
  }
  
  snapshots = loaded;
  chrome.storage.local.set({ snapshots: snapshots }, () => {
    renderSnapshots();
  });
  console.log('[imct_counter dashboard] ========== ЗАГРУЗКА ЗАВЕРШЕНА ==========');
  return loaded.length;
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ru-RU');
  } catch (e) {
    return '—';
  }
}

function extractOwnerName(participantsListStr) {
  if (!participantsListStr) return '';
  const entries = participantsListStr.split(';').map(x => x.trim()).filter(Boolean);
  const ownerEntry = entries.find(entry => entry.includes('(Владелец)'));
  if (!ownerEntry) return '';
  return ownerEntry.replace(/\s*\(Владелец\)\s*/g, '').trim();
}

function renderSnapshots() {
  const lastSnapshot = snapshots[snapshots.length - 1];
  const prevSnapshot = snapshots[snapshots.length - 2];

  if (!lastSnapshot) {
    if (emptyStateEl) emptyStateEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
    if (inviteTableEl) inviteTableEl.style.display = 'none';
    if (chartsEl) chartsEl.style.display = 'none';
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Последний снимок: —';
    if (summaryTotalEl) summaryTotalEl.textContent = '0';
    if (summaryUpEl) summaryUpEl.textContent = '0';
    if (summaryDownEl) summaryDownEl.textContent = '0';
    if (summarySameEl) summarySameEl.textContent = '0';
    if (summaryDigitalVuzEl) summaryDigitalVuzEl.textContent = '0';
    if (summaryKhlstovEl) summaryKhlstovEl.textContent = '0';
    if (summaryDvfuEl) summaryDvfuEl.textContent = '0';
    if (summaryPercentEl) summaryPercentEl.textContent = '0%';
    if (percentBarFillEl) percentBarFillEl.style.width = '0%';
    return;
  }

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = `Последний снимок: ${formatDate(lastSnapshot.timestamp)}`;
  }

  const lastGroups = lastSnapshot.groups || {};
  const prevGroups = (prevSnapshot && prevSnapshot.groups) ? prevSnapshot.groups : {};
  const keys = new Set([...Object.keys(prevGroups), ...Object.keys(lastGroups)]);
  const rows = [];
  const isFirstSnapshot = !prevSnapshot;

  keys.forEach(key => {
    const current = lastGroups[key];
    const previous = prevGroups[key];
    const currentParticipants = current ? current.participants : 0;
    const previousParticipants = previous ? previous.participants : 0;
    
    // Правильный расчет дельты:
    // - Если это первый снимок, дельта = 0
    // - Если группа появилась впервые (есть в current, но нет в prev), дельта = 0
    // - Если группа исчезла (есть в prev, но нет в current), дельта = -previousParticipants
    // - Если группа есть в обоих, дельта = currentParticipants - previousParticipants
    let delta = 0;
    if (isFirstSnapshot) {
      delta = 0; // Первый снимок - нет изменений
    } else if (current && !previous) {
      delta = 0; // Новая группа - считаем что изменений нет
    } else if (!current && previous) {
      delta = -previousParticipants; // Группа исчезла
    } else {
      delta = currentParticipants - previousParticipants; // Обычное изменение
    }
    
    rows.push({
      key: key,
      name: (current && current.name) || (previous && previous.name) || key,
      url: (current && current.url) || (previous && previous.url) || '',
      participantsListStr: (current && current.participantsListStr) || (previous && previous.participantsListStr) || '',
      participants: currentParticipants,
      adminsCount: current ? current.adminsCount : 0,
      ownersCount: current ? current.ownersCount : 0,
      delta: delta,
      hasDigitalVuzAdmin: current ? current.hasDigitalVuzAdmin : false,
      hasKhlstovAdmin: current ? current.hasKhlstovAdmin : false,
      hasDvfuStatsUser: current ? current.hasDvfuStatsUser : false,
      inviteLink: (current && current.inviteLink) || (previous && previous.inviteLink) || ''
    });
  });

  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  const increased = rows.filter(r => r.delta > 0).length;
  const decreased = rows.filter(r => r.delta < 0).length;
  const same = rows.filter(r => r.delta === 0).length;
  const digitalVuzCount = rows.filter(r => r.hasDigitalVuzAdmin).length;
  const khlstovCount = rows.filter(r => r.hasKhlstovAdmin).length;
  const dvfuCount = rows.filter(r => r.hasDvfuStatsUser).length;
  const totalParticipants = rows.reduce((sum, r) => sum + (r.participants || 0), 0);
  const percent = Math.round((totalParticipants / 2723) * 1000) / 10;
  const percentClamped = Math.max(0, Math.min(100, percent));

  if (summaryTotalEl) summaryTotalEl.textContent = String(rows.length);
  if (summaryUpEl) summaryUpEl.textContent = String(increased);
  if (summaryDownEl) summaryDownEl.textContent = String(decreased);
  if (summarySameEl) summarySameEl.textContent = String(same);
  if (summaryDigitalVuzEl) summaryDigitalVuzEl.textContent = String(digitalVuzCount);
  if (summaryKhlstovEl) summaryKhlstovEl.textContent = String(khlstovCount);
  if (summaryDvfuEl) summaryDvfuEl.textContent = String(dvfuCount);
  if (summaryPercentEl) summaryPercentEl.textContent = `${percent}%`;
  if (percentBarFillEl) percentBarFillEl.style.width = `${percentClamped}%`;

  if (tableBodyEl) {
    tableBodyEl.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = row.name;
      tr.appendChild(nameTd);

      const participantsTd = document.createElement('td');
      participantsTd.textContent = String(row.participants);
      if (row.delta > 0) {
        participantsTd.className = 'participants-up';
      } else if (row.delta < 0) {
        participantsTd.className = 'participants-down';
      } else {
        participantsTd.className = 'participants-same';
      }
      tr.appendChild(participantsTd);

      const deltaTd = document.createElement('td');
      const deltaText = row.delta > 0 ? `+${row.delta}` : String(row.delta);
      deltaTd.textContent = deltaText;
      if (row.delta > 0) {
        deltaTd.className = 'delta-up';
      } else if (row.delta < 0) {
        deltaTd.className = 'delta-down';
      } else {
        deltaTd.className = 'delta-same';
      }
      tr.appendChild(deltaTd);

      const adminsTd = document.createElement('td');
      adminsTd.textContent = String(row.adminsCount);
      tr.appendChild(adminsTd);

      const ownersTd = document.createElement('td');
      ownersTd.textContent = String(row.ownersCount);
      tr.appendChild(ownersTd);

      const digitalVuzTd = document.createElement('td');
      digitalVuzTd.textContent = row.hasDigitalVuzAdmin ? 'Да' : 'Нет';
      tr.appendChild(digitalVuzTd);

      const khlstovTd = document.createElement('td');
      khlstovTd.textContent = row.hasKhlstovAdmin ? 'Да' : 'Нет';
      tr.appendChild(khlstovTd);

      const dvfuTd = document.createElement('td');
      dvfuTd.textContent = row.hasDvfuStatsUser ? 'Да' : 'Нет';
      tr.appendChild(dvfuTd);

      tableBodyEl.appendChild(tr);
    });
  }

  if (inviteTableBodyEl) {
    inviteTableBodyEl.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      nameTd.textContent = row.name;
      tr.appendChild(nameTd);

      const urlTd = document.createElement('td');
      if (row.url) {
        const link = document.createElement('a');
        link.href = row.url;
        link.textContent = row.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        urlTd.appendChild(link);
      } else {
        urlTd.textContent = '—';
      }
      tr.appendChild(urlTd);

      const inviteTd = document.createElement('td');
      if (row.inviteLink) {
        const inviteLinkEl = document.createElement('a');
        inviteLinkEl.href = row.inviteLink;
        inviteLinkEl.textContent = row.inviteLink;
        inviteLinkEl.target = '_blank';
        inviteLinkEl.rel = 'noopener noreferrer';
        inviteTd.appendChild(inviteLinkEl);
      } else {
        inviteTd.textContent = '—';
      }
      tr.appendChild(inviteTd);

      const ownerTd = document.createElement('td');
      ownerTd.textContent = extractOwnerName(row.participantsListStr) || '—';
      tr.appendChild(ownerTd);

      inviteTableBodyEl.appendChild(tr);
    });
  }

  if (emptyStateEl) emptyStateEl.style.display = 'none';
  if (tableEl) tableEl.style.display = 'table';
  if (inviteTableEl) inviteTableEl.style.display = 'table';
  if (chartsEl) chartsEl.style.display = 'grid';
  renderCharts();
}

function renderCharts() {
  if (!chartTotalEl || !chartChangesEl || !chartTopChangesEl || snapshots.length === 0) return;

  const totalSeries = snapshots.map(snap => {
    const groups = snap.groups || {};
    return Object.values(groups).reduce((sum, g) => sum + (g.participants || 0), 0);
  });

  const changeSeries = snapshots.map((snap, idx) => {
    if (idx === 0) {
      return { up: 0, down: 0, same: 0 };
    }
    const current = snap.groups || {};
    const prev = snapshots[idx - 1].groups || {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(current)]);
    let up = 0;
    let down = 0;
    let same = 0;
    keys.forEach(key => {
      const currCount = current[key] ? current[key].participants : 0;
      const prevCount = prev[key] ? prev[key].participants : 0;
      const delta = currCount - prevCount;
      if (delta > 0) up++;
      else if (delta < 0) down++;
      else same++;
    });
    return { up, down, same };
  });

  drawLineChart(chartTotalEl, [
    { name: 'Участники', color: '#1976d2', data: totalSeries }
  ]);

  drawLineChart(chartChangesEl, [
    { name: 'Рост', color: '#2e7d32', data: changeSeries.map(s => s.up) },
    { name: 'Падение', color: '#c62828', data: changeSeries.map(s => s.down) },
    { name: 'Без изменений', color: '#616161', data: changeSeries.map(s => s.same) }
  ]);

  const lastSnapshot = snapshots[snapshots.length - 1];
  const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const allRows = buildRowsForSnapshot(lastSnapshot, prevSnapshot);
  const changedRows = allRows
    .filter(r => r.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const zeroRows = allRows
    .filter(r => r.delta === 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const topChanges = changedRows.slice(0, 10);
  while (topChanges.length < 10 && zeroRows.length > 0) {
    topChanges.push(zeroRows.shift());
  }
  drawBarChart(chartTopChangesEl, topChanges);
}

function drawLineChart(canvas, seriesList) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 30;

  ctx.clearRect(0, 0, width, height);

  const allValues = seriesList.flatMap(s => s.data);
  const maxValue = Math.max(1, ...allValues);
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;

  const maxPoints = Math.max(...seriesList.map(s => s.data.length), 1);

  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.fillText('Снимки', width / 2 - 20, height - 8);
  ctx.save();
  ctx.translate(12, height / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Значение', 0, 0);
  ctx.restore();

  // Легенда
  const legendX = padding + 4;
  let legendY = padding - 10;
  ctx.font = '12px sans-serif';
  seriesList.forEach(series => {
    legendY += 14;
    ctx.fillStyle = series.color;
    ctx.fillRect(legendX, legendY - 9, 10, 10);
    ctx.fillStyle = '#333';
    ctx.fillText(series.name, legendX + 14, legendY);
  });

  seriesList.forEach(series => {
    const data = series.data;
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = padding + (index / Math.max(1, maxPoints - 1)) * (width - padding * 2);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * (height - padding * 2);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = series.color;
    data.forEach((value, index) => {
      const x = padding + (index / Math.max(1, maxPoints - 1)) * (width - padding * 2);
      const normalized = (value - minValue) / range;
      const y = height - padding - normalized * (height - padding * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawBarChart(canvas, rows) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  ctx.clearRect(0, 0, width, height);

  if (!rows.length) {
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.fillText('Нет изменений', padding, height / 2);
    return;
  }

  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.delta)));
  const barAreaWidth = width - padding * 2;
  const barHeight = Math.max(18, Math.floor((height - padding * 2) / rows.length) - 6);
  const centerX = padding + barAreaWidth / 2;

  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX, padding);
  ctx.lineTo(centerX, height - padding);
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.fillText('Группы', padding, height - 8);
  ctx.save();
  ctx.translate(12, height / 2 + 20);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Δ участников', 0, 0);
  ctx.restore();

  rows.forEach((row, idx) => {
    const y = padding + idx * (barHeight + 6);
    const barWidth = (Math.abs(row.delta) / maxAbs) * (barAreaWidth / 2);
    const isUp = row.delta > 0;
    const x = isUp ? centerX : centerX - barWidth;

    ctx.fillStyle = isUp ? '#a5d6a7' : '#ef9a9a';
    ctx.fillRect(x, y, barWidth, barHeight);

    if (row.delta !== 0) {
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      const label = `${row.name} (${row.delta > 0 ? '+' : ''}${row.delta})`;
      const textX = isUp ? centerX + 6 : padding;
      ctx.fillText(label, textX, y + barHeight - 4);
    }
  });
}

function persistSnapshots(updatedSnapshots) {
  chrome.storage.local.set({ snapshots: updatedSnapshots }, () => {
    snapshots = updatedSnapshots;
    renderSnapshots();
  });
}

function loadSnapshots() {
  chrome.storage.local.get(['snapshots', 'collectedData', 'lastCollectedAt'], result => {
    snapshots = result.snapshots || [];
    const lastCollectedAt = result.lastCollectedAt || 0;
    const lastSnapshot = snapshots[snapshots.length - 1];

    if (lastCollectedAt && result.collectedData && result.collectedData.length > 0) {
      const lastSnapshotTs = lastSnapshot ? lastSnapshot.timestamp : 0;
      if (lastSnapshotTs < lastCollectedAt) {
        const snapshot = buildSnapshot(result.collectedData, lastCollectedAt);
        const prevSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
        const updated = snapshots.concat(snapshot);
        persistSnapshots(updated);
        sendSnapshotToSheets(snapshot, prevSnapshot);
        return;
      }
    }

    renderSnapshots();
  });
}

function saveSnapshotFromData(data) {
  // Получаем timestamp из lastCollectedAt, если есть, иначе используем текущее время
  chrome.storage.local.get(['snapshots', 'lastCollectedAt'], result => {
    // Используем lastCollectedAt, но если он уже использован, добавляем небольшую задержку
    let timestamp = result.lastCollectedAt || Date.now();
    const stored = result.snapshots || [];
    
    // Проверяем, не совпадает ли timestamp с последним снимком
    if (stored.length > 0) {
      const lastSnapshot = stored[stored.length - 1];
      if (lastSnapshot.timestamp >= timestamp) {
        // Если timestamp совпадает или меньше, добавляем 1 мс для уникальности
        timestamp = lastSnapshot.timestamp + 1;
      }
    }
    
    console.log('[imct_counter dashboard] saveSnapshotFromData: timestamp =', timestamp, 'ISO:', new Date(timestamp).toISOString());
    console.log('[imct_counter dashboard] saveSnapshotFromData: количество групп =', data ? data.length : 0);
    
    const snapshot = buildSnapshot(data, timestamp);
    const prevSnapshot = stored.length > 0 ? stored[stored.length - 1] : null;
    stored.push(snapshot);
    persistSnapshots(stored);
    sendSnapshotToSheets(snapshot, prevSnapshot);
  });
}

async function sendMessageToContentScript(tabId, message, retries = 5) {
  return new Promise((resolve, reject) => {
    const trySend = (attempt) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          const isConnectionError = errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Could not establish connection');

          if (isConnectionError) {
            if (attempt < retries) {
              if (attempt === 1) {
                setTimeout(() => trySend(attempt + 1), 1000);
              } else if (attempt === 2) {
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content.js']
                }).then(() => {
                  setTimeout(() => trySend(attempt + 1), 1500);
                }).catch(() => {
                  setTimeout(() => trySend(attempt + 1), 1000);
                });
              } else {
                setTimeout(() => trySend(attempt + 1), 1500);
              }
            } else {
              reject(new Error('Не удалось подключиться к странице web.max.ru. Перезагрузите вкладку (F5).'));
            }
          } else {
            reject(new Error('Ошибка при отправке сообщения: ' + errorMsg));
          }
        } else {
          resolve(response);
        }
      });
    };

    trySend(1);
  });
}

async function startCollection() {
  if (isRunning) return;

  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
      const webTabs = await chrome.tabs.query({ url: 'https://web.max.ru/*' });
      tab = webTabs && webTabs.length > 0 ? webTabs[0] : null;
    }

    if (!tab || !tab.url || !tab.url.includes('web.max.ru')) {
      updateStatus('Ошибка: откройте страницу web.max.ru', 'error');
      return;
    }

    if (tab.status !== 'complete') {
      updateStatus('Ожидание загрузки страницы...', '');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isRunning = true;
    updateUIRunning();
    chrome.storage.local.set({ isRunning: true, collectedData: [], processedUrls: [] });

    updateStatus('Подключение к странице...', 'running');

    const response = await sendMessageToContentScript(tab.id, { action: 'start' });
    if (response && response.error) {
      updateStatus('Ошибка: ' + response.error, 'error');
      isRunning = false;
      updateUIRunning();
    }
  } catch (error) {
    updateStatus('Ошибка: ' + error.message, 'error');
    isRunning = false;
    updateUIRunning();
  }
}

function setupEventListeners() {
  if (collectBtn) {
    collectBtn.addEventListener('click', startCollection);
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      if (!snapshots.length) {
        updateStatus('Нет снимков для отправки', 'error');
        return;
      }
      const lastSnapshot = snapshots[snapshots.length - 1];
      const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
      updateStatus('Отправка в Google Sheets...', 'running');
      const result = await sendSnapshotToSheets(lastSnapshot, prevSnapshot, true);
      if (result && result.ok) {
        updateStatus('Отправлено в Google Sheets', 'completed');
      } else if (result && result.skipped) {
        updateStatus('Снимок уже отправлялся', 'completed');
      } else {
        updateStatus('Ошибка отправки в Google Sheets', 'error');
      }
    });
  }
  if (loadBtn) {
    loadBtn.addEventListener('click', async () => {
      updateStatus('Загрузка из Google Sheets...', 'running');
      try {
        const count = await loadSnapshotsFromSheets();
        updateStatus(`Загружено снимков: ${count}`, 'completed');
      } catch (error) {
        updateStatus(error.message || 'Ошибка загрузки из Google Sheets', 'error');
      }
    });
  }
  if (recalcBtn) {
    recalcBtn.addEventListener('click', async () => {
      if (!snapshots.length) {
        updateStatus('Нет снимков для пересчета', 'error');
        return;
      }
      updateStatus('Пересчет дельт...', 'running');
      try {
        // Дельты уже пересчитываются правильно в renderSnapshots
        // Просто перерисовываем дашборд
        renderSnapshots();
        updateStatus('Дельты пересчитаны', 'completed');
      } catch (error) {
        updateStatus('Ошибка пересчета: ' + error.message, 'error');
      }
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'progress' || message.action === 'updateProgress') {
      updateProgress(message.current, message.total);
    } else if (message.action === 'completed') {
      isRunning = false;
      updateProgress(0, 0);
      updateStatus('Готово', 'completed');
      updateUIRunning();
      saveSnapshotFromData(message.data || []);
    } else if (message.action === 'error') {
      isRunning = false;
      updateStatus('Ошибка: ' + message.error, 'error');
      updateUIRunning();
    }
  });
}

function init() {
  getUIElements();
  setupEventListeners();
  loadSnapshots();
  updateUIRunning();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
