'use strict';

const URL_RECETAS = 'http://localhost:3001/recetas/';

/* ---------- DATOS ---------- */

async function cargarRecetas() {
    const respuesta = await fetch(URL_RECETAS);

    if (!respuesta.ok) {
        throw new Error('El servidor respondió ' + respuesta.status);
    }

    return await respuesta.json();
}

/* ---------- UTILIDADES ---------- */

// Convierte caracteres especiales para que un texto nunca se interprete como HTML
function escaparHtml(texto) {
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

// Reparto de calorías entre macros: proteína y carbohidratos 4 kcal/g, grasas 9 kcal/g
function porcentajesMacros(receta) {
    const kcalP = receta.proteina * 4;
    const kcalC = receta.carbohidratos * 4;
    const kcalG = receta.grasas * 9;
    const total = kcalP + kcalC + kcalG;

    if (total === 0) {
        return { p: 0, c: 0, g: 0 };
    }

    return {
        p: Math.round(kcalP / total * 100),
        c: Math.round(kcalC / total * 100),
        g: Math.round(kcalG / total * 100)
    };
}

/* ---------- PINTAR ---------- */

function pintarRecetas(recetas) {
    const lista = document.querySelector('#listaRecetas');
    lista.innerHTML = '';

    if (recetas.length === 0) {
        lista.innerHTML = '<p class="text-body-secondary">Aún no hay recetas. ¡Añade la primera!</p>';
        return;
    }

    for (const receta of recetas) {
        const pct = porcentajesMacros(receta);

        const col = document.createElement('div');
        col.className = 'col';

        col.innerHTML = `
      <article class="card h-100 border-0 shadow-sm receta" data-id="${receta.id}">
        <div class="receta-img ratio ratio-4x3 rounded-top">
          <div class="d-flex align-items-center justify-content-center">
            <i class="bi bi-egg-fried fs-1"></i>
          </div>
        </div>

        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge text-bg-light border">${escaparHtml(receta.categoria)}</span>
            <small class="text-body-secondary"><i class="bi bi-clock"></i> ${receta.tiempo} min</small>
          </div>

          <h3 class="h5">${escaparHtml(receta.nombre)}</h3>
          <p class="mb-3"><strong class="fs-4">${receta.kcal}</strong> kcal</p>

          <div class="progress-stacked mb-2" aria-label="Reparto de macros">
            <div class="progress" role="progressbar" style="width: ${pct.p}%"><div class="progress-bar macro-p"></div></div>
            <div class="progress" role="progressbar" style="width: ${pct.c}%"><div class="progress-bar macro-c"></div></div>
            <div class="progress" role="progressbar" style="width: ${pct.g}%"><div class="progress-bar macro-g"></div></div>
          </div>

          <div class="d-flex justify-content-between small">
            <span><i class="punto macro-p"></i> P ${receta.proteina} g</span>
            <span><i class="punto macro-c"></i> C ${receta.carbohidratos} g</span>
            <span><i class="punto macro-g"></i> G ${receta.grasas} g</span>
          </div>
        </div>
      </article>`;

        lista.appendChild(col);
    }
}

/* ---------- ARRANQUE ---------- */

async function iniciar() {
    try {
        const recetas = await cargarRecetas();
        pintarRecetas(recetas);
    } catch (error) {
        console.error('No se pudieron cargar las recetas:', error);

        document.querySelector('#listaRecetas').innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning mb-0">
          No se pudieron cargar las recetas. ¿Está arrancado json-server?<br>
          <code>npx json-server json/recetas.json --port 3001</code>
        </div>
      </div>`;
    }
}

window.addEventListener('DOMContentLoaded', iniciar);
