/* =====================================================================
   FIT BITES · interfaz.js
   Lo que no es de ninguna sección en concreto: el tema claro/oscuro
   y la barra de pestañas del móvil.
   ===================================================================== */

import { CLAVE_TEMA } from './config.js';                  // el nombre con el que se guarda el tema

/* ---------- TEMA CLARO / OSCURO ---------- */

// Aplica el tema ('light' o 'dark'): cambia el atributo de <html>, el icono del botón y lo guarda
function aplicarTema(tema) {
    document.documentElement.setAttribute('data-bs-theme', tema); // Bootstrap y nuestro CSS leen este atributo

    const oscuro = tema === 'dark';                        // ¿es el tema oscuro?
    document.querySelector('#btnTema i').className = oscuro ? 'bi bi-sun' : 'bi bi-moon'; // icono: un sol para volver al claro, una luna para ir al oscuro
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
}

/* ---------- BARRA DE PESTAÑAS DEL MÓVIL ---------- */

// Marca como "activa" la pestaña indicada (y le pone aria-current para los lectores de pantalla)
export function marcarPestana(id) {
    document.querySelectorAll('.barra-inferior .tab').forEach(tab => {
        const activa = tab.id === id;                      // ¿es la que nos piden?
        tab.classList.toggle('activa', activa);
        if (activa) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
}

// Pone a escuchar la barra de abajo. Recibe qué hacer con "Semana", "Día" y "+": así este archivo no necesita saber cómo funciona el diario
export function iniciarPestanas({ verDia, verSemana, anadir }) {
    const subirAlDiario = () => document.querySelector('#diario').scrollIntoView({ behavior: 'smooth' }); // sube con suavidad hasta el diario

    document.querySelector('#tabDiario').addEventListener('click', () => { verDia(); marcarPestana('tabDiario'); });
    document.querySelector('#tabSemana').addEventListener('click', () => { verSemana(); subirAlDiario(); marcarPestana('tabSemana'); });
    document.querySelector('#tabAnadir').addEventListener('click', () => anadir());
    document.querySelector('#tabRecetas').addEventListener('click', () => marcarPestana('tabRecetas'));
}
