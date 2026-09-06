// ============================================
// JavaScript для приложения "Проектник"
// ============================================

document.addEventListener('DOMContentLoaded', function() {

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
        list.forEach(function(p) {
            var card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = '<div class="card-inner">' +
                '<span class="card-title">' + p.title + '</span>' +
                '<span class="card-year">' + p.year + '</span>' +
                '</div>';
            grid.appendChild(card);
        });
    }

    // --- Проверка: похоже ли на проектную идею ---
    function isProjectIdea(text) {
        var lower = text.toLowerCase();
        var minLen = triggers.minLength || 5;
        if (lower.length < minLen) return false;

        var allTriggers = [].concat(triggers.greetings || [], triggers.questions || []);
        for (var i = 0; i < allTriggers.length; i++) {
            if (lower === allTriggers[i] || lower.indexOf(allTriggers[i]) === 0) return false;
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

    // --- Вызов LLM ---
    function callLLM(messages) {
        return fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.apiKey
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                max_tokens: config.maxTokens
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            }
            throw new Error('Нет ответа от LLM');
        });
    }

    // --- Шаг 1: LLM выбирает топ-3 проекта по названиям ---
    function selectTopProjects(userIdea) {
        var titlesList = projects.map(function(p, i) {
            return (i + 1) + '. ' + p.title;
        }).join('\n');

        var messages = [
            {
                role: 'system',
                content: 'Ты помощник, который анализирует проектные идеи. ' +
                    'Тебе передаётся идея пользователя и список названий проектов из архива. ' +
                    'Выбери 3 самых релевантных проекта по смыслу. ' +
                    'Ответь ТОЛЬКО номерами через запятую, например: 1,3,5'
            },
            {
                role: 'user',
                content: 'Идея: ' + userIdea + '\n\nПроекты:\n' + titlesList
            }
        ];

        return callLLM(messages).then(function(response) {
            var nums = response.match(/\d+/g);
            if (!nums) return [];
            return nums.map(function(n) { return parseInt(n) - 1; })
                .filter(function(i) { return i >= 0 && i < projects.length; })
                .slice(0, 3);
        });
    }

    // --- Шаг 2: LLM анализирует подробно топ-3 проекта ---
    function analyzeFull(userIdea, topProjects) {
        var details = topProjects.map(function(p, i) {
            return (i + 1) + '. ' + p.title + '\n' +
                '   Амбиция: ' + p.ambition + '\n' +
                '   Результат: ' + p.result + '\n' +
                '   Функции: ' + p.features.join(', ') + '\n' +
                '   Год: ' + p.year;
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

    // --- Fallback без LLM ---
    function formatWithoutLLM(userIdea, topProjects) {
        var result = '**Похожие проекты**\n\n';
        topProjects.forEach(function(p) {
            result += '• ' + p.title + ' — ' + p.ambition + '\n\n';
        });

        result += '**Что уже реализовано**\n\n';
        var allFeatures = [];
        topProjects.forEach(function(p) {
            p.features.forEach(function(f) {
                if (allFeatures.indexOf(f) === -1) allFeatures.push(f);
            });
        });
        allFeatures.forEach(function(f) { result += '• ' + f + '\n'; });

        result += '\n**Рекомендации**\n\n';
        result += '• Изучите найденные проекты, чтобы избежать дублирования\n';
        result += '• Определите, чем ваша идея отличается от существующих\n';
        return result;
    }

    // --- Анимация результатов ---
    function showResults(text) {
        var html = convertToHTML(text);
        var temp = document.createElement('div');
        temp.innerHTML = html;
        var nodes = [];
        temp.childNodes.forEach(function(node) {
            if (node.nodeType === 1) nodes.push(node.outerHTML);
        });

        var contentDiv = document.createElement('div');
        contentDiv.className = 'results-content';
        resultsBox.appendChild(contentDiv);

        nodes.forEach(function(html, i) {
            setTimeout(function() {
                var el = document.createElement('div');
                el.innerHTML = html;
                el.style.opacity = '0';
                el.style.transform = 'translateY(20px) translateX(15px)';
                el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
                contentDiv.appendChild(el);
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        el.style.opacity = '1';
                        el.style.transform = 'translateY(0) translateX(0)';
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
                .then(function(indices) {
                    var topProjects = indices.map(function(i) { return projects[i]; });
                    if (topProjects.length === 0) throw new Error('Нет релевантных проектов');

                    resultsBox.innerHTML = '<div class="loading">Анализирую ' + topProjects.length + ' проектов...</div>';

                    return analyzeFull(userIdea, topProjects);
                })
                .then(function(llmResponse) {
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    showResults(llmResponse);
                })
                .catch(function(error) {
                    console.log('LLM недоступен:', error);
                    resultsBox.innerHTML = '';
                    resultsBox.style.maxHeight = '3000px';
                    var fallback = formatWithoutLLM(userIdea, projects.slice(0, 3));
                    showResults(fallback);
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
