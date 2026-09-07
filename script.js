// ============================================
// JavaScript для приложения "Team Project AI"
// ============================================

document.addEventListener('DOMContentLoaded', function() {

    // --- Theme switch (left = light, right = dark) ---
    var themeToggle = document.getElementById('themeToggle');
    var rootEl = document.documentElement;

    function applyTheme(theme) {
        rootEl.setAttribute('data-theme', theme);
        if (themeToggle) {
            themeToggle.setAttribute('aria-checked', theme === 'dark' ? 'true' : 'false');
        }
        try { localStorage.setItem('tpai-theme', theme); } catch (e) {}
    }

    (function initTheme() {
        var saved = null;
        try { saved = localStorage.getItem('tpai-theme'); } catch (e) {}
        if (saved === 'light' || saved === 'dark') {
            applyTheme(saved);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            applyTheme('dark');
        } else {
            applyTheme('light');
        }
    })();

    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            var current = rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // --- Grid parallax: slight cursor-follow for a subtle volumetric feel ---
    (function gridParallax() {
        var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
        if (reduceMotion || !finePointer) return;
        var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
        var RANGE = 14;
        function tick() {
            cx += (tx - cx) * 0.08;
            cy += (ty - cy) * 0.08;
            rootEl.style.setProperty('--gx', cx.toFixed(2) + 'px');
            rootEl.style.setProperty('--gy', cy.toFixed(2) + 'px');
            if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
                raf = requestAnimationFrame(tick);
            } else {
                raf = null;
            }
        }
        function kick() {
            if (raf === null) raf = requestAnimationFrame(tick);
        }
        window.addEventListener('mousemove', function(e) {
            var nx = (e.clientX / window.innerWidth - 0.5) * 2;
            var ny = (e.clientY / window.innerHeight - 0.5) * 2;
            tx = nx * RANGE;
            ty = ny * RANGE;
            kick();
        }, { passive: true });
    })();

    // --- Range slider fill (accent) ---
    function syncRangeFill(el) {
        if (!el || el.type !== 'range') return;
        var min = parseFloat(el.min || '0');
        var max = parseFloat(el.max || '100');
        var val = parseFloat(el.value || '0');
        var pct = max > min ? ((val - min) / (max - min)) * 100 : 50;
        el.style.setProperty('--range-fill', pct + '%');
    }
    document.querySelectorAll('input[type="range"]').forEach(function(el) {
        syncRangeFill(el);
        el.addEventListener('input', function() { syncRangeFill(el); });
    });

    // --- Навигация по страницам (топбар) ---
    var sidebarLinks = document.querySelectorAll('.topbar-link, .topbar-brand');
    var pages = document.querySelectorAll('.page');
    var navLinks = document.querySelectorAll('.topbar-link');

    sidebarLinks.forEach(function(link) {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            var targetPage = this.getAttribute('data-page');
            if (!targetPage) return;

            navLinks.forEach(function(l) { l.classList.remove('active'); });
            var activeLink = document.querySelector('.topbar-link[data-page="' + targetPage + '"]');
            if (activeLink) activeLink.classList.add('active');

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
    var filterPrompt = '';

    // --- Загрузка всех данных ---
    fetch('config.json')
        .then(function(r) { return r.json(); })
        .then(function(d) { config = d; })
        .catch(function(e) { console.error('config.json:', e); });

    fetch('triggers.json')
        .then(function(r) { return r.json(); })
        .then(function(d) { triggers = d; })
        .catch(function(e) { console.error('triggers.json:', e); });

    fetch('prompts/system.md')
        .then(function(r) { return r.text(); })
        .then(function(d) { systemPrompt = d; })
        .catch(function(e) { console.error('prompts/system.md:', e); });

    fetch('prompts/filter.md')
        .then(function(r) { return r.text(); })
        .then(function(d) { filterPrompt = d; })
        .catch(function(e) { console.error('prompts/filter.md:', e); });

    fetch('projects.json')
        .then(function(r) {
            if (!r.ok) throw new Error('projects.json HTTP ' + r.status);
            return r.json();
        })
        .then(function(d) {
            projects = Array.isArray(d) ? d : [];
            renderCards(projects);
        })
        .catch(function(e) {
            console.error('projects.json:', e);
            // fetch() is blocked on file:// — fall back to embedded data
            if (typeof window !== 'undefined' && Array.isArray(window.__PROJECTS_FALLBACK__) && window.__PROJECTS_FALLBACK__.length) {
                projects = window.__PROJECTS_FALLBACK__;
                renderCards(projects);
                return;
            }
            var grid = document.getElementById('cardsGrid');
            if (grid) grid.innerHTML = '<div class="archive-error">Не удалось загрузить архив проектов. Проверьте файл projects.json и откройте страницу через локальный сервер.</div>';
        });

    function escapeHTML(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- Отрисовка карточек ---
    function renderCards(list) {
        var grid = document.getElementById('cardsGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!list || list.length === 0) {
            grid.innerHTML = '<div class="archive-empty">Проекты не найдены.</div>';
            return;
        }
        list.forEach(function(p, i) {
            var colorIndex = i % 6;
            var card = document.createElement('div');
            card.className = 'card';
            var features = Array.isArray(p.features) ? p.features.slice(0, 3).join(', ') : '';
            card.innerHTML =
                '<div class="card-header card-header-' + colorIndex + '">' +
                    '<span class="card-icon">📋</span>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div class="card-title">' + escapeHTML(p.title) + '</div>' +
                    '<div class="card-meta">' +
                        '<div class="card-meta-row">' +
                            '<span class="card-meta-label">Амбиция:</span> ' +
                            '<span class="card-meta-value">' + escapeHTML(truncate(p.ambition, 80)) + '</span>' +
                        '</div>' +
                        '<div class="card-meta-row">' +
                            '<span class="card-meta-label">Функции:</span> ' +
                            '<span class="card-meta-value">' + escapeHTML(features) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="card-footer">' +
                    '<span class="card-year">' + escapeHTML(p.year) + '</span>' +
                    '<span class="card-team">Команда ' + escapeHTML(p.team) + '</span>' +
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
                content: filterPrompt
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
        var details = '';
        if (topItems.length > 0) {
            details = topItems.map(function(item, i) {
                return (i + 1) + '. ' + item.project.title + ' (релевантность: ' + item.similarity + '%)\n' +
                    '   Амбиция: ' + item.project.ambition + '\n' +
                    '   Результат: ' + item.project.result + '\n' +
                    '   Функции: ' + item.project.features.join(', ') + '\n' +
                    '   Год: ' + item.project.year;
            }).join('\n\n');
        } else {
            details = 'нет';
        }

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

    // --- Fallback когда LLM недоступен ---
    function showNoMatches(userIdea) {
        var text = '**Не удалось проанализировать**\n\n' +
            'Сервис временно недоступен. Попробуйте позже или переформулируйте идею.';
        return text;
    }

    // --- Анимация результатов: короткий fade + rise, страница растёт сама ---
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

        // Короткая каскадная анимация появления
        var nodes = [];
        contentDiv.childNodes.forEach(function(node) {
            if (node.nodeType === 1) nodes.push(node);
        });

        resultsBox.appendChild(contentDiv);

        nodes.forEach(function(node, i) {
            node.style.opacity = '0';
            node.style.transform = 'translateY(12px)';
            node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

            setTimeout(function() {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        node.style.opacity = '1';
                        node.style.transform = 'translateY(0)';
                    });
                });
            }, Math.min(i, 8) * 60);
        });
    }

    // --- Анализ идеи (двухшаговый): textbox плавно поднимается, анализ — просто на странице ---
    function analyzeIdea(userIdea) {
        var ideaCenter = document.querySelector('.idea-center');
        // Плавный короткий подъём (CSS transition 0.35s), без телепорта вниз
        if (ideaCenter) ideaCenter.classList.add('has-results');

        resultsBox.innerHTML = '<div class="loading">Ищу похожие проекты...</div>';
        resultsBox.classList.add('visible');

        selectTopProjects(userIdea)
            .then(function(topItems) {
                if (topItems.length === 0) {
                    resultsBox.innerHTML = '<div class="loading">Похожих проектов в архиве нет. Анализирую идею...</div>';
                    return analyzeFull(userIdea, []);
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
                showResults(llmResponse);
            })
            .catch(function(error) {
                console.log('LLM недоступен:', error);
                resultsBox.innerHTML = '';
                showResults(showNoMatches(userIdea));
            });
    }

    // --- Обработчики ---
    var ideaHint = document.getElementById('ideaHint');

    function showHint(msg) {
        if (!ideaHint) return;
        ideaHint.textContent = msg;
        ideaHint.classList.add('visible');
    }

    function hideHint() {
        if (!ideaHint) return;
        ideaHint.classList.remove('visible');
    }

    searchInput.addEventListener('input', hideHint);

    analyzeBtn.addEventListener('click', function() {
        var userIdea = searchInput.value.trim();
        if (userIdea === '') {
            showHint('Пожалуйста, напишите свою идею!');
            searchInput.focus();
            return;
        }
        hideHint();
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
