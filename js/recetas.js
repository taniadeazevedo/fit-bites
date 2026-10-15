/* =====================================================================
   FIT BITES · recetas.js
   La lista de recetas: filtros (tipo, buscador, 🔥, ❤️), orden,
   favoritas, las tarjetas y lo que pasa al pulsarlas.
   (Ahora la web gira en torno al diario; las recetas son un extra:
   se pueden apuntar en el diario por raciones.)
   ===================================================================== */

import { TIPOS_PLATO, PROTEINA_ALTA, EN_LOCAL } from './config.js'; // ajustes que usamos aquí
import { estado, buscarReceta } from './estado.js';     // las recetas cargadas y el modo
import { escaparHtml, normalizarTexto, porcentajesMacros, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar las favoritas
import { fotoValida } from './fotos.js';                // para saber si una foto se puede pintar
import { borrarReceta, cargarRecetas } from './datos.js'; // hablar con json-server
import { abrirAnadir } from './anadir.js';            // apuntar una receta en el diario
import { pintarCompra, estaEnCompra, alternarCompra } from './compra.js'; // la lista de la compra
import { abrirDetalle } from './detalle.js';            // la ventana con el detalle de la receta
import { abrirFormulario } from './formulario.js';      // la ventana para editar
import { observarReveal } from './interfaz.js';         // animaciones al hacer scroll

// ---------- ESTADO DE ESTE ARCHIVO (solo lo usa recetas.js) ----------
let tipoFiltro = '';           // el tipo de plato elegido en las píldoras ('' = todos)
let textoBusqueda = '';        // lo que se ha escrito en el buscador ('' = sin búsqueda)
let soloProteina = false;      // true = la píldora "Alta en proteína" está activada
let soloFavoritas = false;     // true = la píldora "Favoritas" está activada
let orden = '';                // cómo se ordenan ('' = orden original, 'proteina', 'kcal', 'tiempo' o 'nombre')
let favoritas = [];            // ids de las recetas favoritas (como texto): ['1', '4']
let idParaBorrar = null;       // el id de la receta que se va a borrar (lo apuntamos al abrir la confirmación)

// Muestra u oculta lo que solo tiene sentido con json-server encendido
export function aplicarModo() {
    // classList.toggle(clase, condición): pone la clase si la condición es true y la quita si es false
    document.querySelector('#btnNueva').classList.toggle('d-none', estado.modoLectura); // en modo lectura se oculta "Nueva receta"

    // el aviso solo sale en tu ordenador (en la web publicada no hace falta)
    document.querySelector('#avisoLectura').classList.toggle('d-none', !(estado.modoLectura && EN_LOCAL)); // visible solo si: modo lectura Y en local
}

/* ---------- FILTRO POR TIPO DE PLATO ---------- */

// Rellena los dos sitios con tipos de plato (las píldoras del filtro y el desplegable del formulario) con la lista TIPOS_PLATO
function rellenarTipos() {
    const formulario = document.querySelector('#recTipo');      // el desplegable del formulario de receta
    const pills = document.querySelector('#pillsTipo');         // el hueco de las píldoras de filtro

    for (const tipo of TIPOS_PLATO) {                           // por cada tipo de la lista...
        formulario.add(new Option(tipo, tipo));                 // ...añade una opción al formulario (new Option(texto, valor))
    }

    // las píldoras: "Todos" (valor vacío) y una por cada tipo; al final, ❤️ Favoritas y 🔥 Alta en proteína
    // aria-pressed dice a los lectores de pantalla si la píldora está pulsada (true) o no (false)
    pills.innerHTML = ['', ...TIPOS_PLATO]
        .map(tipo => `<button type="button" class="pill-tipo${tipo === tipoFiltro ? ' activa' : ''}" data-tipo="${escaparHtml(tipo)}" aria-pressed="${tipo === tipoFiltro}">${tipo === '' ? 'Todos' : escaparHtml(tipo)}</button>`)
        .join('') + `<button type="button" class="pill-tipo pill-fav${soloFavoritas ? ' activa' : ''}" id="pillFavoritas" aria-pressed="${soloFavoritas}">❤️ Favoritas</button>`
        + `<button type="button" class="pill-tipo pill-proteina${soloProteina ? ' activa' : ''}" id="pillProteina" aria-pressed="${soloProteina}">🔥 Alta en proteína</button>`;
}

// Marca como "activa" la píldora del filtro elegido (sin volver a dibujarlas, para no perder el desplazamiento lateral)
function actualizarPills() {
    document.querySelectorAll('#pillsTipo [data-tipo]').forEach(p => {   // por cada píldora de tipo...
        const activa = p.dataset.tipo === tipoFiltro;                   // ...¿es la del tipo elegido?
        p.classList.toggle('activa', activa);                           // ...se ve activa solo si lo es
        p.setAttribute('aria-pressed', activa);                         // ...y lo avisamos a los lectores de pantalla
    });

    const proteina = document.querySelector('#pillProteina');           // la píldora de 🔥
    proteina.classList.toggle('activa', soloProteina);                  // activa si el filtro está puesto
    proteina.setAttribute('aria-pressed', soloProteina);                // y lo avisamos a los lectores de pantalla

    const favoritasPill = document.querySelector('#pillFavoritas');     // la píldora de ❤️
    favoritasPill.classList.toggle('activa', soloFavoritas);            // activa si el filtro está puesto
    favoritasPill.setAttribute('aria-pressed', soloFavoritas);          // y lo avisamos a los lectores de pantalla
}

// Devuelve las recetas que cumplen el tipo elegido, lo escrito en el buscador Y las píldoras de 🔥 y ❤️
function recetasFiltradas() {
    const busqueda = normalizarTexto(textoBusqueda.trim());    // lo escrito, sin espacios sobrantes y sin tildes

    return estado.recetas.filter(r => {                        // filter se queda con las recetas para las que esto devuelva true
        const coincideTipo = tipoFiltro === '' || r.tipo === tipoFiltro; // sin tipo elegido, valen todas; si no, el tipo debe coincidir

        // el texto donde buscamos: el nombre y todos los ingredientes (join une la lista en un solo texto)
        const textoReceta = normalizarTexto(r.nombre + ' ' + (r.ingredientes ?? []).join(' '));
        const coincideTexto = busqueda === '' || textoReceta.includes(busqueda); // sin búsqueda valen todas; si no, el texto debe contenerla

        const coincideProteina = !soloProteina || r.proteina >= PROTEINA_ALTA; // píldora apagada: valen todas; encendida: solo las que llegan al mínimo de proteína
        const coincideFavorita = !soloFavoritas || esFavorita(r.id); // píldora apagada: valen todas; encendida: solo las favoritas

        return coincideTipo && coincideTexto && coincideProteina && coincideFavorita; // la receta se muestra solo si cumple las cuatro condiciones (&& = Y)
    });
}

// Devuelve una COPIA de la lista ordenada según el desplegable (sort ordena una lista; con [...lista] trabajamos sobre una copia para no tocar la original)
function ordenarRecetas(lista) {
    const copia = [...lista];                              // los tres puntos "esparcen" la lista dentro de una nueva

    // sort recibe una función que compara dos recetas (a y b): si devuelve un número negativo, a va antes; si es positivo, va antes b
    if (orden === 'proteina') return copia.sort((a, b) => Number(b.proteina) - Number(a.proteina));  // de más a menos proteína
    if (orden === 'kcal') return copia.sort((a, b) => Number(a.kcal) - Number(b.kcal));              // de menos a más calorías
    if (orden === 'tiempo') return copia.sort((a, b) => Number(a.tiempo) - Number(b.tiempo));        // de menos a más minutos
    if (orden === 'nombre') return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));     // alfabético (localeCompare entiende tildes y ñ)
    return copia;                                          // sin orden elegido: como vienen
}

/* ---------- FAVORITAS ---------- */

// Lee las favoritas del almacén (una lista de ids como texto)
function leerFavoritas() {
    const guardadas = leer('favoritas', []);
    return Array.isArray(guardadas) ? guardadas.map(String) : [];
}

// ¿Esta receta es favorita?
function esFavorita(id) {
    return favoritas.includes(String(id));                 // includes mira si el id está en la lista
}

// Marca o desmarca una receta como favorita. Devuelve true si ahora es favorita
function alternarFavorita(id) {
    const clave = String(id);                              // el id, como texto
    if (favoritas.includes(clave)) {                       // si ya era favorita...
        favoritas = favoritas.filter(f => f !== clave);    // ...la quitamos (filter deja todas menos esa)
    } else {                                               // si no...
        favoritas.push(clave);                             // ...la añadimos
    }
    guardar('favoritas', favoritas);                       // guardamos (en el navegador y, con cuenta, en la nube)
    return favoritas.includes(clave);                      // y devolvemos cómo ha quedado
}

// Pinta las recetas aplicando los filtros y el orden que haya puestos
export function mostrarRecetas() {
    pintarRecetas(ordenarRecetas(recetasFiltradas()));     // filtramos, ordenamos y pintamos
}

/* ---------- PINTAR LA LISTA DE RECETAS ---------- */

// Recibe una lista de recetas y crea una tarjeta en la página por cada una
function pintarRecetas(lista) {
    const contenedor = document.querySelector('#listaRecetas'); // el hueco de la página donde van las tarjetas
    contenedor.innerHTML = '';                             // lo vaciamos antes de pintar (si no, se repetirían)

    // el texto invisible que leen los lectores de pantalla al filtrar (aria-live lo anuncia solo): "3 recetas"
    document.querySelector('#contadorRecetas').textContent = lista.length === 1 ? '1 receta' : `${lista.length} recetas`;

    if (lista.length === 0) {                              // si no hay ninguna receta...
        const hayFiltro = tipoFiltro !== '' || textoBusqueda.trim() !== '' || soloProteina || soloFavoritas; // ¿hay algún filtro o búsqueda puestos?
        const mensaje = hayFiltro ? 'No hay recetas que coincidan con lo que buscas.' : 'Aún no hay recetas. ¡Añade la primera!'; // ...el mensaje depende de si hay un filtro puesto
        contenedor.innerHTML = `<p class="text-body-secondary">${mensaje}</p>`; // ...y lo escribimos
        pintarCompra();                                    // ...y la lista de la compra
        return;                                            // ...y terminamos
    }

    for (const [indice, receta] of lista.entries()) {      // recorre las recetas y además nos da el número de orden de cada una (entries() = pares [posición, receta])
        const pct = porcentajesMacros(receta);             // los % de proteína, carbohidratos y grasas
        const numIngredientes = (receta.ingredientes ?? []).length; // cuántos ingredientes tiene; "?? []" = si no tiene la lista, usa una vacía
        const nombre = escaparHtml(receta.nombre);         // el nombre ya "escapado", porque lo usamos muchas veces
        const fav = esFavorita(receta.id);                 // ¿es favorita?
        const enCompra = estaEnCompra(receta.id);          // ¿está en la lista de la compra?

        const col = document.createElement('div');         // crea un <div> nuevo (todavía fuera de la página)
        col.className = 'col reveal';                      // le pone la clase "col" de Bootstrap (una columna de la rejilla) y "reveal" (aparece con animación al hacer scroll)
        col.style.setProperty('--i', indice % 3);          // su turno dentro de la fila (0, 1 o 2): así entran una tras otra

        // Dentro de las comillas inversas va el HTML de la tarjeta; ${...} inserta valores de la receta.
        // - La foto: si es válida se pinta la imagen; si no, un icono de huevo frito
        // - El nombre es un <button>: así se puede abrir el detalle con el teclado (Tab + Enter), no solo con el ratón
        // - Las 3 barras de colores usan los porcentajes (pct) como ancho; role="img" + aria-label las describen en palabras
        // - aria-hidden="true" en los iconos: son decoración y los lectores de pantalla se los saltan
        // - Los botones llevan aria-label con el nombre de la receta: "Añadir Bowl de salmón a Mi día" se entiende mejor que "Mi día"
        // - "Editar" y "Borrar" solo salen si no estamos en modo lectura
        col.innerHTML = `
      <article class="card h-100 border-0 shadow-sm receta" data-id="${receta.id}">
        <div class="position-relative">
          <div class="receta-img ratio ratio-4x3">
            ${fotoValida(receta.foto)
              ? `<img src="${escaparHtml(receta.foto)}" class="receta-foto" alt="Foto de ${nombre}" loading="lazy">`
              : `<div class="d-flex align-items-center justify-content-center"><i class="bi bi-egg-fried fs-1" aria-hidden="true"></i></div>`}
          </div>
          ${receta.proteina >= PROTEINA_ALTA ? `<span class="recipe-tag recipe-tag--protein receta-fuego">🔥 Alta en proteína</span>` : ''}
          <button type="button" class="btn-fav${fav ? ' activa' : ''}" data-id="${receta.id}" aria-pressed="${fav}" aria-label="Favorita: ${nombre}">
            <i class="bi ${fav ? 'bi-heart-fill' : 'bi-heart'}" aria-hidden="true"></i>
          </button>
        </div>

        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="d-flex flex-wrap gap-1">
              ${receta.tipo ? `<span class="recipe-tag">${escaparHtml(receta.tipo)}</span>` : ''}
            </span>
            <small class="text-body-secondary"><i class="bi bi-clock" aria-hidden="true"></i> ${receta.tiempo} min</small>
          </div>

          <h3 class="h5"><button type="button" class="receta-titulo">${nombre}</button></h3>
          <p class="mb-3"><strong class="kcal-grande">${receta.kcal}</strong> kcal</p>

          <div class="progress-stacked mb-2" role="img" aria-label="Reparto de calorías: proteína ${pct.p} %, carbohidratos ${pct.c} %, grasas ${pct.g} %">
            <div class="progress" aria-hidden="true" style="width: ${pct.p}%"><div class="progress-bar macro-p"></div></div>
            <div class="progress" aria-hidden="true" style="width: ${pct.c}%"><div class="progress-bar macro-c"></div></div>
            <div class="progress" aria-hidden="true" style="width: ${pct.g}%"><div class="progress-bar macro-g"></div></div>
          </div>

          <div class="d-flex justify-content-between small mb-3">
            <span><i class="punto macro-p" aria-hidden="true"></i> P ${receta.proteina} g</span>
            <span><i class="punto macro-c" aria-hidden="true"></i> C ${receta.carbohidratos} g</span>
            <span><i class="punto macro-g" aria-hidden="true"></i> G ${receta.grasas} g</span>
          </div>

          <small class="text-body-secondary d-block"><i class="bi bi-basket" aria-hidden="true"></i> ${numIngredientes} ingredientes · Ver receta</small>

          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-verde btn-sm btn-dia" data-id="${receta.id}" aria-label="Apuntar ${nombre} en el diario">
              <i class="bi bi-plus-lg" aria-hidden="true"></i> Apuntar
            </button>
            <button type="button" class="btn btn-sm btn-compra${enCompra ? ' activa' : ''}" data-id="${receta.id}" aria-pressed="${enCompra}" aria-label="Lista de la compra: ${nombre}" title="Lista de la compra">
              <i class="bi ${enCompra ? 'bi-cart-check-fill' : 'bi-cart-plus'}" aria-hidden="true"></i>
            </button>
            ${estado.modoLectura ? '' : `
            <button type="button" class="btn btn-outline-dark btn-sm btn-editar" data-id="${receta.id}" aria-label="Editar ${nombre}">
              <i class="bi bi-pencil-fill" aria-hidden="true"></i> Editar
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-borrar"
              data-bs-toggle="modal" data-bs-target="#modalBorrar"
              data-id="${receta.id}" data-nombre="${nombre}" aria-label="Borrar ${nombre}">
              <i class="bi bi-trash-fill" aria-hidden="true"></i> Borrar
            </button>`}
          </div>
        </div>
      </article>`;

        contenedor.appendChild(col);                       // ahora sí: metemos la tarjeta dentro de la página (appendChild = añadir al final)
    }

    pintarCompra();   // las recetas han cambiado: refresca la lista de la compra (por si se ha editado o borrado alguna receta)
    observarReveal(); // las tarjetas nuevas se animan cuando entran en pantalla
}

/* ---------- ARRANQUE: oyentes de la lista de recetas ---------- */

export function iniciarRecetas() {
    favoritas = leerFavoritas();                           // recupera tus favoritas
    alCambiarDatos(() => {                                 // si llegan datos de la nube...
        favoritas = leerFavoritas();                       // ...se vuelven a leer...
        mostrarRecetas();                                  // ...y se repintan las tarjetas (los corazones)
    });
    rellenarTipos();                                       // llena las píldoras y el desplegable de tipo de plato

    // píldoras de filtro: un solo oyente para todas (delegación). Una elige el tipo de plato; las de ❤️ y 🔥 se encienden o se apagan
    document.querySelector('#pillsTipo').addEventListener('click', (e) => {
        const pill = e.target.closest('.pill-tipo');       // ¿se pulsó una píldora?
        if (!pill) return;                                 // si no, nada

        if (pill.id === 'pillProteina') {                  // si es la de 🔥...
            soloProteina = !soloProteina;                  // ...cambiamos su estado (true pasa a false y al revés)
        } else if (pill.id === 'pillFavoritas') {          // si es la de ❤️...
            soloFavoritas = !soloFavoritas;                // ...igual
        } else {                                           // si es una de tipo...
            tipoFiltro = pill.dataset.tipo;                // ...apuntamos el tipo ('' si es "Todos")
        }

        actualizarPills();                                 // marcamos la píldora activa
        mostrarRecetas();                                  // repintamos las recetas
    });

    // desplegable de orden: al elegir otra opción, apuntamos el orden y repintamos
    document.querySelector('#ordenar').addEventListener('change', (e) => {
        orden = e.target.value;                            // 'proteina', 'kcal', 'tiempo', 'nombre' o '' (original)
        mostrarRecetas();                                  // repinta las recetas ya ordenadas
    });

    // buscador: cada vez que se escribe o se borra una letra, apuntamos el texto y repintamos
    document.querySelector('#buscador').addEventListener('input', (e) => { // "input" = cada vez que cambia lo escrito
        textoBusqueda = e.target.value;                    // lo que hay escrito ahora mismo en la casilla
        mostrarRecetas();                                  // repinta solo las recetas que coinciden
    });

    // clics en las tarjetas: favorita, compra, Mi día, editar, borrar (lo gestiona Bootstrap) o abrir el detalle
    // Ponemos UN solo oyente en toda la lista (delegación de eventos): sirve para todas las tarjetas, aunque se creen después
    document.querySelector('#listaRecetas').addEventListener('click', (e) => {
        const botonFav = e.target.closest('.btn-fav');     // ¿fue en el corazón?

        if (botonFav) {                                    // si sí...
            const ahoraFavorita = alternarFavorita(botonFav.dataset.id); // ...la marcamos o desmarcamos
            if (soloFavoritas && !ahoraFavorita) {         // si estamos viendo solo favoritas y ya no lo es...
                mostrarRecetas();                          // ...repintamos (así desaparece de la lista)
            } else {                                       // si no...
                botonFav.classList.toggle('activa', ahoraFavorita);       // ...solo cambiamos este corazón (sin repintar todo)
                botonFav.setAttribute('aria-pressed', ahoraFavorita);
                botonFav.querySelector('i').className = 'bi ' + (ahoraFavorita ? 'bi-heart-fill' : 'bi-heart');
            }
            return;                                        // y no abrimos el detalle
        }

        const botonCompra = e.target.closest('.btn-compra'); // ¿fue en el carrito?

        if (botonCompra) {                                 // si sí...
            const dentro = alternarCompra(botonCompra.dataset.id); // ...la añadimos o quitamos de la lista
            botonCompra.classList.toggle('activa', dentro);        // ...el botón cambia de aspecto
            botonCompra.setAttribute('aria-pressed', dentro);
            botonCompra.querySelector('i').className = 'bi ' + (dentro ? 'bi-cart-check-fill' : 'bi-cart-plus');
            pintarCompra();                                // ...refrescamos el panel y el numerito
            mostrarAviso(dentro ? 'Añadida a la lista de la compra ✓' : 'Quitada de la lista de la compra');
            return;                                        // ...y no abrimos el detalle
        }

        const botonDia = e.target.closest('.btn-dia');     // closest() sube desde donde se hizo clic hasta encontrar un elemento con esa clase (o null)

        if (botonDia) {                                    // si el clic fue en el botón "Apuntar"...
            abrirAnadir({ origen: 'receta', ref: botonDia.dataset.id }); // ...abrimos la ventana de añadir con la receta ya elegida
            return;                                        // ...y no seguimos (para no abrir también el detalle)
        }

        const botonEditar = e.target.closest('.btn-editar'); // ¿fue en el botón "Editar"?

        if (botonEditar) {                                 // si sí...
            const receta = buscarReceta(botonEditar.dataset.id); // buscamos esa receta
            if (receta) abrirFormulario(receta);           // ...y abrimos el formulario relleno
            return;                                        // ...y terminamos
        }

        if (e.target.closest('.btn-borrar')) return;       // el modal de borrado se abre solo (data-bs-toggle): aquí no hacemos nada

        const tarjeta = e.target.closest('.receta');       // ¿fue en cualquier otra parte de una tarjeta (o en su nombre)?
        if (tarjeta) abrirDetalle(tarjeta.dataset.id);     // si sí, abrimos el detalle de esa receta
    });

    // modal de confirmación: se prepara justo antes de abrirse
    const modalBorrar = document.querySelector('#modalBorrar'); // la ventana de "¿Seguro?"

    // "show.bs.modal" es un evento de Bootstrap: ocurre justo antes de que se muestre la ventana
    modalBorrar.addEventListener('show.bs.modal', (e) => {
        const boton = e.relatedTarget;                     // el botón "Borrar" que ha abierto la ventana (así sabemos de qué receta se trata)
        idParaBorrar = boton.dataset.id;                   // apuntamos su id (data-id)
        document.querySelector('#textoBorrar').textContent = // escribimos la pregunta con el nombre de la receta
            `¿Seguro que quieres borrar «${boton.dataset.nombre}»?`;
    });

    // botón "Sí, borrar" de la ventana de confirmación
    document.querySelector('#btnConfirmarBorrado').addEventListener('click', async () => {
        try {                                              // intentamos borrar
            await borrarReceta(idParaBorrar);              // DELETE al servidor

            estado.recetas = await cargarRecetas();        // pedimos la lista actualizada
            mostrarRecetas();                              // la dibujamos
            mostrarAviso('Receta borrada');                // avisamos
        } catch (error) {                                  // si falla...
            console.error('Error al borrar la receta:', error); // ...consola
            mostrarAviso('No se pudo borrar. ¿Está encendido json-server?'); // ...aviso
        }
    });
}
