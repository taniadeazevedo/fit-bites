/* =====================================================================
   FIT BITES · compra.js
   La lista de la compra: lo que apuntas A MANO ("leche", "1 kg de
   patatas") y los ingredientes de las recetas que marcas con el
   carrito (sumando las cantidades). Todo se puede ir tachando.
   ===================================================================== */

import { buscarReceta } from './estado.js';             // para encontrar cada receta por su id
import { escaparHtml, normalizarTexto, formatoNumero, numeroConMedio, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar la lista (navegador y, con cuenta, nube)
import { mostrarRecetas } from './recetas.js';          // para repintar las tarjetas al vaciar la lista
import { todosLosAlimentos } from './alimentos.js';    // para sugerir nombres al escribir

// ---------- ESTADO DE ESTE ARCHIVO ----------
let compra = [];               // ids de las recetas que están en la lista de la compra
let compraOk = [];             // claves de los ingredientes ya tachados
let manuales = [];             // lo apuntado a mano: [{ id: 'm...', texto: 'Leche', hecho: false }]

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
    const cuantos = elegidas.length + manuales.filter(m => !m.hecho).length; // recetas + lo apuntado a mano que falta por comprar
    document.querySelectorAll('.contador-compra').forEach(c => {           // el numerito sale en dos sitios: arriba y en la barra del móvil
        c.textContent = cuantos;
        c.toggleAttribute('data-cero', cuantos === 0);     // con 0, el CSS lo oculta (toggleAttribute pone o quita el atributo)
    });

    // las etiquetas de las recetas, cada una con su × para quitarla
    document.querySelector('#compraRecetas').innerHTML = elegidas.map(r => `
      <span class="chip-ingrediente">${escaparHtml(r.nombre)}
        <button type="button" class="compra-quitar" data-id="${r.id}" aria-label="Quitar ${escaparHtml(r.nombre)}">×</button>
      </span>`).join('');

    const lista = document.querySelector('#compraLista');  // el hueco de la lista

    if (elegidas.length === 0 && manuales.length === 0) {  // si no hay nada...
        lista.innerHTML = '<p class="text-body-secondary">Tu lista está vacía. Escribe arriba lo que necesitas o pulsa el carrito de una receta.</p>';
        return;
    }

    // todo junto en una lista: lo de las recetas (agrupado) y lo apuntado a mano
    const items = [
        ...agruparIngredientes(elegidas).map(it => ({ ...it, manual: false, hecho: compraOk.includes(it.clave) })),
        ...manuales.map(m => ({ manual: true, id: m.id, nombre: m.texto, cantidad: '', nota: '', hecho: m.hecho }))
    ].sort((a, b) => (a.hecho - b.hecho) || a.nombre.localeCompare(b.nombre, 'es')); // los tachados al final ((true - false) = 1: pesan más y bajan); dentro, por orden alfabético

    lista.innerHTML = items.map(it => {
        // lo apuntado a mano lleva además una × para borrarlo. Como el <label> no puede envolver ese botón, se une a su casilla con for="..." / id="..."
        if (it.manual) {
            return `
      <div class="item-compra${it.hecho ? ' tachado' : ''}">
        <input type="checkbox" class="form-check-input mt-0" id="${it.id}" data-manual="${it.id}"${it.hecho ? ' checked' : ''}>
        <label class="item-nombre" for="${it.id}">${escaparHtml(it.nombre)}</label>
        <button type="button" class="compra-borrar" data-manual="${it.id}" aria-label="Borrar ${escaparHtml(it.nombre)}">×</button>
      </div>`;
        }
        return `
      <label class="item-compra${it.hecho ? ' tachado' : ''}">
        <input type="checkbox" class="form-check-input mt-0" data-clave="${escaparHtml(it.clave)}"${it.hecho ? ' checked' : ''}>
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
    const aMano = manuales.filter(m => !m.hecho).map(m => '• ' + m.texto); // lo apuntado a mano (sin lo tachado)
    return 'Lista de la compra (Fit Bites)\n' + [...aMano, ...lineas].join('\n'); // un título y una línea por producto
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
    const guardados = leer('compraManual', []);            // lo apuntado a mano
    manuales = Array.isArray(guardados) ? guardados.filter(m => m && m.id && typeof m.texto === 'string') : [];
}

// Rellena las sugerencias del campo de texto con los alimentos de la tabla (sin repetir y en orden)
function rellenarSugerencias() {
    const nombres = [...new Set(todosLosAlimentos().map(a => a.nombre.replace(/\s*\(.*\)$/, '')))] // sin lo de entre paréntesis ("Arroz basmati (crudo)" -> "Arroz basmati"); new Set quita los repetidos
        .sort((a, b) => a.localeCompare(b, 'es'));
    document.querySelector('#sugerenciasCompra').innerHTML = nombres.map(n => `<option value="${escaparHtml(n)}"></option>`).join('');
}

export function iniciarCompra() {
    leerCompra();                                          // recupera la lista y lo tachado
    rellenarSugerencias();                                 // las sugerencias al escribir

    // APUNTAR A MANO: al enviar el formulario (botón o Enter), se añade a la lista
    document.querySelector('#formCompraManual').addEventListener('submit', (e) => {
        e.preventDefault();                                // que no recargue la página
        const campo = e.target.texto;
        const texto = campo.value.trim();
        if (texto === '') return;

        const repetido = manuales.some(m => normalizarTexto(m.texto) === normalizarTexto(texto) && !m.hecho); // ¿ya está sin tachar? (some = ¿alguno cumple?)
        if (!repetido) {
            manuales.push({ id: 'm' + Date.now().toString(36), texto: texto.charAt(0).toUpperCase() + texto.slice(1), hecho: false }); // con mayúscula inicial
            guardar('compraManual', manuales);
        }
        campo.value = '';                                  // vaciamos la casilla para el siguiente
        campo.focus();
        pintarCompra();
        if (repetido) mostrarAviso('Ya estaba en la lista');
    });
    alCambiarDatos(() => { leerCompra(); pintarCompra(); }); // si llegan datos de la nube, se recarga

    const panelCompra = document.querySelector('#panelCompra'); // el panel lateral

    panelCompra.addEventListener('change', (e) => {        // al marcar o desmarcar una casilla de ingrediente
        const casillaManual = e.target.closest('input[data-manual]'); // ¿una de lo apuntado a mano?
        if (casillaManual) {
            const item = manuales.find(m => m.id === casillaManual.dataset.manual);
            if (item) item.hecho = casillaManual.checked;  // tachado o no
            guardar('compraManual', manuales);
            pintarCompra();
            return;
        }

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
        const borrar = e.target.closest('.compra-borrar'); // ¿fue en la × de algo apuntado a mano?
        if (borrar) {
            manuales = manuales.filter(m => m.id !== borrar.dataset.manual); // todos menos ese
            guardar('compraManual', manuales);
            pintarCompra();
            document.querySelector('#compraManualTexto').focus(); // el botón ha desaparecido: el foco a la casilla de escribir
            return;
        }

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
        manuales = [];                                     // y sin lo apuntado a mano
        guardar('compra', compra);                         // guardamos
        guardar('compraManual', manuales);
        guardar('compraOk', compraOk);
        pintarCompra();                                    // repintamos el panel
        mostrarRecetas();                                  // y las tarjetas (para que los carritos se apaguen)
    });

    document.querySelector('#btnCompraCopiar').addEventListener('click', async () => { // "Copiar lista"
        try {                                              // el portapapeles puede fallar (permisos)
            await navigator.clipboard.writeText(textoListaCompra()); // copia el texto
            mostrarAviso('Lista copiada');               // avisamos
        } catch {
            mostrarAviso('No se pudo copiar la lista');    // si falla, también avisamos
        }
    });
}
