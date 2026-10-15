/* =====================================================================
   FIT BITES · interfaz.js
   Lo que no es de ninguna sección en concreto: el tema claro/oscuro,
   el menú de móvil y las animaciones al hacer scroll.
   ===================================================================== */

import { CLAVE_TEMA } from './config.js';                  // el nombre con el que se guarda el tema

let observador = null;                                     // el "vigilante" que avisa cuando algo entra en pantalla (para las animaciones al hacer scroll)

/* ---------- ANIMACIONES AL HACER SCROLL ---------- */

// Vigila los elementos con la clase "reveal": cuando entran en pantalla les pone "visible" y el CSS los anima
export function observarReveal() {
    const pendientes = document.querySelectorAll('.reveal:not(.visible):not([data-vigilado])'); // los "reveal" que aún no se han mostrado ni se están vigilando

    if (!('IntersectionObserver' in window)) {             // si el navegador es muy antiguo y no tiene vigilante...
        pendientes.forEach(el => el.classList.add('visible')); // ...los mostramos todos sin animar
        return;
    }

    if (!observador) {                                     // la primera vez, creamos el vigilante
        observador = new IntersectionObserver((entradas) => { // se ejecuta cada vez que algo entra o sale de la pantalla
            for (const entrada of entradas) {              // por cada elemento que ha cambiado...
                if (entrada.isIntersecting) {              // ...si ahora está dentro de la pantalla...
                    entrada.target.classList.add('visible'); // ...le ponemos "visible" (el CSS hace la animación)...
                    observador.unobserve(entrada.target);  // ...y dejamos de vigilarlo (solo se anima una vez)
                }
            }
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }); // se considera "dentro" cuando se ve un 12 % y ha subido 40px desde el borde de abajo
    }

    pendientes.forEach(el => {                             // por cada elemento pendiente...
        el.dataset.vigilado = '1';                         // ...lo marcamos para no vigilarlo dos veces...
        observador.observe(el);                            // ...y lo ponemos bajo vigilancia
    });
}

/* ---------- TEMA CLARO / OSCURO ---------- */

// Aplica el tema ('light' o 'dark'): cambia el atributo de <html>, el icono del botón y lo guarda
function aplicarTema(tema) {
    document.documentElement.setAttribute('data-bs-theme', tema); // Bootstrap y nuestro CSS leen este atributo

    const oscuro = tema === 'dark';                        // ¿es el tema oscuro?
    document.querySelector('#btnTema i').className = oscuro ? 'bi bi-sun' : 'bi bi-moon-stars'; // icono: un sol para volver al claro, una luna para ir al oscuro
    document.querySelector('#btnTema').setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'); // y el texto para lectores de pantalla

    try { localStorage.setItem(CLAVE_TEMA, tema); } catch { } // lo guardamos para la próxima visita (si no se puede, no pasa nada)
}

/* ---------- ARRANQUE ---------- */

export function iniciarInterfaz() {
    // ---- Tema claro / oscuro ----
    aplicarTema(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'); // pone bien el icono según el tema con el que cargó la página
    document.querySelector('#btnTema').addEventListener('click', () => { // al pulsar el botón...
        const actual = document.documentElement.getAttribute('data-bs-theme'); // ...mira el tema actual...
        aplicarTema(actual === 'dark' ? 'light' : 'dark'); // ...y cambia al otro
    });

    // ---- Menú hamburguesa: se cierra solo al elegir un enlace ----
    const menu = document.querySelector('#menu');          // el menú desplegable
    menu.querySelectorAll('.nav-link').forEach(enlace => { // por cada enlace del menú...
        enlace.addEventListener('click', () => {           // ...al hacer clic...
            if (menu.classList.contains('show')) {         // ...si el menú está abierto (solo pasa en móvil)...
                bootstrap.Collapse.getOrCreateInstance(menu).hide(); // ...lo cerramos
            }
        });
    });
}
