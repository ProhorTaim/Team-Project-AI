// ============================================
// JavaScript для приложения "Проектник"
// ============================================

// Ждём загрузки страницы
document.addEventListener('DOMContentLoaded', function() {

    // Находим элементы на странице
    var searchInput = document.getElementById('searchInput');
    var analyzeBtn = document.getElementById('analyzeBtn');
    var searchBox = document.getElementById('searchBox');
    var resultsBox = document.getElementById('resultsBox');
    var projectsList = document.getElementById('projectsList');
    var recommendations = document.getElementById('recommendations');

    // Хранилище загруженного архива
    var archive = [];
    var config = {};
    var triggers = {};

    // Загружаем конфиг
    fetch('config.json')
        .then(function(r) { return r.json(); })
        .then(function(data) { config = data; })
        .catch(function(e) { console.error('Ошибка загрузки config.json:', e); });

    // Загружаем триггеры
    fetch('triggers.json')
        .then(function(r) { return r.json(); })
        .then(function(data) { triggers = data; })
        .catch(function(e) { console.error('Ошибка загрузки triggers.json:', e); });

    // Загружаем архив проектов из JSON-файла
    fetch('archive.json')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            archive = data;
            console.log('Архив загружен:', archive.length, 'проектов');
            // Заполняем карточки проектов
            renderCards(archive);
        })
        .catch(function(error) {
            console.error('Ошибка загрузки архива:', error);
        });

    // ==========================================
    // Функция отрисовки карточек проектов
    // ==========================================
    function renderCards(projects) {
        var cardsGrid = document.getElementById('cardsGrid');
        cardsGrid.innerHTML = '';
        projects.forEach(function(project) {
            var card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = '<div class="card-inner">' +
                '<span class="card-title">' + project.title + '</span>' +
                '<span class="card-year">' + project.year + '</span>' +
                '</div>';
            cardsGrid.appendChild(card);
        });
    }

    // ==========================================
    // Функция поиска похожих проектов
    // ==========================================
    // Принимает запрос пользователя, возвращает массив похожих проектов
    function searchSimilarProjects(query) {
        // Разбываем запрос на слова
        var queryWords = query.toLowerCase().split(/\s+/);

        // Считаем "релевантность" каждого проекта
        var scored = archive.map(function(project) {
            var score = 0;
            // Объединяем все текстовые поля проекта
            var projectText = (
                project.title + ' ' +
                project.description + ' ' +
                project.features.join(' ')
            ).toLowerCase();

            // Считаем совпадения слов
            queryWords.forEach(function(word) {
                if (word.length > 2 && projectText.indexOf(word) !== -1) {
                    score++;
                }
            });

            return { project: project, score: score };
        });

        // Сортируем по количеству совпадений и берём топ-3
        scored.sort(function(a, b) { return b.score - a.score; });

        return scored.slice(0, 3).map(function(item) {
            return item.project;
        });
    }

    // ==========================================
    // Функция вызова LLM (OpenRouter API)
    // ==========================================
    // Принимает идею и весь архив, LLM сам выбирает похожие проекты
    function callLLM(userIdea, allProjects) {
        // Формируем текст со всеми проектами из архива
        var projectsText = '';
        allProjects.forEach(function(project, index) {
            projectsText += (index + 1) + '. ' + project.title + '\n';
            projectsText += '   Описание: ' + project.description + '\n';
            projectsText += '   Функции: ' + project.features.join(', ') + '\n';
            projectsText += '   Год: ' + project.year + '\n\n';
        });

        // Системный промпт для LLM
        var systemPrompt = 'Ты — эксперт по проектной деятельности университета.\n\n' +
            'Твоя цель — помочь студенту сделать его идею сильнее.\n\n' +
            'Тебе передаются:\n' +
            '1. Описание новой идеи.\n' +
            '2. Проекты из архива университета.\n\n' +
            'ПРАВИЛА:\n' +
            '- Отвечай ТОЛЬКО на вопросы, связанные с проектными идеями.\n' +
            '- Если пользователь здоровается, спрашивает имя, возможности или задаёт не связанный с проектами вопрос — ответь: «Сформулируйте идею проекта, и я помогу её развить.»\n' +
            '- Не пересказывай проекты.\n' +
            '- Не пиши очевидные советы.\n' +
            '- Анализируй и делай выводы.\n\n' +
            'ОБЯЗАТЕЛЬНО отвечай ТОЛЬКО чистым HTML без markdown!\n' +
            'Используй теги: <h3> для заголовков, <ul> и <li> для списков, <p> для текста, <strong> для жирного.\n' +
            'НЕ используй ``` и # — только HTML-теги!\n\n' +
            'Структура ответа:\n' +
            '<h3>Похожие проекты</h3>\n' +
            '<ul><li><strong>Название</strong> — описание (процент)</li></ul>\n\n' +
            '<h3>Что уже реализовано</h3>\n' +
            '<ul><li>функция</li></ul>\n\n' +
            '<h3>Возможности для развития</h3>\n' +
            '<ul><li><strong>Название</strong> — описание</li></ul>\n\n' +
            '<h3>Итоговая рекомендация</h3>\n' +
            '<p>2-3 предложения.</p>\n\n' +
            'Кратко и по делу.';

        // Собираем полный промпт для пользователя
        var userMessage = 'Идея пользователя:\n' + userIdea + '\n\n' +
            'Весь архив проектов университета:\n' + projectsText;

        // Отправляем запрос к OpenRouter API
        return fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.apiKey
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: config.maxTokens
            })
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            }
            throw new Error('Нет ответа от LLM');
        });
    }

    // ==========================================
    // Функция форматирования без LLM (запасной вариант)
    // ==========================================
    function formatWithoutLLM(userIdea, similarProjects) {
        var result = '';

        result += '**Похожие проекты**\n\n';
        similarProjects.forEach(function(project) {
            result += '• ' + project.title + ' — ' + project.description + '\n\n';
        });

        result += '**Что уже реализовано**\n\n';
        var allFeatures = [];
        similarProjects.forEach(function(project) {
            project.features.forEach(function(f) {
                if (allFeatures.indexOf(f) === -1) {
                    allFeatures.push(f);
                }
            });
        });
        allFeatures.forEach(function(f) {
            result += '• ' + f + '\n';
        });

        result += '\n**Что можно добавить**\n\n';
        result += '• Проанализируйте функции найденных проектов и добавьте что-то новое\n';
        result += '• Подумайте о уникальном подходе к решению\n';

        result += '\n**Рекомендации**\n\n';
        result += '• Изучите найденные проекты, чтобы избежать дублирования\n';
        result += '• Определите, чем ваша идея отличается от существующих\n';
        result += '• Сосредоточьтесь на уникальных функциях\n';

        return result;
    }

    // ==========================================
    // Конвертер markdown → HTML (запасной вариант)
    // ==========================================
    function convertToHTML(text) {
        // Убираем markdown-обёртки
        text = text.replace(/```html\n?/g, '');
        text = text.replace(/```\n?/g, '');

        var lines = text.split('\n');
        var html = '';
        var inList = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();

            if (line === '') {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
            }

            // Заголовок ## или **текст**
            if (line.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<h3>' + line.substring(3) + '</h3>';
                continue;
            }

            // Список
            if (line.startsWith('- ') || line.startsWith('• ')) {
                if (!inList) { html += '<ul>'; inList = true; }
                var item = line.replace(/^[-•]\s/, '');
                item = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html += '<li>' + item + '</li>';
                continue;
            }

            // Обычный текст
            if (inList) { html += '</ul>'; inList = false; }
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html += '<p>' + line + '</p>';
        }

        if (inList) html += '</ul>';
        return html;
    }

    // ==========================================
    // Обработчик нажатия на кнопку
    // ==========================================

    // ==========================================
    // Обработчик нажатия на кнопку
    // ==========================================
    analyzeBtn.addEventListener('click', function() {
        var userIdea = searchInput.value.trim();

        if (userIdea === '') {
            alert('Пожалуйста, напишите свою идею!');
            return;
        }

        // Проверяем, похоже ли на проектную идею
        if (!isProjectIdea(userIdea)) {
            resultsBox.classList.add('visible');
            resultsBox.innerHTML = '<div class="results-content"><p>Сформулируйте идею проекта, и я помогу её развить.</p></div>';
            return;
        }

        // Запускаем анализ
        analyzeIdea(userIdea);
    });

    // ==========================================
    // Функция проверки — похоже ли на проектную идею
    // ==========================================
    function isProjectIdea(text) {
        var lower = text.toLowerCase();
        var minLength = triggers.minLength || 5;

        if (lower.length < minLength) return false;

        var allTriggers = [].concat(triggers.greetings || [], triggers.questions || []);
        for (var i = 0; i < allTriggers.length; i++) {
            if (lower === allTriggers[i] || lower.indexOf(allTriggers[i]) === 0) return false;
        }
        return true;
    }

    // ==========================================
    // Функция анализа идеи
    // ==========================================
    function analyzeIdea(userIdea) {
        var resultsBox = document.getElementById('resultsBox');

        // Плавно скрываем старые результаты
        resultsBox.classList.remove('visible');
        resultsBox.style.maxHeight = '0';
        resultsBox.style.opacity = '0';

        setTimeout(function() {
            // Очищаем и показываем заглушку
            resultsBox.innerHTML = '<div class="loading">Анализируем вашу идею...</div>';
            resultsBox.classList.add('visible');
            resultsBox.style.maxHeight = '100px';
            resultsBox.style.opacity = '1';

            // Шаг 1: Ищем похожие проекты (для fallback)
            var similarProjects = searchSimilarProjects(userIdea);
            console.log('Найдены похожие проекты:', similarProjects);

            // Шаг 2: Отправляем ВЕСТЬ архив в LLM
            callLLM(userIdea, archive)
                .then(function(llmResponse) {
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    showResults(llmResponse);
                })
                .catch(function(error) {
                    console.log('LLM недоступен, используем встроенный анализ');
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    var fallbackResponse = formatWithoutLLM(userIdea, similarProjects);
                    showResults(fallbackResponse);
                });
        }, 400);
    }

    // ==========================================
    // Функция отображения результатов с анимацией
    // ==========================================
    function showResults(text) {
        var html = convertToHTML(text);

        // Разбиваем HTML на отдельные элементы
        var temp = document.createElement('div');
        temp.innerHTML = html;
        var nodes = [];
        temp.childNodes.forEach(function(node) {
            if (node.nodeType === 1) nodes.push(node.outerHTML);
        });

        // Создаём контейнер результатов
        var contentDiv = document.createElement('div');
        contentDiv.className = 'results-content';
        resultsBox.appendChild(contentDiv);

        // Добавляем элементы по одному с задержкой
        nodes.forEach(function(html, i) {
            setTimeout(function() {
                var el = document.createElement('div');
                el.innerHTML = html;
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px) translateX(15px)';
                el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
                contentDiv.appendChild(el);

                // Запускаем анимацию
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0) translateX(0)';
                    });
                });
            }, i * 120);
        });
    }

    // ==========================================
    // Конвертер markdown → HTML (запасной вариант)
    // ==========================================
    function convertToHTML(text) {
        // Убираем markdown-обёртки
        text = text.replace(/```html\n?/g, '');
        text = text.replace(/```\n?/g, '');

        var lines = text.split('\n');
        var html = '';
        var inList = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();

            if (line === '') {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
            }

            // Заголовок ## или **текст**
            if (line.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<h3>' + line.substring(3) + '</h3>';
                continue;
            }

            // Список
            if (line.startsWith('- ') || line.startsWith('• ')) {
                if (!inList) { html += '<ul>'; inList = true; }
                var item = line.replace(/^[-•]\s/, '');
                item = item.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html += '<li>' + item + '</li>';
                continue;
            }

            // Обычный текст
            if (inList) { html += '</ul>'; inList = false; }
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html += '<p>' + line + '</p>';
        }

        if (inList) html += '</ul>';
        return html;
    }

    // Обработка Enter
    searchInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            analyzeBtn.click();
        }
    });
});
