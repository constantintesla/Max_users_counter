// Content Script для расширения imct_counter

let isRunning = false;
let collectedData = [];
let allChats = [];
let currentIndex = 0;
let processedUrls = new Set(); // Множество уже обработанных URL

// Функция ожидания
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция ожидания появления элемента (оптимизированная)
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    // Сначала быстрая проверка
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    // Используем более частую проверку через requestAnimationFrame для скорости
    let checkCount = 0;
    const checkInterval = 50; // Проверяем каждые 50ms
    const maxChecks = Math.floor(timeout / checkInterval);
    let observer = null;
    
    function checkElement() {
      const element = document.querySelector(selector);
      if (element) {
        if (observer) observer.disconnect();
        resolve(element);
        return;
      }
      
      checkCount++;
      if (checkCount < maxChecks) {
        setTimeout(checkElement, checkInterval);
      } else {
        // Если не нашли быстро, используем MutationObserver как fallback
        observer = new MutationObserver((mutations, obs) => {
          const element = document.querySelector(selector);
          if (element) {
            obs.disconnect();
            resolve(element);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true
        });

        setTimeout(() => {
          if (observer) observer.disconnect();
          reject(new Error(`Элемент ${selector} не найден за ${timeout}ms`));
        }, timeout - (checkCount * checkInterval));
      }
    }
    
    setTimeout(checkElement, checkInterval);
  });
}

// Функция скролла для загрузки всех чатов
async function scrollToLoadAllChats(container) {
  let previousChatCount = 0;
  let currentChatCount = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 100;
  let noChangeCount = 0;
  let lastScrollHeight = 0;

  do {
    previousChatCount = currentChatCount;
    lastScrollHeight = container.scrollHeight;
    
    // Скроллим вниз - используем разные методы для надежности
    const scrollPosition = container.scrollHeight - container.clientHeight;
    container.scrollTop = scrollPosition;
    
    // Также пробуем программный скролл
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'auto'
    });
    
    await wait(500);
    
    // Считаем чаты - используем те же селекторы, что и в findAllChats
    const chats = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb, .svelte-q2jdqb');
    currentChatCount = chats.length;
    
    scrollAttempts++;
    
    // Если количество не изменилось, увеличиваем счетчик
    if (currentChatCount === previousChatCount) {
      noChangeCount++;
      
      // Если 5 раз подряд не изменилось, проверяем, можем ли еще прокрутить
      if (noChangeCount >= 5) {
        // Проверяем, достигли ли мы конца скролла
        const currentScrollTop = container.scrollTop;
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        const isAtBottom = Math.abs(currentScrollTop - maxScrollTop) < 10;
        
        if (isAtBottom) {
          break;
        } else {
          // Пробуем еще раз с небольшим скроллом
          container.scrollTop += 100;
          await wait(500);
          const newChats = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb, .svelte-q2jdqb');
          if (newChats.length === currentChatCount) {
            break;
          }
          currentChatCount = newChats.length;
          noChangeCount = 0;
        }
      } else {
        await wait(300);
        container.scrollTop = container.scrollHeight;
        await wait(500);
      }
    } else {
      noChangeCount = 0; // Сбрасываем счетчик при изменении
    }
    
    // Дополнительная проверка: если scrollHeight не изменился, возможно достигли конца
    if (container.scrollHeight === lastScrollHeight && currentChatCount === previousChatCount) {
      noChangeCount++;
      if (noChangeCount >= 3) {
        break;
      }
    }
    
  } while (scrollAttempts < maxScrollAttempts);
  
  return currentChatCount;
}

// Функция поиска всех чатов
function findAllChats() {
  // Ищем контейнер со списком чатов - пробуем разные варианты
  // Сначала ищем по правильному классу скролла
  let container = document.querySelector('.scrollable.scrollListScrollable, .scrollListScrollable, [class*="scrollListScrollable"]');
  
  // Если не нашли, пробуем старый селектор
  if (!container) {
    container = document.querySelector('.svelte-1u8ha7t');
  }
  
  // Если не нашли по классу, ищем по структуре
  if (!container) {
    // Ищем контейнер со скроллом, который содержит чаты
    const scrollContainers = document.querySelectorAll('[class*="scrollable"], [class*="scroll"], [class*="content"], [class*="list"]');
    for (const scrollContainer of scrollContainers) {
      const hasChats = scrollContainer.querySelectorAll('.svelte-q2jdqb, [role="presentation"].wrapper').length > 0;
      if (hasChats) {
        container = scrollContainer;
        break;
      }
    }
  }
  
  if (!container) {
    throw new Error('Контейнер со списком чатов не найден. Убедитесь, что вы находитесь на странице со списком чатов.');
  }
  
  // Находим все элементы чатов - ищем по структуре wrapper
  // Структура: div[role="presentation"].wrapper.wrapper--withActions.svelte-q2jdqb
  let chatElements = container.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb');
  
  // Если не нашли по структуре wrapper, ищем по классу cell
  if (chatElements.length === 0) {
    chatElements = container.querySelectorAll('.cell.svelte-q2jdqb, button.cell.svelte-q2jdqb');
  }
  
  // Если все еще не нашли, пробуем найти по классу svelte-q2jdqb
  if (chatElements.length === 0) {
    chatElements = container.querySelectorAll('.svelte-q2jdqb');
  }
  
  // Фильтруем только те элементы, которые действительно являются чатами
  chatElements = Array.from(chatElements).filter(el => {
    // Проверяем, что элемент содержит название чата (h3.title или span.name)
    const hasTitle = el.querySelector('h3.title, .title, span.name, .name') !== null;
    const inDOM = el.isConnected; // Элемент в DOM
    
    // Принимаем элемент, если он в DOM и имеет название, даже если сейчас не видим
    return hasTitle && inDOM;
  });
  
  const chats = [];
  const seenUrls = new Set(); // Для дедупликации при формировании списка
  
  chatElements.forEach((element, index) => {
    // Ищем кликабельный элемент чата (button.cell или сам wrapper)
    const clickableElement = element.querySelector('button.cell') || 
                            element.querySelector('button') || 
                            element;
    
    // Ищем ссылку на чат - групповые чаты имеют формат /-число
    // Пробуем разные способы извлечения URL без открытия чата
    let url = '';
    
    // 1. Пробуем найти URL в data-атрибутах (разные варианты)
    const dataHref = clickableElement.getAttribute('data-href') || 
                     element.getAttribute('data-href') ||
                     clickableElement.getAttribute('data-url') ||
                     element.getAttribute('data-url') ||
                     clickableElement.getAttribute('href') ||
                     element.getAttribute('href') ||
                     clickableElement.getAttribute('data-link') ||
                     element.getAttribute('data-link');
    
    if (dataHref) {
      url = dataHref.startsWith('http') ? dataHref : new URL(dataHref, window.location.origin).href;
    }
    
    // 2. Если не нашли, ищем в родительских элементах (включая все уровни)
    if (!url) {
      let parent = element;
      for (let i = 0; i < 5 && parent; i++) {
        const parentHref = parent.getAttribute('href') || 
                          parent.getAttribute('data-href') ||
                          parent.getAttribute('data-url');
        if (parentHref) {
          url = parentHref.startsWith('http') ? parentHref : new URL(parentHref, window.location.origin).href;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    // 3. Ищем тег <a> в элементе или родителях
    if (!url) {
      const linkElement = element.closest('a') || element.querySelector('a');
      if (linkElement) {
        url = linkElement.href || linkElement.getAttribute('href');
        if (url && !url.startsWith('http')) {
          url = new URL(url, window.location.origin).href;
        }
      }
    }
    
    // 4. Пробуем извлечь из обработчика onclick (если есть)
    if (!url && clickableElement.onclick) {
      try {
        const onclickStr = clickableElement.onclick.toString();
        // Ищем паттерны типа /-123456789 или web.max.ru/-123456789
        const urlMatch = onclickStr.match(/\/-\d+/);
        if (urlMatch) {
          url = new URL(urlMatch[0], window.location.origin).href;
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    
    // 5. Пробуем найти в data-атрибутах всех дочерних элементов
    if (!url) {
      const allDataAttrs = element.querySelectorAll('[data-href], [data-url], [href]');
      for (const attrEl of allDataAttrs) {
        const attrValue = attrEl.getAttribute('data-href') || 
                         attrEl.getAttribute('data-url') ||
                         attrEl.getAttribute('href');
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // 6. Пробуем извлечь из ID элемента (иногда ID содержит номер чата)
    if (!url) {
      const elementId = element.id || clickableElement.id;
      if (elementId && elementId.match(/-\d+/)) {
        const idMatch = elementId.match(/-\d+/);
        if (idMatch) {
          url = new URL(idMatch[0], window.location.origin).href;
        }
      }
    }
    
    // 7. Пробуем найти во всех атрибутах элемента (может быть в любом data-атрибуте)
    if (!url) {
      const allAttributes = clickableElement.attributes;
      for (let i = 0; i < allAttributes.length; i++) {
        const attr = allAttributes[i];
        const attrValue = attr.value;
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // 8. Пробуем найти в атрибутах самого элемента (не только clickableElement)
    if (!url) {
      const elementAttributes = element.attributes;
      for (let i = 0; i < elementAttributes.length; i++) {
        const attr = elementAttributes[i];
        const attrValue = attr.value;
        if (attrValue && attrValue.match(/\/-\d+/)) {
          url = attrValue.startsWith('http') ? attrValue : new URL(attrValue, window.location.origin).href;
          break;
        }
      }
    }
    
    // Проверяем, что это групповой чат (начинается с минуса в пути)
    // Формат: https://web.max.ru/-71128136750354
    // Собираем только групповые чаты
    if (url && !url.match(/\/-\d+($|\/)/)) {
      // Это не групповой чат, пропускаем
      return;
    }
    
    // Нормализуем URL для проверки дубликатов
    let normalizedUrl = '';
    if (url) {
      try {
        const urlObj = new URL(url);
        normalizedUrl = urlObj.origin + urlObj.pathname;
      } catch (e) {
        normalizedUrl = url.split('?')[0].split('#')[0];
      }
    }
    
    // Пропускаем, если этот URL уже был добавлен
    if (url && seenUrls.has(normalizedUrl)) {
      return;
    }
    
    // Добавляем URL в множество виденных
    if (url) {
      seenUrls.add(normalizedUrl);
    }
    
    // Ищем название чата - структура: h3.title > span.name > span.text
    let nameElement = element.querySelector('h3.title span.name span.text') ||
                     element.querySelector('h3.title span.name') ||
                     element.querySelector('h3.title') ||
                     element.querySelector('.title .name .text') ||
                     element.querySelector('.title .name') ||
                     element.querySelector('.title') ||
                     element.querySelector('[class*="name"]');
    
    if (!nameElement) {
      // Ищем первый значимый текстовый элемент
      const textElements = Array.from(element.querySelectorAll('span.text, span.name, h3')).filter(el => {
        const text = el.textContent.trim();
        return text.length > 0 && text.length < 100; // Название обычно не очень длинное
      });
      nameElement = textElements[0] || element;
    }
    
    const name = nameElement ? nameElement.textContent.trim() : `Чат ${index + 1}`;
    
    // Пропускаем пустые элементы
    if (!name || name.length === 0) {
      return;
    }
    
    // Если URL не найден, но это может быть групповой чат, оставляем его
    // URL будет определен после открытия чата
    // Проверяем, что элемент содержит признаки группового чата
    const hasGroupChatIndicators = clickableElement.querySelector('button.cell') !== null ||
                                   element.querySelector('[role="presentation"].wrapper') !== null;
    
    // Если нет URL, но есть признаки чата, добавляем его (URL определится при открытии)
    if (!url && hasGroupChatIndicators) {
      // Оставляем url пустым, он будет определен после открытия
    }
    
    chats.push({
      element: clickableElement, // Сохраняем кликабельный элемент (button.cell)
      name: name,
      url: url, // Может быть пустым, определится после открытия
      index: index,
      isGroup: url ? url.match(/\/-\d+($|\/)/) !== null : hasGroupChatIndicators
    });
  });
  
  return { container, chats };
}

// Функция извлечения данных из чата
async function extractChatData() {
  // Ждем загрузки информации о чате (уменьшено с 2000 до 800)
  await wait(800);
  
  // Проверяем, что мы на странице группового чата (URL начинается с /-число)
  // Формат: https://web.max.ru/-71128136750354
  const isGroupChat = window.location.href.match(/\/-\d+($|\/)/);
  if (!isGroupChat) {
    // Если это не групповой чат, возвращаем пустые данные
    return {
      name: '',
      url: window.location.href,
      participants: 0
    };
  }
  
  // Ищем элемент с информацией об участниках
  // Пробуем разные варианты поиска
  let subtitleElement = document.querySelector('.svelte-1hrr6vf');
  
  // Если не нашли по классу, ищем по тексту, содержащему "из" и "в сети"
  if (!subtitleElement) {
    const allElements = document.querySelectorAll('span, div, p, [class*="subtitle"]');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text.match(/(\d+)\s*(?:из|\/)\s*(\d+)/i) || (text.match(/участник/i) && text.match(/\d+/))) {
        subtitleElement = el;
        break;
      }
    }
  }
  
  let participants = 0;
  if (subtitleElement) {
    const text = subtitleElement.textContent.trim();
    // Парсим количество участников
    // Формат может быть: "3 из 18 в сети" -> извлекаем 18
    const match = text.match(/(\d+)\s*(?:из|\/)\s*(\d+)/i);
    if (match) {
      participants = parseInt(match[2], 10); // Берем второе число (общее количество)
    } else {
      // Пробуем найти просто число
      const numberMatch = text.match(/\d+/);
      if (numberMatch) {
        participants = parseInt(numberMatch[0], 10);
      }
    }
  }
  
  // Получаем название чата - ищем элемент с классом name svelte-1riu5uh рядом с subtitle
  // Структура: content content--left svelte-1hrr6vf content--subtitle содержит subtitle и name
  let name = '';
  
  // Сначала ищем контейнер content--subtitle
  const contentSubtitle = document.querySelector('.content.content--left.svelte-1hrr6vf.content--subtitle, .content--subtitle, [class*="content--subtitle"]');
  
  if (contentSubtitle) {
    // Ищем элемент с классом name svelte-1riu5uh внутри контейнера
    const nameElement = contentSubtitle.querySelector('.name.svelte-1riu5uh, [class*="name"][class*="svelte-1riu5uh"], .name');
    if (nameElement) {
      name = nameElement.textContent.trim();
    }
  }
  
  // Если не нашли, пробуем найти по другому - ищем элемент name рядом с subtitle
  if (!name) {
    const subtitleEl = document.querySelector('.subtitle.svelte-1hrr6vf, [class*="subtitle"][class*="svelte-1hrr6vf"]');
    if (subtitleEl) {
      // Ищем name в том же родительском элементе
      const parent = subtitleEl.parentElement;
      if (parent) {
        const nameEl = parent.querySelector('.name.svelte-1riu5uh, [class*="name"][class*="svelte-1riu5uh"], .name');
        if (nameEl) {
          name = nameEl.textContent.trim();
        }
      }
    }
  }
  
  // Если все еще не нашли, пробуем старые варианты
  if (!name) {
    let titleElement = document.querySelector('h1');
    if (!titleElement) {
      titleElement = document.querySelector('[class*="title"], [class*="name"]');
    }
    if (!titleElement) {
      titleElement = document.querySelector('header h1, header h2, [role="heading"]');
    }
    name = titleElement ? titleElement.textContent.trim() : '';
  }
  
  // Получаем URL текущей страницы (должен быть в формате /-число)
  const url = window.location.href;
  
  // Собираем информацию об участниках
  let participantsList = [];
  let adminsCount = 0;
  let ownersCount = 0;
  let hasDigitalVuzBot = false;
  
  try {
    // Увеличиваем время ожидания загрузки страницы чата
    await wait(1500);
    
    // Проверяем, не находимся ли мы уже на странице со списком участников
    // Ищем контейнер content svelte-13fay8c или другие признаки страницы участников
    const existingParticipantsContainer = document.querySelector('.content.svelte-13fay8c, [class*="content"][class*="svelte-13fay8c"]');
    const hasParticipantsPage = existingParticipantsContainer && 
                               (existingParticipantsContainer.querySelectorAll('img[class*="avatar"], [class*="avatar"] img').length > 0 ||
                                existingParticipantsContainer.textContent.includes('участник') ||
                                existingParticipantsContainer.textContent.match(/\d+\s*(?:из|\/)\s*\d+/));
    
    console.error(`[imct_counter] Проверка страницы участников: hasParticipantsPage=${hasParticipantsPage}, container=${!!existingParticipantsContainer}`);
    
    let buttonElement = null;
    
    if (hasParticipantsPage) {
      console.error('[imct_counter] Уже находимся на странице со списком участников, пропускаем поиск кнопки и клик');
      // buttonElement остается null, весь блок с кликом не выполнится
    } else {
      // Ищем кнопку для открытия информации о чате - пробуем разные способы
      console.error('[imct_counter] Начинаем поиск кнопки для открытия информации о чате');
    
      // Способ 1: Ищем по aria-label с текстом "Открыть профиль" (самый надежный)
      // Ищем в header сначала, потом по всей странице
      const headerElement = document.querySelector('header');
      if (headerElement) {
        const buttonsInHeader = headerElement.querySelectorAll('button[aria-label*="Открыть профиль"], button[aria-label*="открыть профиль"], button[aria-label*="Open profile"]');
        if (buttonsInHeader.length > 0) {
          buttonElement = buttonsInHeader[0];
          console.error('[imct_counter] Найдена кнопка по aria-label "Открыть профиль" в header');
        }
      }
      
      if (!buttonElement) {
        const buttonsWithAriaLabel = document.querySelectorAll('button[aria-label*="Открыть профиль"], button[aria-label*="открыть профиль"], button[aria-label*="Open profile"]');
        if (buttonsWithAriaLabel.length > 0) {
          buttonElement = buttonsWithAriaLabel[0];
          console.error('[imct_counter] Найдена кнопка по aria-label "Открыть профиль"');
        }
      }
      
      // Способ 2: Ищем button с классом main и content--clickable в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main.content--clickable в header');
        }
      }
      
      // Способ 3: Ищем button с классом main и content--clickable по всей странице
      if (!buttonElement) {
        buttonElement = document.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main.content--clickable');
        }
      }
      
      // Способ 4: Ищем button с классом content--clickable в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.content--clickable, button[class*="content--clickable"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу content--clickable в header');
        }
      }
      
      // Способ 5: Ищем header с классом svelte-1rr87da и кнопку внутри
      if (!buttonElement) {
        let headerWithClass = document.querySelector('header.svelte-1rr87da');
        
        // Если не нашли по точному классу, ищем по частичному совпадению
        if (!headerWithClass) {
          const allHeaders = document.querySelectorAll('header');
          for (const header of allHeaders) {
            if (header.className.includes('svelte-1rr87da') || header.getAttribute('class')?.includes('svelte-1rr87da')) {
              headerWithClass = header;
              break;
            }
          }
        }
        
        if (headerWithClass) {
          // Ищем кнопку внутри header - сначала с классами main и content--clickable
          buttonElement = headerWithClass.querySelector('button.main.content--clickable, button[class*="main"][class*="content--clickable"]');
          if (buttonElement) {
            console.error('[imct_counter] Найдена кнопка main.content--clickable в header.svelte-1rr87da');
          } else {
            // Если не нашли, ищем любую кнопку
            buttonElement = headerWithClass.querySelector('button');
            if (buttonElement) {
              console.error('[imct_counter] Найдена кнопка button в header.svelte-1rr87da');
            }
          }
        }
      }
      
      // Способ 6: Ищем button с классом main в header
      if (!buttonElement && headerElement) {
        buttonElement = headerElement.querySelector('button.main, button[class*="main"]');
        if (buttonElement) {
          console.error('[imct_counter] Найдена кнопка по классу main в header');
        }
      }
      
      // Способ 7: Ищем все button на странице и выбираем тот, который находится в верхней части
      if (!buttonElement) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          // Проверяем, что кнопка видима и находится в верхней части страницы
          const rect = btn.getBoundingClientRect();
          if (btn.offsetWidth > 0 && btn.offsetHeight > 0 && !btn.disabled && 
              rect.top >= 0 && rect.top < window.innerHeight / 2) {
            // Проверяем, что это не кнопка отправки сообщения или другие служебные кнопки
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const className = btn.className || '';
            if (ariaLabel.includes('профиль') || ariaLabel.includes('profile') || 
                className.includes('content--clickable') || className.includes('main')) {
              buttonElement = btn;
              console.error('[imct_counter] Найдена кнопка из списка всех кнопок в верхней части');
              break;
            }
          }
        }
      }
      
      // Способ 8: Ищем кликабельный элемент с классом content--clickable в header
      if (!buttonElement && headerElement) {
        const clickableElements = headerElement.querySelectorAll('[class*="content--clickable"]');
        for (const el of clickableElements) {
          if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            const rect = el.getBoundingClientRect();
            // Проверяем, что элемент в верхней части страницы
            if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
              buttonElement = el;
              console.error('[imct_counter] Найден кликабельный элемент с классом content--clickable в header');
              break;
            }
          }
        }
      }
    }
    
    // Если нашли кнопку, кликаем по ней (только если мы еще не на странице участников)
    if (hasParticipantsPage) {
      // Уже на странице участников, пропускаем весь блок с кликом
      console.error('[imct_counter] Уже на странице участников, пропускаем клик');
    } else if (buttonElement) {
      console.error(`[imct_counter] Кнопка найдена: tagName=${buttonElement.tagName}, className=${buttonElement.className}, aria-label=${buttonElement.getAttribute('aria-label')}`);
      
      // Прокручиваем к кнопке, чтобы она была видна
      buttonElement.scrollIntoView({ behavior: 'auto', block: 'center' });
      await wait(500);
      
      // Прокручиваем к кнопке еще раз для надежности
      buttonElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(1000);
      
      // Проверяем, что кнопка видима и в DOM
      const rect = buttonElement.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && 
                       rect.top >= 0 && rect.left >= 0 &&
                       rect.bottom <= window.innerHeight && 
                       rect.right <= window.innerWidth;
      const isConnected = buttonElement.isConnected;
      
      console.error(`[imct_counter] Кнопка видима: ${isVisible}, в DOM: ${isConnected}, позиция: top=${rect.top}, left=${rect.left}`);
      
      if (!isVisible || !isConnected) {
        console.error('[imct_counter] Кнопка не видима или не в DOM, пробуем прокрутить еще раз');
        buttonElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(1500);
        
        // Проверяем еще раз
        const rect2 = buttonElement.getBoundingClientRect();
        const isVisible2 = rect2.width > 0 && rect2.height > 0 && 
                          rect2.top >= 0 && rect2.left >= 0 &&
                          rect2.bottom <= window.innerHeight && 
                          rect2.right <= window.innerWidth;
        if (!isVisible2 || !buttonElement.isConnected) {
          console.error('[imct_counter] ВНИМАНИЕ: Кнопка все еще не видима или не в DOM');
        }
      }
      
      // Пробуем кликнуть разными способами
      let clickSuccess = false;
        
        // Способ 1: Focus + обычный клик
        try {
          console.error('[imct_counter] Пробуем focus + обычный клик');
          if (buttonElement.focus) {
            buttonElement.focus();
            await wait(100);
          }
          buttonElement.click();
          clickSuccess = true;
          console.error('[imct_counter] Focus + обычный клик выполнен');
        } catch (e) {
          console.error('[imct_counter] Ошибка при focus + обычном клике:', e);
        }
        
        // Способ 2: Программный MouseEvent с полными параметрами
        if (!clickSuccess) {
          try {
            console.error('[imct_counter] Пробуем MouseEvent клик с полными параметрами');
            const rect = buttonElement.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            const mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y
            });
            
            buttonElement.dispatchEvent(mouseDownEvent);
            await wait(50);
            buttonElement.dispatchEvent(mouseUpEvent);
            await wait(50);
            buttonElement.dispatchEvent(clickEvent);
            clickSuccess = true;
            console.error('[imct_counter] MouseEvent клик с полными параметрами выполнен');
          } catch (e) {
            console.error('[imct_counter] Ошибка при MouseEvent клике:', e);
          }
        }
        
        // Способ 3: mousedown + mouseup + click с координатами
        if (!clickSuccess) {
          try {
            console.error('[imct_counter] Пробуем mousedown + mouseup + click с координатами');
            const rect = buttonElement.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            const mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y
            });
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y
            });
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1,
              clientX: x,
              clientY: y
            });
            
            buttonElement.dispatchEvent(mouseDownEvent);
            await wait(100);
            buttonElement.dispatchEvent(mouseUpEvent);
            await wait(100);
            buttonElement.dispatchEvent(clickEvent);
            clickSuccess = true;
            console.error('[imct_counter] mousedown + mouseup + click с координатами выполнены');
          } catch (e) {
            console.error('[imct_counter] Ошибка при mousedown/mouseup/click:', e);
          }
        }
        
        // Способ 4: Пробуем кликнуть по координатам через document.elementFromPoint
        if (!clickSuccess) {
          try {
            console.error('[imct_counter] Пробуем клик по координатам через elementFromPoint');
            const rect = buttonElement.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            const elementAtPoint = document.elementFromPoint(x, y);
            if (elementAtPoint) {
              elementAtPoint.click();
              clickSuccess = true;
              console.error('[imct_counter] Клик по координатам через elementFromPoint выполнен');
            }
          } catch (e) {
            console.error('[imct_counter] Ошибка при клике по координатам через elementFromPoint:', e);
          }
        }
        
        if (!clickSuccess) {
          console.error('[imct_counter] Не удалось выполнить клик ни одним способом');
        }
        
        // Ждем и проверяем, что список участников открылся (только если мы не уже на странице участников)
        if (!hasParticipantsPage) {
          // Увеличиваем время ожидания и количество проверок
          await wait(3000);
          
          // Проверяем, открылся ли список участников
          let participantsOpened = false;
          for (let checkAttempt = 0; checkAttempt < 10; checkAttempt++) {
            // Проверяем наличие модального окна или диалога
            const dialog = document.querySelector('[role="dialog"], .modal, [class*="modal"], [class*="dialog"]');
            const sidebar = document.querySelector('[class*="sidebar"], [class*="panel"], [class*="drawer"], [class*="side"]');
            
            // Также проверяем, что это действительно список участников, а не другое модальное окно
            if (dialog || sidebar) {
              // Проверяем, что в контейнере есть признаки списка участников
              const container = dialog || sidebar;
              const hasAvatars = container.querySelectorAll('img[class*="avatar"], [class*="avatar"] img').length > 0;
              const hasNames = container.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
              const hasParticipantText = container.textContent.includes('участник') || 
                                        container.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                        container.textContent.includes('Участники') ||
                                        container.textContent.includes('Members');
              
              if (hasAvatars || (hasNames && hasParticipantText)) {
                participantsOpened = true;
                console.error('[imct_counter] Список участников открылся!');
                break;
              }
            }
            
            // Также проверяем изменение URL или появление новых элементов
            const currentUrl = window.location.href;
            if (currentUrl !== url && currentUrl.match(/\/-\d+/)) {
              // URL изменился, возможно открылась страница информации о чате
              participantsOpened = true;
              console.error('[imct_counter] URL изменился, возможно открылась страница информации о чате');
              break;
            }
            
            await wait(500);
          }
        }
    } else if (!hasParticipantsPage && !buttonElement) {
      console.error('[imct_counter] Кнопка для открытия информации о чате не найдена!');
      // Пробуем найти header и кликнуть по нему
      const headerElement = document.querySelector('header');
      if (headerElement) {
        console.error('[imct_counter] Пробуем кликнуть по header');
        headerElement.scrollIntoView({ behavior: 'auto', block: 'center' });
        await wait(500);
        try {
          headerElement.click();
          await wait(2000);
        } catch (e) {
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1
          });
          headerElement.dispatchEvent(clickEvent);
          await wait(2000);
        }
      }
    }
    
    // Ищем список участников - обычно это модальное окно или боковая панель
    // Пробуем разные варианты селекторов с несколькими попытками
    let participantsContainer = null;
    
    // Если мы уже на странице участников, используем найденный контейнер
    if (hasParticipantsPage && existingParticipantsContainer) {
      participantsContainer = existingParticipantsContainer;
      console.error('[imct_counter] Используем уже найденный контейнер со списком участников');
    } else {
      // Иначе ищем контейнер
      let attempts = 0;
      const maxAttempts = 20; // Увеличено количество попыток
      
      console.error('[imct_counter] Начинаем поиск контейнера со списком участников');
      
      // Сначала ждем немного, чтобы модальное окно успело открыться
      await wait(2000);
    
    while (!participantsContainer && attempts < maxAttempts) {
        // Способ 0: Ищем по классу content svelte-13fay8c (специфичный для страницы участников)
        if (!participantsContainer) {
          // Сначала ищем точное совпадение
          const exactContent = document.querySelector('.content.svelte-13fay8c');
          if (exactContent) {
            // Проверяем, что это действительно список участников
            const hasAvatars = exactContent.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
            const hasNames = exactContent.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
            const hasParticipantText = exactContent.textContent.includes('участник') || 
                                      exactContent.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      exactContent.textContent.includes('Участники') ||
                                      exactContent.textContent.includes('Members');
            
            if (hasAvatars || (hasNames && hasParticipantText)) {
              // Ищем скроллируемый контейнер внутри content
              const scrollableContainer = exactContent.querySelector('[class*="scroll"], [class*="list"], [style*="overflow"]');
              participantsContainer = scrollableContainer || exactContent;
              console.error('[imct_counter] Найден контейнер по классу content svelte-13fay8c');
            }
          }
          
          // Если не нашли точное совпадение, ищем по частичным совпадениям
          if (!participantsContainer) {
            const contentElements = document.querySelectorAll('[class*="content"][class*="svelte-13fay8c"], [class*="svelte-13fay8c"]');
            for (const contentEl of contentElements) {
              // Проверяем, что это действительно список участников
              const hasAvatars = contentEl.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
              const hasNames = contentEl.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
              const hasParticipantText = contentEl.textContent.includes('участник') || 
                                        contentEl.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                        contentEl.textContent.includes('Участники') ||
                                        contentEl.textContent.includes('Members');
              
              if (hasAvatars || (hasNames && hasParticipantText)) {
                // Ищем скроллируемый контейнер внутри content
                const scrollableContainer = contentEl.querySelector('[class*="scroll"], [class*="list"], [style*="overflow"]');
                participantsContainer = scrollableContainer || contentEl;
                console.error('[imct_counter] Найден контейнер по частичному совпадению класса svelte-13fay8c');
                break;
              }
            }
          }
        }
        
        // Способ 1: Ищем модальное окно или диалог (самый надежный способ)
        const dialogs = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="dialog"]');
        for (const dialog of dialogs) {
          // Проверяем, что это действительно модальное окно со списком участников
          const hasAvatars = dialog.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
          const hasNames = dialog.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
          const hasParticipantText = dialog.textContent.includes('участник') || 
                                    dialog.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                    dialog.textContent.includes('Участники') ||
                                    dialog.textContent.includes('Members');
          
          // Проверяем, что это не основной контент чата
          const isMainChat = dialog.closest('[class*="chat"], [class*="message"], [class*="history"]');
          
          if (!isMainChat && (hasAvatars || (hasNames && hasParticipantText))) {
            participantsContainer = dialog;
            console.error('[imct_counter] Найден контейнер по role="dialog" или modal');
            break;
          }
        }
        
        // Способ 2: Ищем боковую панель
        if (!participantsContainer) {
          const sidebars = document.querySelectorAll('[class*="sidebar"], [class*="panel"], [class*="drawer"], [class*="side"]');
          for (const sidebar of sidebars) {
            // Проверяем, что это не основной контент чата
            const isMainChat = sidebar.closest('[class*="chat"], [class*="message"], [class*="history"]');
            if (isMainChat) continue;
            
            const hasAvatars = sidebar.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img').length > 0;
            const hasNames = sidebar.querySelectorAll('[class*="name"], [class*="title"]').length > 0;
            const hasParticipantText = sidebar.textContent.includes('участник') || 
                                      sidebar.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      sidebar.textContent.includes('Участники');
            
            if (hasAvatars && (hasNames || hasParticipantText)) {
              participantsContainer = sidebar;
              console.error('[imct_counter] Найден контейнер по sidebar/panel/drawer');
              break;
            }
          }
        }
        
        // Способ 3: Ищем по структуре - обычно список участников в скроллируемом контейнере
        if (!participantsContainer) {
          const allContainers = document.querySelectorAll('[class*="scroll"], [class*="list"], [class*="container"]');
          for (const container of allContainers) {
            // Проверяем, что это не основной контент чата
            const isMainChat = container.closest('[class*="chat"], [class*="message"]');
            if (isMainChat) continue;
            
            const hasParticipants = container.querySelectorAll('[class*="user"], [class*="member"], [class*="participant"], [class*="avatar"], img[class*="avatar"]').length > 0;
            const hasParticipantText = container.textContent.includes('участник') || 
                                      container.textContent.match(/\d+\s*(?:из|\/)\s*\d+/) ||
                                      container.textContent.includes('Участники') ||
                                      container.textContent.includes('Members');
            if (hasParticipants && hasParticipantText) {
              participantsContainer = container;
              console.error('[imct_counter] Найден контейнер по наличию участников и текста');
              break;
            }
          }
        }
        
        // Способ 4: Ищем по наличию аватаров и имен
        if (!participantsContainer) {
          const containersWithAvatars = document.querySelectorAll('[class*="scroll"], [class*="list"]');
          for (const container of containersWithAvatars) {
            // Проверяем, что это не основной контент чата
            const isMainChat = container.closest('[class*="chat"], [class*="message"]');
            if (isMainChat) continue;
            
            const avatars = container.querySelectorAll('img[class*="avatar"], [class*="avatar"] img, [class*="user"] img');
            const names = container.querySelectorAll('[class*="name"], [class*="title"]');
            if (avatars.length > 2 && names.length > 2) { // Минимум 3 участника
              participantsContainer = container;
              console.error('[imct_counter] Найден контейнер по наличию аватаров и имен');
              break;
            }
          }
        }
        
        // Способ 5: Ищем любой элемент с большим количеством аватаров (может быть список участников)
        if (!participantsContainer) {
          const allElements = document.querySelectorAll('div, section, aside');
          for (const el of allElements) {
            // Проверяем, что это не основной контент чата
            const isMainChat = el.closest('[class*="chat"], [class*="message"]');
            if (isMainChat) continue;
            
            const avatars = el.querySelectorAll('img[class*="avatar"], [class*="avatar"] img');
            if (avatars.length >= 3) { // Минимум 3 аватара
              // Проверяем, что элемент видим
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                participantsContainer = el;
                console.error('[imct_counter] Найден контейнер по большому количеству аватаров');
                break;
              }
            }
          }
        }
        
        if (!participantsContainer) {
          attempts++;
          console.error(`[imct_counter] Контейнер не найден, попытка ${attempts}/${maxAttempts}`);
          await wait(500); // Ждем и пробуем еще раз
        } else {
          console.error('[imct_counter] Контейнер со списком участников найден!');
          break;
        }
      }
    
      if (!participantsContainer) {
        console.error('[imct_counter] ВНИМАНИЕ: Контейнер со списком участников не найден после всех попыток');
      }
    }
    
    if (participantsContainer) {
      console.error('[imct_counter] Найден контейнер участников, начинаем скролл. Тип контейнера:', participantsContainer.className);
      
      // Скроллим список участников, чтобы загрузить всех
      let previousCount = 0;
      let scrollAttempts = 0;
      const maxScrollAttempts = 30; // Увеличено количество попыток
      
      while (scrollAttempts < maxScrollAttempts) {
        // Ищем элементы участников
        const participantElements = participantsContainer.querySelectorAll('[class*="user"], [class*="member"], [class*="participant"], [role="listitem"], [class*="avatar"]');
        
        if (participantElements.length === previousCount && previousCount > 0) {
          // Количество не изменилось, возможно все загружено
          console.error(`[imct_counter] Количество участников не изменилось: ${previousCount}, завершаем скролл`);
          break;
        }
        
        previousCount = participantElements.length;
        console.error(`[imct_counter] Найдено участников: ${previousCount}, попытка скролла: ${scrollAttempts + 1}`);
        
        // Пробуем разные способы скролла
        try {
          // Способ 1: Прямой скролл контейнера
          const scrollHeight = participantsContainer.scrollHeight;
          const clientHeight = participantsContainer.clientHeight;
          const currentScrollTop = participantsContainer.scrollTop;
          
          console.error(`[imct_counter] Скролл контейнера: scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, scrollTop=${currentScrollTop}`);
          
          if (scrollHeight > clientHeight) {
            // Контейнер можно скроллить
            participantsContainer.scrollTop = scrollHeight;
            // Также пробуем scrollIntoView для последнего элемента
            const lastElement = participantElements[participantElements.length - 1];
            if (lastElement) {
              lastElement.scrollIntoView({ behavior: 'auto', block: 'end' });
            }
          } else {
            // Если контейнер не скроллится, пробуем скроллить window или document
            window.scrollTo(0, document.body.scrollHeight);
            // Также пробуем скроллить родительский элемент
            const parent = participantsContainer.parentElement;
            if (parent && parent.scrollHeight > parent.clientHeight) {
              parent.scrollTop = parent.scrollHeight;
            }
          }
        } catch (e) {
          console.error('[imct_counter] Ошибка при скролле контейнера:', e);
          // Пробуем альтернативный способ
          try {
            window.scrollTo(0, document.body.scrollHeight);
            // Пробуем скроллить родительский элемент
            const parent = participantsContainer.parentElement;
            if (parent) {
              parent.scrollTop = parent.scrollHeight;
            }
          } catch (e2) {
            console.error('[imct_counter] Ошибка при альтернативном скролле:', e2);
          }
        }
        
        await wait(800); // Увеличено время ожидания для загрузки
        
        scrollAttempts++;
      }
      
      console.error(`[imct_counter] Скролл завершен. Всего найдено участников: ${previousCount}`);
      
      // Собираем информацию об участниках
      // Пробуем разные селекторы для элементов участников
      console.error('[imct_counter] Начинаем поиск элементов участников в контейнере');
      
      let participantElements = participantsContainer.querySelectorAll('[class*="user"], [class*="member"], [class*="participant"]');
      console.error(`[imct_counter] Найдено элементов по user/member/participant: ${participantElements.length}`);
      
      // Если не нашли, пробуем другие варианты
      if (participantElements.length === 0) {
        participantElements = participantsContainer.querySelectorAll('[role="listitem"], [class*="item"], [class*="row"]');
        console.error(`[imct_counter] Найдено элементов по role/listitem/item/row: ${participantElements.length}`);
      }
      
      // Если все еще не нашли, ищем элементы с аватарами
      if (participantElements.length === 0) {
        const elementsWithAvatars = participantsContainer.querySelectorAll('[class*="avatar"], img[class*="avatar"]');
        // Берем родительские элементы аватаров
        participantElements = Array.from(elementsWithAvatars).map(avatar => {
          return avatar.closest('div, li, span, article, section') || avatar.parentElement;
        }).filter(el => el && el !== participantsContainer);
        console.error(`[imct_counter] Найдено элементов по аватарам: ${participantElements.length}`);
      }
      
      // Если все еще не нашли, ищем по структуре - элементы с аватарами или именами
      if (participantElements.length === 0) {
        const allElements = participantsContainer.querySelectorAll('div, li, span, article, section');
        participantElements = Array.from(allElements).filter(el => {
          const hasAvatar = el.querySelector('[class*="avatar"], img') !== null;
          const hasName = el.querySelector('[class*="name"], [class*="title"]') !== null;
          const text = el.textContent.trim();
          const looksLikeParticipant = text.length > 0 && text.length < 200 && 
                                      !text.match(/^\d+$/) && // Не просто число
                                      !text.includes('участник') && // Не заголовок
                                      !text.match(/^\d+\s*(?:из|\/)\s*\d+$/); // Не счетчик
          return (hasAvatar || hasName) && looksLikeParticipant;
        });
        console.error(`[imct_counter] Найдено элементов по структуре: ${participantElements.length}`);
      }
      
      console.error(`[imct_counter] Всего найдено элементов участников: ${participantElements.length}`);
      
      participantElements.forEach((element) => {
        // Получаем имя участника - ищем в разных местах
        let participantName = '';
        
        // Сначала ищем элемент с именем
        const nameElement = element.querySelector('[class*="name"], [class*="title"], [class*="text"]');
        if (nameElement) {
          participantName = nameElement.textContent.trim();
        } else {
          // Если не нашли, берем весь текст элемента, но фильтруем
          const allText = element.textContent.trim();
          // Убираем лишнее (роли, статусы и т.д.)
          const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          participantName = lines[0] || allText;
        }
        
        // Очищаем имя от лишних символов
        participantName = participantName.replace(/\s+/g, ' ').trim();
        
        if (participantName && participantName.length > 0 && participantName.length < 200 && 
            !participantName.match(/^\d+$/) && 
            !participantName.includes('участник') &&
            !participantName.match(/^\d+\s*(?:из|\/)\s*\d+$/)) {
          
          // Проверяем роль участника
          let isAdmin = false;
          let isOwner = false;
          
          // Ищем индикаторы роли в тексте элемента
          const roleText = element.textContent.toLowerCase();
          
          // Проверяем по тексту и атрибутам
          if (roleText.includes('владелец') || roleText.includes('owner') || 
              roleText.includes('создатель') || roleText.includes('creator')) {
            isOwner = true;
            ownersCount++;
          } else if (roleText.includes('админ') || roleText.includes('admin') || 
                    roleText.includes('администратор') || roleText.includes('administrator')) {
            isAdmin = true;
            adminsCount++;
          }
          
          // Проверяем наличие специальных классов или атрибутов для ролей
          const roleElements = element.querySelectorAll('[class*="role"], [class*="badge"], [class*="admin"], [class*="owner"]');
          roleElements.forEach(roleEl => {
            const roleClass = roleEl.className.toLowerCase();
            if (roleClass.includes('owner') || roleClass.includes('владелец')) {
              isOwner = true;
              ownersCount++;
            } else if (roleClass.includes('admin') || roleClass.includes('админ')) {
              isAdmin = true;
              adminsCount++;
            }
          });
          
          // Проверяем наличие бота
          if (participantName.includes('Цифровой вуз Бот') || 
              participantName.includes('Цифровой вуз') || 
              participantName.includes('Digital Vuz') ||
              participantName.includes('ЦифровойВуз')) {
            hasDigitalVuzBot = true;
          }
          
          // Добавляем только если имя не пустое и не дубликат
          const isDuplicate = participantsList.some(p => p.name === participantName);
          if (!isDuplicate) {
            participantsList.push({
              name: participantName,
              isAdmin: isAdmin,
              isOwner: isOwner
            });
          }
        }
      });
      
      // Закрываем список участников
      // Пробуем найти кнопку закрытия
      let closeButton = document.querySelector('[aria-label*="закрыть" i], [aria-label*="close" i], button[class*="close"], [class*="close-button"]');
      
      // Если не нашли, ищем кнопку с крестиком или иконкой закрытия
      if (!closeButton) {
        const closeIcons = document.querySelectorAll('svg[class*="close"], [class*="icon-close"], button svg');
        for (const icon of closeIcons) {
          const button = icon.closest('button');
          if (button) {
            closeButton = button;
            break;
          }
        }
      }
      
      if (closeButton) {
        closeButton.click();
        await wait(500);
      } else {
        // Пробуем нажать ESC несколько раз
        for (let i = 0; i < 3; i++) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          await wait(100);
        }
        await wait(300);
      }
    }
  } catch (error) {
    // Игнорируем ошибки при сборе участников
  }
  
  return {
    name: name,
    url: url,
    participants: participants,
    participantsList: participantsList,
    adminsCount: adminsCount,
    ownersCount: ownersCount,
    hasDigitalVuzBot: hasDigitalVuzBot
  };
}

// Функция возврата в список чатов
async function goBackToList() {
  // Пробуем найти кнопку "Назад" разными способами
  let backButton = document.querySelector('[aria-label*="назад" i], [aria-label*="back" i]');
  
  if (!backButton) {
    // Ищем по классу
    backButton = document.querySelector('button[class*="back" i], [class*="back" i]');
  }
  
  if (!backButton) {
    // Ищем SVG иконку стрелки влево и берем родительский элемент
    const arrowLeft = document.querySelector('svg use[href*="arrow_left"], svg use[href*="chevron_left"]');
    if (arrowLeft) {
      backButton = arrowLeft.closest('button') || arrowLeft.closest('[role="button"]');
    }
  }
  
  if (backButton) {
    backButton.click();
    await wait(500); // Уменьшено с 2000 до 500
  } else {
    // Используем историю браузера
    window.history.back();
    await wait(500); // Уменьшено с 2000 до 500
  }
  
  // Ждем возврата в список чатов - оптимизированная проверка
  try {
    // Быстрая проверка - если уже на странице списка, не ждем
    if (document.querySelector('.svelte-1u8ha7t, [role="presentation"].wrapper.svelte-q2jdqb')) {
      await wait(200); // Короткая задержка для стабилизации
      return;
    }
    await waitForElement('.svelte-1u8ha7t, [role="presentation"].wrapper.svelte-q2jdqb', 5000);
  } catch (e) {
    // Если не нашли по классу, ждем просто загрузки страницы
    await wait(1000); // Уменьшено с 3000 до 1000
  }
  await wait(300); // Уменьшено с 1000 до 300
}

// Функция нормализации URL (убирает параметры запроса и хэш)
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    // Возвращаем только путь (без параметров и хэша)
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    // Если не удалось распарсить, возвращаем как есть
    return url.split('?')[0].split('#')[0];
  }
}

// Функция сбора всех ссылок на чаты
async function collectAllChatUrls() {
  try {
    console.error('[imct_counter] collectAllChatUrls: начинаем поиск чатов');
    // Находим все чаты
    let container, chats;
    try {
      const result = findAllChats();
      container = result.container;
      chats = result.chats;
      console.error('[imct_counter] collectAllChatUrls: найдено чатов:', chats.length);
    } catch (error) {
      console.error('[imct_counter] collectAllChatUrls: ошибка при поиске чатов:', error);
      throw new Error('Ошибка при поиске чатов: ' + error.message);
    }
    
    if (chats.length === 0) {
      console.error('[imct_counter] collectAllChatUrls: чаты не найдены');
      throw new Error('Чаты не найдены. Убедитесь, что вы находитесь на странице со списком чатов.');
    }
    
    // Скроллим для загрузки всех чатов
    try {
      await scrollToLoadAllChats(container);
    } catch (error) {
      // Продолжаем с текущим списком чатов
    }
    
    // Даем время для завершения загрузки
    await wait(1000);
    
    // Обновляем список чатов после скролла
    let allChatsAfterScroll;
    try {
      const result = findAllChats();
      allChatsAfterScroll = result.chats;
    } catch (error) {
      allChatsAfterScroll = chats; // Используем исходный список
    }
    
    // Если количество не увеличилось после скролла, пробуем еще раз
    if (allChatsAfterScroll.length <= chats.length && chats.length < 100) {
      try {
        await scrollToLoadAllChats(container);
        await wait(1000);
        const result = findAllChats();
        allChatsAfterScroll = result.chats;
      } catch (error) {
        // Игнорируем ошибки
      }
    }
    
    if (allChatsAfterScroll.length === 0) {
      throw new Error('Не удалось найти чаты после скроллинга');
    }
    
    // Собираем все ссылки на чаты
    const chatUrls = [];
    const chatsWithoutUrl = [];
    
    allChatsAfterScroll.forEach((chat, index) => {
      // Если у чата есть URL, добавляем его
      if (chat.url && chat.url.match(/\/-\d+($|\/)/)) {
        chatUrls.push({
          index: index + 1,
          name: chat.name || 'Без названия',
          url: chat.url,
          foundWithoutOpening: true
        });
      } else {
        // Чат без URL - потребуется открыть для получения ссылки
        chatsWithoutUrl.push({
          index: index + 1,
          name: chat.name || 'Без названия',
          element: chat.element
        });
      }
    });
    
    // Отправляем ссылки в popup
    chrome.runtime.sendMessage({
      action: 'chatUrls',
      urls: chatUrls,
      chatsWithoutUrl: chatsWithoutUrl,
      total: allChatsAfterScroll.length,
      foundWithoutOpening: chatUrls.length
    });
    
    return {
      urls: chatUrls,
      allChats: allChatsAfterScroll,
      container: container
    };
    
  } catch (error) {
    console.error('[imct_counter] Ошибка при сборе ссылок:', error);
    throw error;
  }
}

// Основная функция сбора данных
async function collectChatData(maxChats = null) {
  try {
    console.error('[imct_counter] collectChatData запущена, maxChats:', maxChats);
    isRunning = true;
    collectedData = [];
    currentIndex = 0;
    processedUrls = new Set(); // Сбрасываем список обработанных URL
    
    // Очищаем все сохраненные данные при запуске
    chrome.storage.local.set({ collectedData: [], processedUrls: [] });
    
    // Отправляем начальный прогресс
    console.error('[imct_counter] Отправляем начальный прогресс');
    sendProgress(0, 1);
    
    // Сначала собираем все ссылки на чаты
    console.error('[imct_counter] Начинаем сбор ссылок на чаты');
    let result;
    try {
      result = await collectAllChatUrls();
      allChats = result.allChats;
      console.error('[imct_counter] Собрано чатов:', allChats.length);
    } catch (error) {
      console.error('[imct_counter] Ошибка при сборе ссылок:', error);
      sendError('Ошибка при сборе ссылок: ' + error.message);
      isRunning = false;
      return;
    }
    
    if (allChats.length === 0) {
      console.error('[imct_counter] Не найдено чатов');
      sendError('Не удалось найти чаты');
      isRunning = false;
      return;
    }
    
    // Ограничиваем количество чатов, если указан maxChats
    if (maxChats && maxChats > 0) {
      console.error('[imct_counter] Ограничиваем количество чатов до:', maxChats);
      allChats = allChats.slice(0, maxChats);
    }
    
    console.error('[imct_counter] Начинаем обработку чатов, всего:', allChats.length);
    sendProgress(0, allChats.length);
    
    // Получаем контейнер для скролла (нужен для прокрутки к чатам)
    let scrollContainer = null;
    try {
      const containerResult = findAllChats();
      scrollContainer = containerResult.container;
      console.log('[imct_counter] Контейнер для скролла найден:', scrollContainer.className);
    } catch (e) {
      console.warn('[imct_counter] Не удалось найти контейнер для скролла:', e);
      // Пробуем найти контейнер по классу
      scrollContainer = document.querySelector('.scrollable.scrollListScrollable, .scrollListScrollable, [class*="scrollListScrollable"]') ||
                       document.querySelector('.svelte-1u8ha7t');
    }
    
    // Обрабатываем каждый чат
    for (let i = 0; i < allChats.length && isRunning; i++) {
      // Проверяем флаг остановки перед каждой итерацией
      const runningState = await new Promise(resolve => {
        chrome.storage.local.get(['isRunning'], (result) => {
          resolve(result.isRunning !== false);
        });
      });
      
      if (!runningState) {
        isRunning = false;
        break;
      }
      
      currentIndex = i;
      const chat = allChats[i];
      
      try {
        // Добавляем таймаут для каждой операции с чатом (максимум 45 секунд)
        const chatProcessingPromise = (async () => {
          // Проверяем, есть ли URL чата в элементе перед кликом
          // Если URL есть и он не групповой, пропускаем сразу
          const chatUrl = chat.url || '';
          if (chatUrl && !chatUrl.match(/\/-\d+($|\/)/)) {
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Сначала убеждаемся, что мы на странице списка чатов
          // Если мы в каком-то чате, возвращаемся в список
          const currentUrlBefore = window.location.href;
          if (currentUrlBefore.match(/\/-\d+($|\/)/)) {
            await goBackToList();
            await wait(1000); // Ждем возврата в список
          }
          
          // Проверяем, что мы действительно на странице списка
          const urlAfterReturn = window.location.href;
          if (!urlAfterReturn.includes('web.max.ru') || urlAfterReturn.match(/\/-\d+($|\/)/)) {
            // Пробуем еще раз
            await goBackToList();
            await wait(1000);
          }
          
          // ВАЖНО: Переискиваем элемент, так как список мог обновиться после возврата
          let clickableElement = null;
          let elementFound = false;
          
          // Проверяем, что исходный элемент все еще в DOM
          if (chat.element && chat.element.isConnected) {
            clickableElement = chat.element;
            elementFound = true;
            console.log('[imct_counter] Исходный элемент найден в DOM');
          } else {
            // Элемент не найден, пробуем найти по названию чата
            console.log('[imct_counter] Исходный элемент не найден, ищем по названию...');
            
            // Ищем элемент по названию чата
            const allChatElements = document.querySelectorAll('[role="presentation"].wrapper.svelte-q2jdqb, .wrapper.svelte-q2jdqb, button.cell.svelte-q2jdqb');
            for (const el of allChatElements) {
              const nameElement = el.querySelector('h3.title span.name span.text') ||
                               el.querySelector('h3.title span.name') ||
                               el.querySelector('h3.title') ||
                               el.querySelector('.title');
              if (nameElement) {
                const name = nameElement.textContent.trim();
                if (name === chat.name || name.includes(chat.name) || chat.name.includes(name)) {
                  clickableElement = el.querySelector('button.cell') || el.querySelector('button') || el;
                  elementFound = true;
                  break;
                }
              }
            }
          }
          
          // Если элемент не найден, пропускаем этот чат
          if (!elementFound || !clickableElement) {
            console.error(`[imct_counter] Элемент чата "${chat.name}" не найден в DOM, пропускаем`);
            return;
          }
          
          // Сохраняем URL до клика для проверки изменений
          const urlBeforeClick = window.location.href;
          
          // Прокручиваем контейнер, чтобы чат был виден
          if (scrollContainer) {
            // Вычисляем позицию элемента относительно контейнера
            const elementRect = clickableElement.getBoundingClientRect();
            const containerRect = scrollContainer.getBoundingClientRect();
            
            // Вычисляем позицию элемента относительно контейнера
            const elementTop = elementRect.top - containerRect.top + scrollContainer.scrollTop;
            const elementCenter = elementTop - (containerRect.height / 2) + (elementRect.height / 2);
            
            // Прокручиваем контейнер к элементу
            scrollContainer.scrollTo({
              top: Math.max(0, elementCenter - 100), // Немного выше центра для лучшей видимости
              behavior: 'auto'
            });
            await wait(400); // Увеличено время ожидания
          }
          
          // Прокручиваем к элементу еще раз перед кликом
          // Используем несколько попыток для надежности
          let scrollAttempts = 0;
          let elementVisible = false;
          
          while (scrollAttempts < 5) { // Увеличено количество попыток
            // Проверяем, что элемент все еще в DOM
            if (!clickableElement.isConnected) {
              console.error('[imct_counter] Элемент исчез из DOM во время прокрутки');
              return;
            }
            
            clickableElement.scrollIntoView({ behavior: 'auto', block: 'center' });
            await wait(400); // Увеличено время ожидания
            
            // Проверяем, что элемент стал видимым
            const rect = clickableElement.getBoundingClientRect();
            const isInViewport = rect.top >= -100 && // Более мягкая проверка
                            rect.left >= -100 && 
                            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 100 &&
                            rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 100;
            
            const hasSize = clickableElement.offsetHeight > 0 || clickableElement.offsetWidth > 0;
            
            if ((isInViewport && hasSize) || clickableElement.offsetHeight > 0) {
              elementVisible = true;
              break;
            }
            
            scrollAttempts++;
          }
          
          // Пробуем кликнуть разными способами
          let clickSuccess = false;
          
          // Способ 1: Обычный клик
          try {
            clickableElement.click();
            clickSuccess = true;
          } catch (clickError) {
            // Игнорируем ошибки
          }
          
          // Способ 2: Программный MouseEvent
          if (!clickSuccess) {
            try {
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
              });
              clickableElement.dispatchEvent(clickEvent);
              clickSuccess = true;
            } catch (eventError) {
              // Игнорируем ошибки
            }
          }
          
          // Способ 3: mousedown + mouseup
          if (!clickSuccess) {
            try {
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
              });
              const mouseUpEvent = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
              });
              clickableElement.dispatchEvent(mouseDownEvent);
              await wait(50);
              clickableElement.dispatchEvent(mouseUpEvent);
              await wait(50);
              clickableElement.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                buttons: 1
              }));
              clickSuccess = true;
            } catch (eventError) {
              // Игнорируем ошибки
            }
          }
          
          if (!clickSuccess) {
            return;
          }
          
          // Увеличиваем время ожидания загрузки страницы
          // Используем более быструю проверку с меньшими интервалами
          let maxWait = 30; // Увеличено с 20 до 30
          let urlChanged = false;
          let lastUrl = urlBeforeClick;
          let stableUrlCount = 0; // Счетчик стабильного URL
          
          while (maxWait > 0) {
            await wait(300); // Увеличено с 200 до 300 для надежности
            const currentUrl = window.location.href;
            
            // Проверяем, изменился ли URL
            if (currentUrl !== urlBeforeClick) {
              // Если URL изменился на формат группового чата - отлично
              if (currentUrl.match(/\/-\d+($|\/)/)) {
                // Проверяем, что это действительно новый чат (не тот же самый)
                const normalizedCurrent = normalizeUrl(currentUrl);
                const normalizedBefore = normalizeUrl(urlBeforeClick);
                
                if (normalizedCurrent !== normalizedBefore) {
                  urlChanged = true;
                  console.log(`[imct_counter] Чат открылся: ${currentUrl}`);
                  break;
                } else {
                  // Это тот же чат, возможно клик не сработал
                  console.log(`[imct_counter] URL не изменился (тот же чат): ${currentUrl}`);
                  // Пробуем вернуться и кликнуть еще раз
                  await goBackToList();
                  await wait(1000);
                  return; // Выходим, чтобы попробовать следующий чат
                }
              }
              
              // Если URL изменился, но не на групповой чат
              if (currentUrl !== lastUrl) {
                console.log(`[imct_counter] URL изменился, но не на групповой чат: ${currentUrl}`);
                // Даем еще немного времени на загрузку
                await wait(500);
                const finalUrl = window.location.href;
                if (finalUrl.match(/\/-\d+($|\/)/)) {
                  urlChanged = true;
                  break;
                }
                // Если все еще не групповой чат - пропускаем
                console.log(`[imct_counter] Чат не является групповым. URL: ${finalUrl}`);
                if (finalUrl !== urlBeforeClick && finalUrl !== 'https://web.max.ru/') {
                  // Пробуем вернуться назад
                  await goBackToList();
                }
                return; // Выходим из Promise, но продолжаем цикл
              }
            } else {
              // URL не изменился
              stableUrlCount++;
              // Если URL не меняется 5 раз подряд, считаем что клик не сработал
              if (stableUrlCount >= 5) {
                console.log(`[imct_counter] URL не изменился после ${stableUrlCount} проверок, клик не сработал`);
                break;
              }
            }
            
            lastUrl = currentUrl;
            maxWait--;
          }
          
          // Если URL не изменился, возможно чат не открылся - пропускаем
          if (!urlChanged) {
            const finalUrl = window.location.href;
            console.log(`[imct_counter] Чат не открылся или не является групповым. URL: ${finalUrl}`);
            
            // Проверяем, не остались ли мы на той же странице
            if (finalUrl === urlBeforeClick || finalUrl === 'https://web.max.ru/') {
              // Мы остались на главной странице или на той же странице - чат не открылся
              console.log('[imct_counter] Остались на той же странице, чат не открылся');
              return; // Выходим из Promise, но продолжаем цикл
            }
            
            // Если мы в каком-то чате, но не в групповом - возвращаемся
            if (finalUrl.match(/\/-\d+($|\/)/)) {
              // Мы в чате, но возможно это не тот чат, который нужен
              console.log('[imct_counter] Находимся в чате, но возможно не тот, возвращаемся');
              await goBackToList();
            }
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Извлекаем данные
          const data = await extractChatData();
          
          // Используем URL из текущей страницы (должен быть в формате группового чата)
          // Формат группового чата: https://web.max.ru/-71128136750354
          const finalUrl = window.location.href;
          
          // Проверяем, что это действительно групповой чат
          if (!finalUrl.match(/\/-\d+($|\/)/)) {
            console.log(`[imct_counter] Пропущен негрупповой чат: ${finalUrl}`);
            await goBackToList();
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Нормализуем URL для проверки дубликатов
          const normalizedUrl = normalizeUrl(finalUrl);
          
          // Пропускаем, если этот чат уже был обработан
          if (processedUrls.has(normalizedUrl)) {
            console.log(`[imct_counter] Пропущен дубликат чата: ${normalizedUrl} (уже обработан)`);
            await goBackToList();
            return; // Выходим из Promise, но продолжаем цикл
          }
          
          // Добавляем URL в множество обработанных СРАЗУ после проверки
          processedUrls.add(normalizedUrl);
          console.log(`[imct_counter] Обрабатываем чат: ${normalizedUrl} (${i + 1}/${allChats.length})`);
          
          // Сохраняем данные только для групповых чатов
          collectedData.push({
            name: data.name || chat.name,
            url: finalUrl,
            participants: data.participants,
            participantsList: data.participantsList || [],
            adminsCount: data.adminsCount || 0,
            ownersCount: data.ownersCount || 0,
            hasDigitalVuzBot: data.hasDigitalVuzBot || false
          });
          
          // Сохраняем промежуточные данные каждые 5 чатов (оптимизация)
          if (collectedData.length % 5 === 0) {
            saveData();
          }
          
          // Возвращаемся в список
          await goBackToList();
          
          // Обновляем прогресс
          sendProgress(i + 1, allChats.length);
          
          // Минимальная задержка между чатами (уменьшено с 1000 до 200)
          await wait(200);
        })();
        
        // Таймаут 45 секунд на обработку одного чата
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Таймаут обработки чата (45 секунд)')), 45000);
        });
        
        // Ждем завершения или таймаута
        await Promise.race([chatProcessingPromise, timeoutPromise]);
        
      } catch (error) {
        console.error(`[imct_counter] Ошибка при обработке чата ${i + 1} (${chat.name || 'без названия'}):`, error);
        
        // Пытаемся вернуться в список, даже если произошла ошибка
        try {
          // Проверяем, где мы находимся
          const currentUrl = window.location.href;
          if (currentUrl.includes('web.max.ru') && currentUrl.match(/\/-\d+($|\/)/)) {
            // Мы в чате - пытаемся вернуться
            console.log('[imct_counter] Пытаемся вернуться в список после ошибки...');
            await Promise.race([
              goBackToList(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут возврата')), 10000))
            ]);
          }
        } catch (e) {
          console.error('[imct_counter] Ошибка при возврате в список после ошибки:', e);
          // Если не удалось вернуться, пробуем использовать history
          try {
            if (window.location.href.includes('web.max.ru')) {
              window.history.back();
              await wait(2000);
            }
          } catch (historyError) {
            console.error('[imct_counter] Не удалось вернуться через history:', historyError);
          }
        }
        
        // Продолжаем со следующим чатом
        sendProgress(i + 1, allChats.length);
      }
    }
    
    if (isRunning) {
      // Завершение работы - сохраняем все данные
      saveData();
      sendCompleted();
    }
    
  } catch (error) {
    console.error('Ошибка при сборе данных:', error);
    sendError(error.message);
  } finally {
    isRunning = false;
  }
}

// Функция отправки прогресса
function sendProgress(current, total) {
  console.log(`[imct_counter] Прогресс: ${current} / ${total}`);
  
  try {
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      current: current,
      total: total
    });
    
    // Также отправляем в popup напрямую
    chrome.runtime.sendMessage({
      action: 'progress',
      current: current,
      total: total
    });
  } catch (error) {
    console.error('[imct_counter] Ошибка при отправке прогресса:', error);
  }
}

// Функция сохранения данных
function saveData() {
  chrome.runtime.sendMessage({
    action: 'saveData',
    data: collectedData
  });
  
  chrome.storage.local.set({ collectedData: collectedData });
}

// Функция отправки завершения
function sendCompleted() {
  chrome.runtime.sendMessage({
    action: 'completed',
    data: collectedData
  });
  
  chrome.storage.local.set({ 
    isRunning: false, 
    collectedData: collectedData 
  });
}

// Функция отправки ошибки
function sendError(errorMessage) {
  chrome.runtime.sendMessage({
    action: 'error',
    error: errorMessage
  });
  
  chrome.storage.local.set({ isRunning: false });
}

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start') {
    if (isRunning) {
      sendResponse({ error: 'Сбор данных уже запущен' });
      return false;
    }
    
    // Получаем параметр maxChats из сообщения (если есть)
    const maxChats = message.maxChats || null;
    
    console.error('[imct_counter] Получена команда start, maxChats:', maxChats);
    
    // Для асинхронных операций нужно вернуть true
    collectChatData(maxChats).then(() => {
      console.error('[imct_counter] collectChatData завершена успешно');
      // sendResponse вызывается асинхронно, поэтому нужно вернуть true
    }).catch((error) => {
      console.error('[imct_counter] Ошибка в collectChatData:', error);
      sendError(error.message);
    });
    
    // Отправляем ответ о том, что процесс запущен
    sendResponse({ success: true, message: 'Сбор данных запущен' });
    
    // Возвращаем true для асинхронного ответа
    return true;
  } else if (message.action === 'stop') {
    console.log('[imct_counter] Получена команда остановки');
    isRunning = false;
    chrome.storage.local.set({ isRunning: false });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'reset') {
    console.log('[imct_counter] Получена команда сброса данных');
    isRunning = false;
    collectedData = [];
    processedUrls = new Set();
    chrome.storage.local.set({ 
      collectedData: [], 
      isRunning: false,
      processedUrls: [] 
    });
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'getStatus') {
    sendResponse({ 
      isRunning: isRunning,
      current: currentIndex,
      total: allChats.length,
      collected: collectedData.length
    });
  }
});

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('imct_counter content script загружен');
  });
} else {
  console.log('imct_counter content script загружен');
}
