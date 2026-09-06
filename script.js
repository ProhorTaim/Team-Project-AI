// ============================================
// JavaScript для приложения "Team Project AI"
// ============================================

document.addEventListener('DOMContentLoaded', function() {

    // --- Навигация по страницам ---
    var sidebarLinks = document.querySelectorAll('.sidebar-link');
    var pages = document.querySelectorAll('.page');

    sidebarLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            var targetPage = this.getAttribute('data-page');

            sidebarLinks.forEach(function(l) { l.classList.remove('active'); });
            this.classList.add('active');

            pages.forEach(function(p) { p.classList.remove('page-active'); });
            document.getElementById('page' + capitalize(targetPage)).classList.add('page-active');
        });
    });

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    var searchInput = document.getElementById('searchInput');
    var analyzeBtn = document.getElementById('analyzeBtn');
    var resultsBox = document.getElementById('resultsBox');

    var projects = [];
    var config = {};
    var triggers = {};
    var systemPrompt = '';

    // --- Загрузка всех данных ---
    fetch('config.json')
        .then(function(r) { return r.json(); })
        .then(function(d) { config = d; })
        .catch(function(e) { console.error('config.json:', e); });

    fetch('triggers.json')
        .then(function(r) { return r.json(); })
        .then(function(d) { triggers = d; })
        .catch(function(e) { console.error('triggers.json:', e); });

    fetch('prompt.md')
        .then(function(r) { return r.text(); })
        .then(function(d) { systemPrompt = d; })
        .catch(function(e) { console.error('prompt.md:', e); });

    fetch('projects.json')
        .then(function(r) { return r.json(); })
        .then(function(d) {
            projects = d;
            renderCards(projects);
        })
        .catch(function(e) { console.error('projects.json:', e); });

    // --- Отрисовка карточек ---
    function renderCards(list) {
        var grid = document.getElementById('cardsGrid');
        grid.innerHTML = '';
        list.forEach(function(p, i) {
            var colorIndex = i % 6;
            var card = document.createElement('div');
            card.className = 'card';
            card.innerHTML =
                '<div class="card-header card-header-' + colorIndex + '">' +
                    '<span class="card-icon">📋</span>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div class="card-title">' + p.title + '</div>' +
                    '<div class="card-meta">' +
                        '<div class="card-meta-row">' +
                            '<span class="card-meta-label">Амбиция:</span> ' +
                            '<span class="card-meta-value">' + truncate(p.ambition, 80) + '</span>' +
                        '</div>' +
                        '<div class="card-meta-row">' +
                            '<span class="card-meta-label">Функции:</span> ' +
                            '<span class="card-meta-value">' + p.features.slice(0, 3).join(', ') + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="card-footer">' +
                    '<span class="card-year">' + p.year + '</span>' +
                    '<span class="card-team">Команда ' + p.team + '</span>' +
                '</div>';
            grid.appendChild(card);
        });
    }

    function truncate(text, max) {
        if (!text) return '';
        return text.length > max ? text.substring(0, max) + '…' : text;
    }

    // --- Проверка: похоже ли на проектную идею ---
    function isProjectIdea(text) {
        var lower = text.toLowerCase().trim();
        var minLen = triggers.minLength || 5;

        // Слишком короткий
        if (lower.length < minLen) return false;

        // Приветствия и вопросы
        var allTriggers = [].concat(triggers.greetings || [], triggers.questions || []);
        for (var i = 0; i < allTriggers.length; i++) {
            if (lower === allTriggers[i] || lower.indexOf(allTriggers[i]) === 0) return false;
        }

        // Бессмысленные слова
        var nonsense = triggers.nonsense || [];
        var words = lower.split(/\s+/);
        for (var j = 0; j < words.length; j++) {
            if (nonsense.indexOf(words[j]) !== -1) return false;
        }

        // Если одно слово без ключевых слов проекта — пропускаем
        var projectKeywords = triggers.projectKeywords || [];
        if (words.length === 1) {
            var hasKeyword = false;
            for (var k = 0; k < projectKeywords.length; k++) {
                if (words[0].indexOf(projectKeywords[k]) !== -1) {
                    hasKeyword = true;
                    break;
                }
            }
            if (!hasKeyword) return false;
        }

        return true;
    }

    // --- Конвертер markdown → HTML ---
    function convertToHTML(text) {
        text = text.replace(/```html\n?/g, '').replace(/```\n?/g, '');
        var lines = text.split('\n');
        var html = '';
        var inList = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line === '') {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
            }
            if (line.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<h3>' + line.substring(3) + '</h3>';
                continue;
            }
            if (line.startsWith('- ') || line.startsWith('• ')) {
                if (!inList) { html += '<ul>'; inList = true; }
                var item = line.replace(/^[-•]\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html += '<li>' + item + '</li>';
                continue;
            }
            if (inList) { html += '</ul>'; inList = false; }
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html += '<p>' + line + '</p>';
        }
        if (inList) html += '</ul>';
        return html;
    }

    // --- Вызов LLM через серверный прокси ---
    function callLLM(messages) {
        return fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                model: config.model,
                max_tokens: config.maxTokens
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.content) {
                return data.content;
            }
            if (data.error) {
                throw new Error(data.error);
            }
            throw new Error('Нет ответа от LLM');
        });
    }

    // --- Шаг 1: LLM выбирает релевантные проекты с процентом ---
    function selectTopProjects(userIdea) {
        var titlesList = projects.map(function(p, i) {
            return (i + 1) + '. ' + p.title;
        }).join('\n');

        var messages = [
            {
                role: 'system',
                content: 'Ты — аналитик проектов. Тебе передаётся идея студента и список названий проектов.\n\n' +
                    'Твоя задача:\n' +
                    '1. Оцени каждый проект по шкале 0-100% релевантности идее студента.\n' +
                    '2. Верни ТОЛЬКО проекты с релевантностью >= 50%.\n' +
                    '3. Если таких нет — верни "нет".\n\n' +
                    'Формат ответа (строго):\n' +
                    '1:85\n' +
                    '3:62\n' +
                    'Или просто: нет\n\n' +
                    'НЕ пиши ничего кроме процентов. Никакого текста.'
            },
            {
                role: 'user',
                content: 'Идея: ' + userIdea + '\n\nПроекты:\n' + titlesList
            }
        ];

        return callLLM(messages).then(function(response) {
            var minSim = config.minSimilarity || 50;
            var lines = response.trim().split('\n');
            var results = [];

            lines.forEach(function(line) {
                var match = line.match(/(\d+)\s*:\s*(\d+)/);
                if (match) {
                    var idx = parseInt(match[1]) - 1;
                    var similarity = parseInt(match[2]);
                    if (similarity >= minSim && idx >= 0 && idx < projects.length) {
                        results.push({ project: projects[idx], similarity: similarity });
                    }
                }
            });

            results.sort(function(a, b) { return b.similarity - a.similarity; });
            return results.slice(0, 3);
        });
    }

    // --- Шаг 2: LLM анализирует подробно отобранные проекты ---
    function analyzeFull(userIdea, topItems) {
        var details = topItems.map(function(item, i) {
            return (i + 1) + '. ' + item.project.title + ' (релевантность: ' + item.similarity + '%)\n' +
                '   Амбиция: ' + item.project.ambition + '\n' +
                '   Результат: ' + item.project.result + '\n' +
                '   Функции: ' + item.project.features.join(', ') + '\n' +
                '   Год: ' + item.project.year;
        }).join('\n\n');

        var messages = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: 'Идея пользователя:\n' + userIdea + '\n\n' +
                    'Релевантные проекты из архива:\n' + details
            }
        ];

        return callLLM(messages);
    }

    // --- Шаг 2б: LLM анализирует новую идею без проектов из архива ---
    function analyzeNewIdea(userIdea) {
        var systemForNew = 'Ты — эксперт по проектной деятельности университета.\n\n' +
            'Студент предложил идею, которой нет в архиве проектов.\n' +
            'Оцени её потенциал и дай рекомендации.\n\n' +
            'ПРАВИЛА:\n' +
            '- Если идея звучит бессмысленно или как оскорбление — ответь коротко: «Идея не сформулирована. Попробуйте описать проблему, которую решает ваш проект.»\n' +
            '- Если идея интересная и инновационная — напиши что-то вроде: «Такой проект ещё не реализован. Вот как можно развить идею:»\n' +
            '- Дай 2-3 конкретных шага для развития.\n' +
            '- Предложи возможные функции.\n\n' +
            'ОБЯЗАТЕЛЬНО отвечай ТОЛЬКО чистым HTML без markdown!\n' +
            'Используй теги: <h3>, <ul>, <li>, <p>, <strong>.\n\n' +
            'Структура:\n' +
            '<h3>Оценка идеи</h3>\n' +
            '<p>1-2 предложения.</p>\n\n' +
            '<h3>Рекомендации</h3>\n' +
            '<ul><li>конкретный шаг</li></ul>\n\n' +
            '<h3>Возможные функции</h3>\n' +
            '<ul><li>функция</li></ul>';

        var messages = [
            { role: 'system', content: systemForNew },
            { role: 'user', content: 'Идея: ' + userIdea }
        ];

        return callLLM(messages);
    }

    // --- Fallback когда LLM недоступен ---
    function showNoMatches(userIdea) {
        var text = '**Не удалось проанализировать**\n\n' +
            'Сервис временно недоступен. Попробуйте позже или переформулируйте идею.';
        return text;
    }

    // --- Анимация результатов ---
    function showResults(text) {
        var html = convertToHTML(text);

        var contentDiv = document.createElement('div');
        contentDiv.className = 'results-content';
        contentDiv.innerHTML = html;

        // Удаляем пустые элементы
        contentDiv.querySelectorAll('p, div').forEach(function(el) {
            if (el.textContent.trim() === '' && !el.querySelector('.result-card')) {
                el.remove();
            }
        });

        // Собираем ВСЕ result-card в одну сетку
        var allCards = contentDiv.querySelectorAll('.result-card');
        if (allCards.length > 0) {
            // Создаём сетку
            var grid = document.createElement('div');
            grid.className = 'result-cards-grid';

            // Перемещаем только непустые карточки
            allCards.forEach(function(card) {
                if (card.textContent.trim() !== '') {
                    grid.appendChild(card);
                }
            });

            // Вставляем сетку после h3 "Похожие проекты"
            var h3s = contentDiv.querySelectorAll('h3');
            for (var i = 0; i < h3s.length; i++) {
                if (h3s[i].textContent.indexOf('Похожие') !== -1) {
                    h3s[i].insertAdjacentElement('afterend', grid);
                    break;
                }
            }
        }

        // Разбиваем на элементы для анимации
        var nodes = [];
        contentDiv.childNodes.forEach(function(node) {
            if (node.nodeType === 1) nodes.push(node);
        });

        resultsBox.appendChild(contentDiv);

        nodes.forEach(function(node, i) {
            node.style.opacity = '0';
            node.style.transform = 'translateY(20px) translateX(15px)';
            node.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';

            setTimeout(function() {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        node.style.opacity = '1';
                        node.style.transform = 'translateY(0) translateX(0)';
                    });
                });
            }, i * 120);
        });
    }

    // --- Анализ идеи (двухшаговый) ---
    function analyzeIdea(userIdea) {
        resultsBox.classList.remove('visible');
        resultsBox.style.maxHeight = '0';
        resultsBox.style.opacity = '0';

        setTimeout(function() {
            resultsBox.innerHTML = '<div class="loading">Ищу похожие проекты...</div>';
            resultsBox.classList.add('visible');
            resultsBox.style.maxHeight = '100px';
            resultsBox.style.opacity = '1';

            selectTopProjects(userIdea)
                .then(function(topItems) {
                    if (topItems.length === 0) {
                        resultsBox.innerHTML = '<div class="loading">Таких проектов в архиве нет. Анализирую идею...</div>';
                        return analyzeNewIdea(userIdea);
                    }

                    var summary = topItems.map(function(item) {
                        return item.project.title + ' (' + item.similarity + '%)';
                    }).join(', ');
                    resultsBox.innerHTML = '<div class="loading">Нашёл: ' + summary + '. Анализирую...</div>';

                    return analyzeFull(userIdea, topItems);
                })
                .then(function(llmResponse) {
                    if (!llmResponse) return;
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    showResults(llmResponse);

                    // Поднимаем заголовок с задержкой после появления ответа
                    setTimeout(function() {
                        document.querySelector('.idea-center').classList.add('has-results');
                    }, 400);
                })
                .catch(function(error) {
                    console.log('LLM недоступен:', error);
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    showResults(showNoMatches(userIdea));
                    setTimeout(function() {
                        document.querySelector('.idea-center').classList.add('has-results');
                    }, 400);
                });
        }, 400);
    }

    // --- Обработчики ---
    analyzeBtn.addEventListener('click', function() {
        var userIdea = searchInput.value.trim();
        if (userIdea === '') {
            alert('Пожалуйста, напишите свою идею!');
            return;
        }
        if (!isProjectIdea(userIdea)) {
            resultsBox.classList.add('visible');
            resultsBox.innerHTML = '<div class="results-content"><p>Сформулируйте идею проекта, и я помогу её развить.</p></div>';
            return;
        }
        analyzeIdea(userIdea);
    });

    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') analyzeBtn.click();
    });
});
