/* =====================================================================
   FIT BITES · anadir.js
   La ventana para AÑADIR al diario. Tiene dos pestañas:
   - Alimentos: buscas ("salm"), eliges, pones los gramos y ves al momento
     cuánto suma. Aquí también puedes crear tus propios alimentos.
   - Recetas: las recetas de la web, por raciones.
   La ventana se queda abierta para añadir varias cosas seguidas.
   ===================================================================== */

import { COMIDAS, CATEGORIAS_ALIMENTO } from './config.js'; // comidas y categorías
import { estado, buscarReceta } from './estado.js';     // las recetas
import { filtrarAlimentos, buscarAlimento, crearAlimentoPropio, borrarAlimentoPropio } from './alimentos.js'; // alimentos
import { anadirLinea, totalesLinea, comidaSugerida } from './dia.js'; // el diario
import { escaparHtml, formatoNumero, numeroConMedio, normalizarTexto, mostrarAviso } from './utilidades.js'; // herramientas pequeñas

// ---------- ESTADO DE ESTE ARCHIVO ----------
let pestana = 'alimentos';     // la pestaña abierta: 'alimentos' o 'recetas'
let texto = '';                // lo escrito en el buscador
let categoria = '';            // la categoría elegida ('' = todas)
let seleccion = null;          // lo elegido para añadir: { origen, ref, nombre, unidad, cantidad, valores } (o null)

const q = selector => document.querySelector(selector); // atajo: q('#algo') en vez de document.querySelector('#algo')

// Texto corto con los macros: "208 kcal · P 20 · C 0 · G 13"
function macros(v, decimales = 1) {
    return `${formatoNumero(v.kcal)} kcal · P ${formatoNumero(v.proteina, decimales)} · C ${formatoNumero(v.carbohidratos, decimales)} · G ${formatoNumero(v.grasas, decimales)}`;
}

// Saca los 4 valores de un objeto (alimento o receta)
function valoresDe(objeto) {
    return { kcal: Number(objeto.kcal), proteina: Number(objeto.proteina), carbohidratos: Number(objeto.carbohidratos), grasas: Number(objeto.grasas) };
}

/* ---------- ELEGIR ---------- */

// Prepara la "selección" a partir de lo pulsado (origen + id). "cantidad" es opcional
function elegir(origen, ref, cantidad) {
    if (origen === 'alimento') {
        const a = buscarAlimento(ref);
        if (!a) return;
        seleccion = { origen, ref, nombre: a.nombre, unidad: 'g', cantidad: cantidad ?? a.racion ?? 100, valores: valoresDe(a), nota: a.nota };
    } else {
        const r = buscarReceta(ref);
        if (!r) return;
        seleccion = { origen: 'receta', ref: String(r.id), nombre: r.nombre, unidad: 'racion', cantidad: cantidad ?? 1, valores: valoresDe(r) };
    }
    pintarLista();                                         // para marcar la opción elegida
    pintarSeleccion();                                     // y enseñar abajo la cantidad y el total
    q('#selCantidadInput')?.focus();                       // el cursor a la cantidad ("?." = si existe)
    q('#selCantidadInput')?.select();                      // con el número seleccionado, para escribir encima
}

/* ---------- PINTAR ---------- */

// Las píldoras de categoría (solo en Alimentos)
function pintarCategorias() {
    const caja = q('#anadirCategorias');
    caja.classList.toggle('d-none', pestana !== 'alimentos'); // solo se ven en la pestaña de alimentos
    caja.innerHTML = ['', ...CATEGORIAS_ALIMENTO].map(c =>
        `<button type="button" class="pill-tipo${c === categoria ? ' activa' : ''}" data-categoria="${escaparHtml(c)}" aria-pressed="${c === categoria}">${c === '' ? 'Todas' : escaparHtml(c)}</button>`
    ).join('');
}

// La lista de opciones de la pestaña abierta
function pintarLista() {
    let opciones = [];                                     // cada opción: { origen, ref, nombre, detalle, borrable, etiqueta }
    const busqueda = normalizarTexto(texto.trim());

    if (pestana === 'alimentos') {
        opciones = filtrarAlimentos(texto, categoria).map(a => ({
            origen: 'alimento', ref: a.id, nombre: a.nombre,
            detalle: `${macros(a)} por 100 g${a.nota ? ' · ' + a.nota : ''}`,
            borrable: a.propio, etiqueta: a.propio ? 'Tuyo' : ''
        }));
    } else {
        opciones = estado.recetas
            .filter(r => busqueda === '' || normalizarTexto(r.nombre).includes(busqueda))
            .map(r => ({ origen: 'receta', ref: String(r.id), nombre: r.nombre, detalle: `${macros(valoresDe(r), 0)} por ración` }));
    }

    // mensaje si no hay nada
    const vacio = 'No hay nada que coincida. ' + (pestana === 'alimentos' ? 'Puedes crearlo abajo, en «Crear un alimento».' : '');

    q('#anadirLista').innerHTML = opciones.length === 0
        ? `<p class="text-body-secondary small mb-0">${vacio}</p>`
        : opciones.map(o => {
            const elegida = seleccion && seleccion.origen === o.origen && seleccion.ref === o.ref; // ¿es la seleccionada?
            return `
          <div class="opcion-fila">
            <button type="button" class="opcion${elegida ? ' elegida' : ''}" data-origen="${o.origen}" data-ref="${escaparHtml(o.ref)}" aria-pressed="${elegida}">
              <span class="opcion-nombre">${escaparHtml(o.nombre)}${o.etiqueta ? ` <span class="recipe-tag">${o.etiqueta}</span>` : ''}</span>
              <small class="text-body-secondary">${escaparHtml(o.detalle)}</small>
            </button>
            ${o.borrable ? `<button type="button" class="btn btn-link btn-sm text-danger opcion-borrar" data-origen="${o.origen}" data-ref="${escaparHtml(o.ref)}" aria-label="Borrar ${escaparHtml(o.nombre)}">
              <i class="bi bi-trash" aria-hidden="true"></i>
            </button>` : ''}
          </div>`;
        }).join('');

    q('#anadirContador').textContent = `${opciones.length} ${opciones.length === 1 ? 'resultado' : 'resultados'}`; // lo lee el lector de pantalla
    q('#bloqueCrearAlimento').classList.toggle('d-none', pestana !== 'alimentos'); // "Crear un alimento" solo en Alimentos
}

// La parte de abajo: lo elegido, su cantidad y cuánto suma
function pintarSeleccion() {
    const pie = q('#anadirSeleccion');
    pie.classList.toggle('d-none', !seleccion);            // sin selección, oculta
    if (!seleccion) return;

    const s = seleccion;
    q('#selNombre').textContent = s.nombre;

    // la cantidad: gramos (casilla) o raciones (− +)
    q('#selCantidad').innerHTML = s.unidad === 'g'
        ? `<div class="input-group input-group-sm cantidad-gramos">
             <input id="selCantidadInput" type="number" min="1" step="1" inputmode="decimal" value="${s.cantidad}" class="form-control" aria-label="Gramos">
             <span class="input-group-text">g</span>
           </div>`
        : `<div class="btn-group btn-group-sm" role="group" aria-label="Raciones">
             <button type="button" class="btn btn-outline-dark" data-cambio="-0.5" aria-label="Media ración menos">−</button>
             <span class="btn btn-outline-dark disabled contador-raciones">× ${numeroConMedio(s.cantidad)}</span>
             <button type="button" class="btn btn-outline-dark" data-cambio="0.5" aria-label="Media ración más">+</button>
           </div>`;

    pintarTotalSeleccion();
}

// Solo el total (para no redibujar la casilla mientras se escribe y no perder el cursor)
function pintarTotalSeleccion() {
    const s = seleccion;
    const valido = s.cantidad > 0;
    q('#selMacros').textContent = valido ? '= ' + macros(totalesLinea(s)) : 'Escribe una cantidad';
    q('#btnAnadirSeleccion').disabled = !valido;           // sin cantidad válida, no se puede añadir
}

// El título y el desplegable de comida
function pintarComidas(comida) {
    q('#anadirComida').innerHTML = COMIDAS.map(c => `<option value="${c.id}"${c.id === comida ? ' selected' : ''}>${c.nombre}</option>`).join('');
}

// Marca la pestaña abierta
function pintarPestanas() {
    document.querySelectorAll('#modalAnadir [data-pestana]').forEach(b => {
        const activa = b.dataset.pestana === pestana;
        b.classList.toggle('active', activa);
        b.setAttribute('aria-pressed', activa);
    });
    const ejemplos = { alimentos: 'Busca: salmón, arroz, nueces…', recetas: 'Busca una receta' };
    q('#anadirBuscar').placeholder = ejemplos[pestana];
}

function pintarTodo() {
    pintarPestanas();
    pintarCategorias();
    pintarLista();
    pintarSeleccion();
}

/* ---------- ABRIR ---------- */

// Abre la ventana. Todo es opcional: { comida, origen, ref, cantidad }
// Por ejemplo, desde una receta: abrirAnadir({ origen: 'receta', ref: '3', cantidad: 1.5 })
export function abrirAnadir({ comida, origen, ref, cantidad } = {}) {
    pintarComidas(comida ?? comidaSugerida());             // la comida (si no se dice, la que toca por la hora)
    pestana = origen === 'receta' ? 'recetas' : 'alimentos';
    texto = '';                                            // buscador vacío
    categoria = '';
    seleccion = null;
    q('#anadirBuscar').value = '';
    bootstrap.Collapse.getOrCreateInstance(q('#cajaCrearAlimento'), { toggle: false }).hide(); // el formulario de crear, cerrado

    pintarTodo();
    if (origen) elegir(origen, ref, cantidad);             // si viene algo ya elegido, lo seleccionamos

    const modal = q('#modalAnadir');
    // cuando termine de abrirse, el cursor al buscador (o a la cantidad si ya hay algo elegido)
    modal.addEventListener('shown.bs.modal', () => (seleccion ? q('#selCantidadInput') ?? q('#btnAnadirSeleccion') : q('#anadirBuscar')).focus(), { once: true }); // once = solo esta vez
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

/* ---------- ARRANQUE: oyentes de la ventana ---------- */

export function iniciarAnadir() {
    // pestañas
    q('#modalAnadir .pestanas-anadir').addEventListener('click', (e) => {
        const boton = e.target.closest('[data-pestana]');
        if (!boton) return;
        pestana = boton.dataset.pestana;
        seleccion = null;                                  // al cambiar de pestaña, se quita lo elegido
        pintarTodo();
    });

    // buscador: cada letra filtra
    q('#anadirBuscar').addEventListener('input', (e) => {
        texto = e.target.value;
        pintarLista();
    });

    // Enter en el buscador: si solo queda una opción, la elige
    q('#anadirBuscar').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const opciones = document.querySelectorAll('#anadirLista .opcion');
        if (opciones.length === 1) elegir(opciones[0].dataset.origen, opciones[0].dataset.ref);
    });

    // categorías
    q('#anadirCategorias').addEventListener('click', (e) => {
        const pill = e.target.closest('[data-categoria]');
        if (!pill) return;
        categoria = pill.dataset.categoria;
        pintarCategorias();
        pintarLista();
    });

    // elegir o borrar una opción
    q('#anadirLista').addEventListener('click', (e) => {
        const borrar = e.target.closest('.opcion-borrar');
        if (borrar) {
            const { origen, ref } = borrar.dataset;
            const nombre = borrar.closest('.opcion-fila').querySelector('.opcion-nombre').textContent.replace('Tuyo', '').trim();
            if (!confirm(`¿Borrar «${nombre}»? Lo que ya apuntaste en el diario no cambia.`)) return;
            if (origen === 'alimento') borrarAlimentoPropio(ref);  // (solo se pueden borrar tus alimentos propios)
            if (seleccion?.ref === ref) seleccion = null;  // si era lo elegido, se quita
            pintarLista();
            pintarSeleccion();
            q('#anadirBuscar').focus();                    // el botón ha desaparecido: el foco al buscador
            return;
        }

        const opcion = e.target.closest('.opcion');
        if (opcion) elegir(opcion.dataset.origen, opcion.dataset.ref);
    });

    // cantidad: gramos escritos o − +
    q('#selCantidad').addEventListener('input', (e) => {
        if (e.target.id !== 'selCantidadInput') return;
        seleccion.cantidad = Number(e.target.value);       // los gramos escritos
        pintarTotalSeleccion();                            // solo el total (sin redibujar la casilla)
    });

    q('#selCantidad').addEventListener('click', (e) => {
        const boton = e.target.closest('[data-cambio]');
        if (!boton) return;
        seleccion.cantidad = Math.max(0.5, seleccion.cantidad + Number(boton.dataset.cambio)); // nunca menos de media ración
        pintarSeleccion();
    });

    // Enter en la casilla de gramos = añadir
    q('#selCantidad').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.id === 'selCantidadInput') { e.preventDefault(); q('#btnAnadirSeleccion').click(); }
    });

    // AÑADIR al diario
    q('#btnAnadirSeleccion').addEventListener('click', () => {
        if (!seleccion || !(seleccion.cantidad > 0)) return;
        const { origen, ref, nombre, cantidad, unidad, valores } = seleccion; // sacamos solo lo que guarda una línea
        const aviso = anadirLinea(q('#anadirComida').value, { origen, ref, nombre, cantidad, unidad, valores });
        mostrarAviso(aviso);

        seleccion = null;                                  // listo para el siguiente
        pintarLista();
        pintarSeleccion();
        q('#anadirBuscar').focus();
        q('#anadirBuscar').select();                       // lo escrito, seleccionado: si escribes, se sustituye
    });

    // crear un alimento propio
    const form = q('#formAlimento');
    form.categoria.innerHTML = CATEGORIAS_ALIMENTO.map(c => `<option>${c}</option>`).join(''); // las categorías en el desplegable

    // kcal automáticas a partir de los macros (P×4 + C×4 + G×9), hasta que las escribas tú
    let kcalManual = false;
    form.kcal.addEventListener('input', () => { kcalManual = true; });
    for (const campo of ['proteina', 'carbohidratos', 'grasas']) {
        form[campo].addEventListener('input', () => {
            if (kcalManual) return;
            form.kcal.value = Math.round((Number(form.proteina.value) || 0) * 4 + (Number(form.carbohidratos.value) || 0) * 4 + (Number(form.grasas.value) || 0) * 9);
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.classList.add('was-validated'); return; } // Bootstrap pinta los errores en rojo

        const alimento = crearAlimentoPropio({
            nombre: form.nombre.value, categoria: form.categoria.value,
            kcal: form.kcal.value, proteina: form.proteina.value, carbohidratos: form.carbohidratos.value, grasas: form.grasas.value,
            racion: form.racion.value
        });

        form.reset();
        form.classList.remove('was-validated');
        kcalManual = false;
        bootstrap.Collapse.getOrCreateInstance(q('#cajaCrearAlimento')).hide();
        mostrarAviso(`«${alimento.nombre}» creado ✓`);

        pestana = 'alimentos';                             // lo dejamos elegido, listo para añadir
        texto = '';
        q('#anadirBuscar').value = '';
        categoria = '';
        pintarTodo();
        elegir('alimento', alimento.id);
    });
}
