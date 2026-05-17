// Typing Effect
const typingTexts = {
    es: [
        'Automatizando el caos desde 2012...',
        'Gerente de Innovación @ Haka Lab',
        'Creador de Judo Framework',
        'Instructor en Centyc | Escritor',
        'Experto en calidad de software'
    ],
    en: [
        'Automating chaos since 2012...',
        'Gerente de Innovación @ Haka Lab',
        'Creator of Judo Framework',
        'Instructor at Centyc | Writer',
        'Software quality expert'
    ]
};

let currentLang = 'es';
let textIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingSpeed = 80;

const typedElement = document.getElementById('heroTyped');

function typeEffect() {
    const texts = typingTexts[currentLang];
    const currentText = texts[textIndex];

    if (isDeleting) {
        typedElement.textContent = currentText.substring(0, charIndex - 1);
        charIndex--;
        typingSpeed = 40;
    } else {
        typedElement.textContent = currentText.substring(0, charIndex + 1);
        charIndex++;
        typingSpeed = 80;
    }

    if (!isDeleting && charIndex === currentText.length) {
        typingSpeed = 2000;
        isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        textIndex = (textIndex + 1) % texts.length;
        typingSpeed = 500;
    }

    setTimeout(typeEffect, typingSpeed);
}

typeEffect();

// Language Toggle
const langToggle = document.getElementById('langToggle');

langToggle.addEventListener('click', function() {
    currentLang = currentLang === 'es' ? 'en' : 'es';
    langToggle.textContent = currentLang === 'es' ? 'EN' : 'ES';

    document.querySelectorAll('[data-es][data-en]').forEach(function(el) {
        el.textContent = el.getAttribute('data-' + currentLang);
    });

    textIndex = 0;
    charIndex = 0;
    isDeleting = false;
});

// Smooth Scroll
document.querySelectorAll('.pixel-nav a').forEach(function(link) {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        var target = document.querySelector(link.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Scroll Reveal
var observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };

var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.timeline-item, .project-card, .skill-category, .publication-item, .cert-badge').forEach(function(el) {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
});

// Active Nav Highlight
var sections = document.querySelectorAll('.section');
var navLinks = document.querySelectorAll('.pixel-nav a');

window.addEventListener('scroll', function() {
    var current = '';
    sections.forEach(function(section) {
        var sectionTop = section.offsetTop - 100;
        if (window.scrollY >= sectionTop) {
            current = section.getAttribute('id');
        }
    });
    navLinks.forEach(function(link) {
        link.style.borderColor = 'transparent';
        if (link.getAttribute('href') === '#' + current) {
            link.style.borderColor = 'var(--border-color)';
        }
    });
});


// Skills Taskbar Windows
document.querySelectorAll('.taskbar-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        var targetId = btn.getAttribute('data-target');

        // Remove active from all buttons
        document.querySelectorAll('.taskbar-btn').forEach(function(b) {
            b.classList.remove('active');
        });
        btn.classList.add('active');

        // Hide all windows, show target
        document.querySelectorAll('.skill-window').forEach(function(win) {
            win.removeAttribute('data-active');
        });
        document.getElementById(targetId).setAttribute('data-active', 'true');
    });
});


// Projects subtitle typing effect
(function() {
    var projectsTyped = document.getElementById('projectsTyped');
    var subtitle = projectsTyped.parentElement;
    var text = subtitle.getAttribute('data-' + currentLang);
    var typed = false;

    function typeText(el, str) {
        var i = 0;
        el.textContent = '';
        function step() {
            if (i < str.length) {
                el.textContent += str.charAt(i);
                i++;
                setTimeout(step, 50);
            }
        }
        step();
    }

    var projObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting && !typed) {
                typed = true;
                typeText(projectsTyped, text);
            }
        });
    }, { threshold: 0.5 });

    projObserver.observe(subtitle);

    // Update on language change
    langToggle.addEventListener('click', function() {
        var newText = subtitle.getAttribute('data-' + currentLang);
        typed = false;
        projectsTyped.textContent = '';
        setTimeout(function() {
            typed = true;
            typeText(projectsTyped, newText);
        }, 300);
    });
})();

// Project Cards Flip Animation
document.querySelectorAll('.project-card').forEach(function(card) {
    card.addEventListener('mouseenter', function() {
        this.classList.add('flipped');
    });
    card.addEventListener('mouseleave', function() {
        this.classList.remove('flipped');
    });
});
