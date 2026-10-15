/* =====================================================================
   FIT BITES · compra.js
   La lista de la compra: junta los ingredientes de las recetas que
   marcas con el carrito 🛒, suma las cantidades y deja ir tachando.
   ===================================================================== */

import { buscarReceta } from './estado.js';             // para encontrar cada receta por su id
import { escaparHtml, normalizarTexto, formatoNumero, numeroConMedio, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar la lista (navegador y, con cuenta, nube)
import { mostrarRecetas } from './recetas.js';          // para repintar las tarjetas al vaciar la lista

// ---------- ESTADO DE ESTE ARCHIVO ----------
let compra = [];               // ids de las recetas que están en la lista de la compra
let compraOk = [];             // claves de los ingredientes ya tachados

/* ---------- LISTA DE LA COMPRA ---------- */

// ¿Esta receta está en la lista de la compra?
export function estaEnCompra(id) {
    return compra.includes(String(id));                    // includes mira si el id está en la lista
}

// Añade o quita una receta de la lista de la compra. Devuelve true si ahora está dentro
export function alternarCompra(id) {
    const clave = String(id);                              // el id, como texto
    if (compra.includes(clave)) {                          // si ya estaba...
        compra = compra.filter(c => c !== clave);          // ...la quitamos
    } else {                                               // si no...
        compra.push(clave);                                // ...la añadimos
    }
    guardar('compra', compra);                    // guardamos
    return compra.includes(clave);                         // y devolvemos cómo ha quedado
}

// Convierte un ingrediente escrito a mano ("120 g de salmón", "2 huevos", "Cebolla") en datos que se pueden sumar
export function interpretarIngrediente(texto) {
    const t = texto.trim();                                // sin espacios sobrantes

    // 1) con gramos o mililitros: "120 g de salmón", "100gr Salmón", "1 kg de..." (los grupos entre paréntesis son: cantidad, unidad y nombre)
    let m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|l)\b\.?\s*(?:de\s+)?(.+)$/i);
    if (m) {
        let cantidad = Number(m[1].replace(',', '.'));     // la cantidad como número (cambiando la coma por un punto)
        let unidad = m[2].toLowerCase();                   // la unidad en minúsculas
        if (unidad === 'kg') { cantidad *= 1000; unidad = 'g'; }   // los kilos pasan a gramos
        if (unidad === 'gr') unidad = 'g';                 // "gr" es lo mismo que "g"
        if (unidad === 'l') { cantidad *= 1000; unidad = 'ml'; }   // los litros pasan a mililitros
        return { cantidad, unidad, nombre: m[3].trim() };
    }

    // 2) con unidades sueltas: "2 huevos cocidos", "½ aguacate"
    m = t.match(/^(½|\d+(?:[.,]\d+)?)\s+(?:de\s+)?(.+)$/);
    if (m) {
        const cantidad = m[1] === '½' ? 0.5 : Number(m[1].replace(',', '.')); // "½" es un carácter especial: lo traducimos a 0,5
        return { cantidad, unidad: 'ud', nombre: m[2].trim() };
    }

    // 3) sin cantidad: "Cebolla", "Pimienta y orégano"
    return { cantidad: null, unidad: '', nombre: t };
}

// Crea una "clave" para saber si dos ingredientes son el mismo: "Huevos cocidos" y "huevo" -> "huevo"
function claveIngrediente(nombre) {
    return normalizarTexto(nombre)                         // minúsculas y sin tildes
        .replace(/\(.*?\)/g, '')                           // quita lo que va entre paréntesis
        .replace(/\b(cocid[oa]s?|rallad[oa]s?)\b/g, '')    // quita "cocido", "rallada"...
        .replace(/\bde\b/g, '')                            // quita la palabra "de" ("salsa de soja" = "salsa soja")
        .replace(/\s+/g, ' ')                              // deja un solo espacio entre palabras
        .trim()
        .split(' ')                                        // separa en palabras...
        .map(p => (p.length > 3 && p.endsWith('s') && !p.endsWith('ss') ? p.slice(0, -1) : p)) // ...y quita la "s" final del plural ("huevos" -> "huevo")
        .join(' ');                                        // y las vuelve a unir
}


// Junta los ingredientes de varias recetas, sumando las cantidades de los que se repiten
function agruparIngredientes(lista) {
    const grupos = new Map();                              // Map = lista de pares "clave -> datos"

    for (const receta of lista) {                          // por cada receta elegida...
        for (const texto of (receta.ingredientes ?? [])) { // ...y por cada ingrediente suyo...
            const dato = interpretarIngrediente(texto);    // ...lo interpretamos
            const clave = claveIngrediente(dato.nombre);   // ...y calculamos su clave
            if (clave === '') continue;                    // si se queda vacía, lo saltamos

            if (!grupos.has(clave)) {                      // si es la primera vez que aparece...
                grupos.set(clave, { clave, nombre: dato.nombre, g: 0, ml: 0, ud: 0, recetas: new Set() }); // ...creamos su ficha
            }

            const ficha = grupos.get(clave);               // la ficha de este ingrediente
            ficha.recetas.add(String(receta.id));          // apuntamos en qué recetas sale (Set no repite)
            if (dato.unidad === 'g') ficha.g += dato.cantidad;       // sumamos gramos...
            else if (dato.unidad === 'ml') ficha.ml += dato.cantidad; // ...o mililitros...
            else if (dato.unidad === 'ud') ficha.ud += dato.cantidad; // ...o unidades
        }
    }

    // pasamos las fichas a una lista, con el nombre con mayúscula inicial y la cantidad ya escrita
    return [...grupos.values()].map(f => {
        const partes = [];                                 // trozos de la cantidad (por si hay gramos y unidades a la vez)
        if (f.g > 0) partes.push(formatoNumero(f.g) + ' g');
        if (f.ml > 0) partes.push(formatoNumero(f.ml) + ' ml');
        if (f.ud > 0) partes.push(numeroConMedio(f.ud) + ' ud');

        return {
            clave: f.clave,
            nombre: f.nombre.charAt(0).toUpperCase() + f.nombre.slice(1), // primera letra en mayúscula
            cantidad: partes.join(' + '),                  // por ejemplo "220 g" o "2 ud"
            nota: f.recetas.size > 1 ? `en ${f.recetas.size} recetas` : '' // si sale en varias recetas, lo decimos
        };
    });
}

// Dibuja el panel de la lista de la compra y el numerito del menú
export function pintarCompra() {
    // las recetas elegidas (buscándolas por id; si alguna ya no existe, filter(Boolean) la descarta)
    const elegidas = compra.map(id => buscarReceta(id)).filter(Boolean);
    document.querySelector('#contadorCompra').textContent = elegidas.length; // el numerito del menú

    // las etiquetas de las recetas, cada una con su × para quitarla
    document.querySelector('#compraRecetas').innerHTML = elegidas.map(r => `
      <span class="chip-ingrediente">${escaparHtml(r.nombre)}
        <button type="button" class="compra-quitar" data-id="${r.id}" aria-label="Quitar ${escaparHtml(r.nombre)}">×</button>
      </span>`).join('');

    const lista = document.querySelector('#compraLista');  // el hueco de la lista

    if (elegidas.length === 0) {                           // si no hay recetas...
        lista.innerHTML = '<p class="text-body-secondary">Aún no hay nada. Pulsa el carrito 🛒 de una receta para añadir sus ingredientes.</p>';
        return;
    }

    // los ingredientes: los ya tachados van al final; dentro de cada grupo, por orden alfabético
    const items = agruparIngredientes(elegidas).sort((a, b) =>
        (compraOk.includes(a.clave) - compraOk.includes(b.clave)) || a.nombre.localeCompare(b.nombre, 'es')); // (true - false) = 1: los tachados pesan más y bajan

    lista.innerHTML = items.map(it => {
        const hecho = compraOk.includes(it.clave);         // ¿está tachado?
        return `
      <label class="item-compra${hecho ? ' tachado' : ''}">
        <input type="checkbox" class="form-check-input mt-0" data-clave="${escaparHtml(it.clave)}"${hecho ? ' checked' : ''}>
        <span class="item-nombre">${escaparHtml(it.nombre)}${it.nota ? `<small>${it.nota}</small>` : ''}</span>
        <span class="item-cantidad">${escaparHtml(it.cantidad)}</span>
      </label>`;
    }).join('');
}

// La lista como texto simple, para copiarla y pegarla donde quieras
function textoListaCompra() {
    const elegidas = compra.map(id => buscarReceta(id)).filter(Boolean); // las recetas elegidas
    const lineas = agruparIngredientes(elegidas)           // los ingredientes juntos
        .filter(it => !compraOk.includes(it.clave))        // sin los ya tachados
        .map(it => '• ' + it.nombre + (it.cantidad ? ' — ' + it.cantidad : '')); // "• Salmón — 220 g"
    return 'Lista de la compra (Fit Bites)\n' + lineas.join('\n'); // un título y una línea por ingrediente
}

/* ---------- ARRANQUE: oyentes del panel de la compra ---------- */

// Lee una lista de textos del almacén (si no es una lista, vacía)
function leerTextos(clave) {
    const guardado = leer(clave, []);
    return Array.isArray(guardado) ? guardado.map(String) : [];
}

// Recupera la lista de la compra y lo tachado
function leerCompra() {
    compra = leerTextos('compra');
    compraOk = leerTextos('compraOk');
}

export function iniciarCompra() {
    leerCompra();                                          // recupera la lista y lo tachado
    alCambiarDatos(() => { leerCompra(); pintarCompra(); }); // si llegan datos de la nube, se recarga

    const panelCompra = document.querySelector('#panelCompra'); // el panel lateral

    panelCompra.addEventListener('change', (e) => {        // al marcar o desmarcar una casilla de ingrediente
        const casilla = e.target.closest('input[data-clave]'); // ¿fue una casilla de la lista?
        if (!casilla) return;                              // si no, nada

        if (casilla.checked) {                             // si se ha marcado...
            compraOk.push(casilla.dataset.clave);          // ...lo apuntamos como tachado
        } else {                                           // si se ha desmarcado...
            compraOk = compraOk.filter(c => c !== casilla.dataset.clave); // ...lo quitamos de los tachados
        }
        guardar('compraOk', compraOk);           // guardamos
        pintarCompra();                                    // repintamos (el tachado baja al final)
    });

    panelCompra.addEventListener('click', (e) => {         // clics dentro del panel
        const quitar = e.target.closest('.compra-quitar'); // ¿fue en la × de una receta?
        if (!quitar) return;                               // si no, nada

        alternarCompra(quitar.dataset.id);                 // la quitamos de la lista
        pintarCompra();                                    // repintamos el panel
        const botonTarjeta = document.querySelector(`.btn-compra[data-id="${quitar.dataset.id}"]`); // y su botón de carrito en la tarjeta
        if (botonTarjeta) {                                // si la tarjeta está en pantalla...
            botonTarjeta.classList.remove('activa');       // ...vuelve a verse como "no añadida"
            botonTarjeta.setAttribute('aria-pressed', 'false');
            botonTarjeta.querySelector('i').className = 'bi bi-cart-plus';
        }
    });

    document.querySelector('#btnCompraVaciar').addEventListener('click', () => { // "Vaciar lista"
        compra = [];                                       // sin recetas
        compraOk = [];                                     // y sin nada tachado
        guardar('compra', compra);                // guardamos
        guardar('compraOk', compraOk);
        pintarCompra();                                    // repintamos el panel
        mostrarRecetas();                                  // y las tarjetas (para que los carritos se apaguen)
    });

    document.querySelector('#btnCompraCopiar').addEventListener('click', async () => { // "Copiar lista"
        try {                                              // el portapapeles puede fallar (permisos)
            await navigator.clipboard.writeText(textoListaCompra()); // copia el texto
            mostrarAviso('Lista copiada ✓');               // avisamos
        } catch {
            mostrarAviso('No se pudo copiar la lista');    // si falla, también avisamos
        }
    });
}
