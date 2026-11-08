/* ============================================================
   Felipe Farías A. — Developer Desk
   Zonas interactivas sobre la ilustración + ventanas retro.
   ============================================================ */
(function () {
    'use strict';

    var languageButton = document.getElementById('langToggle');
    var revealButton = document.getElementById('revealToggle');
    var windowLayer = document.getElementById('windowLayer');
    var portfolioWindow = document.getElementById('portfolioWindow');
    var windowTitle = document.getElementById('windowTitle');
    var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
    var launchers = Array.prototype.slice.call(document.querySelectorAll('[data-window]'));
    var spots = Array.prototype.slice.call(document.querySelectorAll('.spot'));

    var language = 'es';
    var lastFocused = null;

    /* ---------------- idioma ---------------- */
    function updateLanguage() {
        document.documentElement.lang = language;

        /* Sólo se reemplaza el texto de nodos hoja marcados, de modo que
           los enlaces anidados nunca se destruyen. */
        document.querySelectorAll('[data-es][data-en]').forEach(function (el) {
            var value = el.getAttribute('data-' + language);
            if (value !== null) el.textContent = value;
        });

        /* etiquetas accesibles de cada objeto del escritorio */
        spots.forEach(function (spot) {
            var hint = spot.getAttribute('data-hint-' + language);
            if (hint) spot.setAttribute('aria-label', hint);
        });

        /* etiquetas accesibles de los botones de la ventana */
        document.querySelectorAll('[data-label-es][data-label-en]').forEach(function (el) {
            el.setAttribute('aria-label', el.getAttribute('data-label-' + language));
        });

        languageButton.textContent = language === 'es' ? 'EN' : 'ES';
        languageButton.setAttribute('aria-label', language === 'es' ? 'Switch to English' : 'Cambiar a español');
        languageButton.setAttribute('aria-pressed', String(language === 'en'));

        var active = document.querySelector('.panel.is-active');
        if (active) {
            windowTitle.textContent = active.getAttribute('data-title-' + language);
        }
    }

    /* ---------------- ventanas ---------------- */
    function focusableInWindow() {
        return Array.prototype.slice
            .call(portfolioWindow.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter(function (el) { return el.offsetParent !== null; });
    }

    function openWindow(id, opener) {
        var panel = document.getElementById(id);
        if (!panel) return;

        lastFocused = opener || document.activeElement;

        panels.forEach(function (item) {
            item.classList.toggle('is-active', item === panel);
        });

        windowTitle.textContent = panel.getAttribute('data-title-' + language);
        windowLayer.hidden = false;
        document.body.classList.add('window-open');
        document.body.style.overflow = 'hidden';
        portfolioWindow.querySelector('.window-content').scrollTop = 0;

        var closeBtn = portfolioWindow.querySelector('.close-window');
        if (closeBtn) closeBtn.focus();
    }

    function closeWindow() {
        if (windowLayer.hidden) return;
        clearCopyNote();
        windowLayer.hidden = true;
        document.body.classList.remove('window-open');
        document.body.style.overflow = '';
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    function trapFocus(event) {
        if (event.key !== 'Tab' || windowLayer.hidden) return;
        var items = focusableInWindow();
        if (!items.length) return;

        var first = items[0];
        var last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    /* ---------------- copiar el correo ----------------
       El correo no abre ninguna aplicación: se copia al portapapeles y se
       avisa con un mensaje breve, para no sacar al visitante de la página.
       La API de portapapeles exige contexto seguro (https), así que al fallar
       se recurre a execCommand, que sí funciona abriendo el archivo en local. */
    var copyNote = document.getElementById('copyNote');
    var copyNoteTimer = null;
    var COPY_MESSAGES = {
        ok: { es: 'Copiado al portapapeles', en: 'Copied to clipboard' },
        fail: { es: 'Copia manualmente: ', en: 'Copy manually: ' }
    };

    function clearCopyNote() {
        if (!copyNote) return;
        window.clearTimeout(copyNoteTimer);
        copyNote.textContent = '';
    }

    function showCopyNote(kind, suffix) {
        if (!copyNote) return;
        window.clearTimeout(copyNoteTimer);
        copyNote.textContent = COPY_MESSAGES[kind][language] + (suffix || '');
        copyNoteTimer = window.setTimeout(clearCopyNote, 2600);
    }

    function legacyCopy(text) {
        var field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.top = '-1000px';
        document.body.appendChild(field);
        field.select();
        var copied = false;
        try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
        document.body.removeChild(field);
        return copied;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return Promise.reject(new Error('clipboard unavailable'));
    }

    document.querySelectorAll('[data-copy]').forEach(function (button) {
        button.addEventListener('click', function () {
            var value = button.getAttribute('data-copy');
            copyToClipboard(value).then(function () {
                showCopyNote('ok');
            }, function () {
                if (legacyCopy(value)) showCopyNote('ok');
                else showCopyNote('fail', value);
            });
        });
    });

    /* ---------------- eventos ---------------- */
    launchers.forEach(function (launcher) {
        launcher.addEventListener('click', function () {
            openWindow(launcher.getAttribute('data-window'), launcher);
        });
    });

    document.querySelectorAll('[data-close-window]').forEach(function (button) {
        button.addEventListener('click', closeWindow);
    });

    /* maximizar: la ventana pasa a ocupar toda la pantalla y vuelve */
    var maximizeButton = portfolioWindow.querySelector('[data-maximize-window]');
    if (maximizeButton) {
        maximizeButton.addEventListener('click', function () {
            var on = portfolioWindow.classList.toggle('is-maximized');
            maximizeButton.setAttribute('aria-pressed', String(on));
        });
    }

    languageButton.addEventListener('click', function () {
        language = language === 'es' ? 'en' : 'es';
        clearCopyNote();
        updateLanguage();
    });

    revealButton.addEventListener('click', function () {
        var on = document.body.classList.toggle('reveal');
        revealButton.setAttribute('aria-pressed', String(on));
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeWindow();
        trapFocus(event);
    });

    /* Pulso inicial: enseña qué objetos responden sin requerir acción. */
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
        document.body.classList.add('first-pulse');
        window.setTimeout(function () {
            document.body.classList.remove('first-pulse');
        }, 2600);
    }

    /* ---------------- pantalla CRT viva ----------------
       Rellena los dos bloques apilados de la pantalla con líneas de
       código "de verdad". Ambos reciben el mismo texto para que el
       scroll vertical (translateY -50%) se reinicie sin salto. */
    (function fillScreenCode() {
        var blocks = document.querySelectorAll('.screen-fx-code');
        if (!blocks.length) return;
        var lines = [
            '// portfolio.build()',
            'import { Felipe } from "./dev";',
            '',
            'const stack = [',
            '  "QA Automation",',
            '  "Innovation",',
            '  "Teaching",',
            '];',
            '',
            'function render(project) {',
            '  const ui = new Pixel(project);',
            '  ui.draw();',
            '  return ui.mount("#crt");',
            '}',
            '',
            'async function main() {',
            '  const list = await load();',
            '  for (const p of list) {',
            '    render(p);',
            '  }',
            '}',
            '',
            'main().then(() => {',
            '  console.log("ready ✓");',
            '});',
            ''
        ];
        var text = lines.join('\n');
        blocks.forEach(function (b) { b.textContent = text; });
    }());

    updateLanguage();
}());
