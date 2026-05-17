// Typing Effect
const typingTexts = {
    es: [
        'Automatizando el caos desde 2012...',
        'Service Lead QA Automation @ Haka Lab',
        'Creador de Judo Framework',
        'Instructor | Escritor | Psicologo',
        'La pina NO va en la pizza'
    ],
    en: [
        'Automating chaos since 2012...',
        'Service Lead QA Automation @ Haka Lab',
        'Creator of Judo Framework',
        'Instructor | Writer | Psychologist',
        'Pineapple does NOT go on pizza'
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