/* =====================================================================
   FIT BITES · dia.js
   El DIARIO: lo que comes cada día, separado por comidas (desayuno,
   comida, merienda y cena), frente a tu objetivo. Y la vista "Semana"
   con medias y gráficos.

   Se guarda en el almacén con esta forma (el historial):
     { "2026-10-15": { desayuno: [línea, línea], comida: [...], merienda: [], cena: [] } }

   Cada LÍNEA guarda una copia de sus valores, para que el historial no
   cambie aunque luego corrijas un alimento o borres un plato:
     { id, origen: 'alimento' | 'plato' | 'receta', ref, nombre,
       cantidad, unidad: 'g' | 'racion', valores: { kcal, proteina, carbohidratos, grasas } }
   - unidad 'g'      -> valores por cada 100 g (cantidad = gramos)
   - unidad 'racion' -> valores por ración     (cantidad = raciones)
   ===================================================================== */

import { COMIDAS, NUTRIENTES, OBJETIVO_DEFECTO, DIAS_GUARDADOS, CLAVE_DIA_ANTIGUO } from './config.js'; // ajustes
import { estado, buscarReceta } from './estado.js';     // las recetas (para pasar al formato nuevo lo que tenías apuntado)
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar y leer los datos de la persona
import { crearPlato } from './platos.js';               // "Guardar como plato"
import { escaparHtml, formatoNumero, numeroConMedio, mayusculaInicial, fechaHoy, sumarDias, lunesDe, fechaLegible, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { abrirAnadir } from './anadir.js';              // la ventana para añadir alimentos

// ---------- ESTADO DE ESTE ARCHIVO ----------
let historial = {};                        // lo comido cada día (ver arriba)
let objetivo = { ...OBJETIVO_DEFECTO };    // tu objetivo diario ("..." = una copia, para no estropear el original)
let fechaVista = null;                     // el día que se está viendo; null = "hoy" (así, si pasa la medianoche con la web abierta, sigue siendo hoy)
let vista = 'dia';                         // qué se ve: 'dia' o 'semana'
let comidaParaPlato = null;                // la comida que se va a guardar como plato (mientras está abierta su ventana)

const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];   // las letras de los días de la semana, empezando en lunes

/* ---------- LÍNEAS: crear, comprobar y sumar ---------- */

// Un id corto y único para cada línea: la hora + un trozo al azar (Math.random)
function nuevoId() {
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Comprueba que una línea tiene buena pinta
function lineaValida(l) {
    return l && typeof l.nombre === 'string' && Number(l.cantidad) > 0
        && (l.unidad === 'g' || l.unidad === 'racion')
        && l.valores && NUTRIENTES.every(n => Number.isFinite(Number(l.valores[n.clave]))); // los 4 valores son números
}

// Los totales de una línea: sus valores multiplicados por la cantidad
export function totalesLinea(l) {
    const factor = l.unidad === 'g' ? l.cantidad / 100 : l.cantidad; // con gramos, los valores son por 100 g; con raciones, por ración
    const totales = {};                                    // { kcal: ..., proteina: ... }
    for (const n of NUTRIENTES) totales[n.clave] = Number(l.valores[n.clave]) * factor;
    return totales;
}

// Suma una lista de líneas
function sumarLineas(lineas) {
    const totales = { kcal: 0, proteina: 0, carbohidratos: 0, grasas: 0 }; // empezamos a cero
    for (const l of lineas) {                              // por cada línea...
        const t = totalesLinea(l);                         // ...sus totales...
        for (const n of NUTRIENTES) totales[n.clave] += t[n.clave]; // ...se suman
    }
    return totales;
}

/* ---------- LEER Y GUARDAR ---------- */

// El día que se está viendo (si fechaVista es null, es hoy)
function fechaActual() {
    return fechaVista ?? fechaHoy();                       // "??" = si lo de la izquierda es null, usa lo de la derecha
}

// Crea una línea a partir de una receta
export function lineaDeReceta(receta, raciones) {
    return {
        id: nuevoId(), origen: 'receta', ref: String(receta.id), nombre: receta.nombre,
        cantidad: raciones, unidad: 'racion',
        valores: { kcal: receta.kcal, proteina: receta.proteina, carbohidratos: receta.carbohidratos, grasas: receta.grasas }
    };
}

// Pasa un día del formato ANTERIOR (una lista de recetas: [{ id, raciones }]) al nuevo: todo va a "comida"
// Devuelve null si todavía no se puede (sin recetas cargadas no sabemos sus valores)
function migrarDiaAntiguo(lista) {
    if (estado.recetas.length === 0) return null;          // sin recetas no podemos: lo dejamos como estaba
    const lineas = [];
    for (const p of lista) {                               // por cada plato antiguo...
        const receta = buscarReceta(p?.id);                // ...buscamos su receta
        if (!receta || !(Number(p.raciones) > 0)) continue; // si ya no existe, se pierde
        lineas.push(lineaDeReceta(receta, Number(p.raciones)));
    }
    return { comida: lineas };
}

// Lee el historial del almacén, lo limpia y pasa al formato nuevo lo que haga falta
function leerHistorial() {
    const guardado = { ...leer('historial', {}) };         // una copia de lo guardado (o un objeto vacío)
    const resultado = {};

    // el formato MUY antiguo ("fitbites-dia": solo el día de hoy)
    try {
        const antiguo = JSON.parse(localStorage.getItem(CLAVE_DIA_ANTIGUO));
        if (antiguo?.fecha && Array.isArray(antiguo.items) && !guardado[antiguo.fecha]) guardado[antiguo.fecha] = antiguo.items;
    } catch { }

    for (const [fecha, dia] of Object.entries(guardado)) { // por cada par [fecha, día]...
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;  // ...la fecha tiene que tener la forma 2026-10-15

        if (Array.isArray(dia)) {                          // formato anterior (lista de recetas)
            resultado[fecha] = migrarDiaAntiguo(dia) ?? dia; // si aún no se puede pasar, se guarda tal cual (para no perderlo)
            continue;
        }

        if (dia && typeof dia === 'object') {              // formato nuevo: { desayuno: [...], ... }
            const limpio = {};
            for (const c of COMIDAS) {                     // por cada comida...
                const lineas = Array.isArray(dia[c.id]) ? dia[c.id].filter(lineaValida) : []; // ...sus líneas válidas
                if (lineas.length > 0) limpio[c.id] = lineas;
            }
            resultado[fecha] = limpio;
        }
    }

    return resultado;
}

// Guarda el historial, quitando los días vacíos y los más antiguos
function guardarHistorial() {
    for (const fecha of Object.keys(historial)) {          // por cada fecha...
        const dia = historial[fecha];
        const vacio = !Array.isArray(dia) && COMIDAS.every(c => (dia[c.id] ?? []).length === 0); // ¿no tiene ninguna línea?
        if (vacio) delete historial[fecha];                // si está vacío, lo borramos (delete quita una propiedad del objeto)
    }

    const fechas = Object.keys(historial).sort();          // las fechas, de la más antigua a la más nueva
    for (const fecha of fechas.slice(0, -DIAS_GUARDADOS)) { // slice(0, -120) = todas menos las 120 últimas
        delete historial[fecha];                           // las más antiguas se borran para que no crezca sin fin
    }

    guardar('historial', historial);                       // al almacén (navegador y, con cuenta, la nube)
    try { localStorage.removeItem(CLAVE_DIA_ANTIGUO); } catch { } // el formato muy antiguo ya no hace falta
}

// Lee tu objetivo (o el de por defecto si lo guardado no vale)
function leerObjetivo() {
    const guardado = leer('objetivo', null);
    if (guardado && Object.keys(OBJETIVO_DEFECTO).every(k => Number(guardado[k]) > 0)) return guardado; // las 4 claves, mayores que 0
    return { ...OBJETIVO_DEFECTO };
}

/* ---------- CAMBIAR LO COMIDO ---------- */

// Las líneas de una comida de un día (si no hay, una lista vacía)
function lineasDe(fecha, comida) {
    const dia = historial[fecha];
    if (!dia || Array.isArray(dia)) return [];             // día sin datos (o aún en el formato anterior)
    return dia[comida] ?? [];
}

// Todas las líneas de un día
function lineasDelDia(fecha) {
    return COMIDAS.flatMap(c => lineasDe(fecha, c.id));    // flatMap junta las listas de cada comida en una sola
}

// Totales de un día
function totalesDe(fecha) {
    return sumarLineas(lineasDelDia(fecha));
}

// Cómo llamamos a un día en los avisos: "hoy", "ayer" o "el martes, 13"
function nombreDelDia(fecha) {
    if (fecha === fechaHoy()) return 'hoy';
    if (fecha === sumarDias(fechaHoy(), -1)) return 'ayer';
    return 'el ' + fechaLegible(fecha, { weekday: 'long', day: 'numeric' });
}

// La comida que toca según la hora (para proponerla al añadir): antes de las 11, desayuno; antes de las 16, comida...
export function comidaSugerida() {
    const hora = new Date().getHours();                    // la hora actual (0-23)
    return COMIDAS.find(c => hora < c.hasta).id;           // la primera comida cuyo "hasta" aún no ha llegado
}

// Añade una línea a una comida del día que se está viendo. Devuelve el texto del aviso
export function anadirLinea(comida, linea) {
    const fecha = fechaActual();
    if (!historial[fecha] || Array.isArray(historial[fecha])) historial[fecha] = {}; // día nuevo: objeto vacío
    const dia = historial[fecha];
    dia[comida] = [...(dia[comida] ?? []), { ...linea, id: nuevoId() }]; // añadimos la línea al final (con un id nuevo)

    guardarHistorial();                                    // guardamos
    pintarDia();                                           // y repintamos

    const nombreComida = COMIDAS.find(c => c.id === comida).nombre.toLowerCase(); // "comida", "cena"...
    const cuando = fecha === fechaHoy() ? '' : ` de ${nombreDelDia(fecha)}`;     // si no es hoy, lo decimos
    return `${linea.nombre} → ${nombreComida}${cuando} ✓`;
}

// Busca una línea por su comida y su id
function buscarLinea(comida, id) {
    return lineasDe(fechaActual(), comida).find(l => l.id === id);
}

// Cambia la cantidad de una línea (gramos o raciones)
function cambiarCantidad(comida, id, cantidad) {
    const linea = buscarLinea(comida, id);
    if (!linea) return;
    if (cantidad <= 0) { quitarLinea(comida, id); return; } // si llega a 0, se quita
    linea.cantidad = cantidad;
    guardarHistorial();
    pintarDia();
}

// Quita una línea
function quitarLinea(comida, id) {
    const dia = historial[fechaActual()];
    if (!dia || Array.isArray(dia)) return;
    dia[comida] = (dia[comida] ?? []).filter(l => l.id !== id); // todas menos esa
    guardarHistorial();
    pintarDia();
}

/* ---------- PINTAR ---------- */

// Dibuja la sección entera: cabecera y la vista elegida (día o semana)
export function pintarDia() {
    pintarCabecera();                                      // fecha, flechas y botones Día / Semana

    document.querySelector('#bloqueDia').classList.toggle('d-none', vista !== 'dia');        // el bloque del día se ve solo en la vista "día"
    document.querySelector('#bloqueSemana').classList.toggle('d-none', vista !== 'semana');  // y el de la semana, en la vista "semana"

    if (vista === 'dia') {
        pintarProgreso();                                  // las barras frente al objetivo
        pintarComidas();                                   // las cuatro comidas
    } else {
        pintarVistaSemana();
    }
}

// La cabecera: fecha (o semana), flechas, "Volver a hoy" y Día / Semana
function pintarCabecera() {
    const fecha = fechaActual();
    const hoy = fechaHoy();
    const enSemana = vista === 'semana';

    // los dos botones Día / Semana: el elegido se ve activo (y aria-pressed lo dice a los lectores de pantalla)
    document.querySelector('#btnVistaDia').classList.toggle('active', !enSemana);
    document.querySelector('#btnVistaDia').setAttribute('aria-pressed', !enSemana);
    document.querySelector('#btnVistaSemana').classList.toggle('active', enSemana);
    document.querySelector('#btnVistaSemana').setAttribute('aria-pressed', enSemana);

    let texto;                                             // el texto de la fecha
    let estamosEnHoy;                                      // ¿lo que vemos incluye hoy? (para apagar la flecha →)

    if (enSemana) {                                        // "Semana del 12 al 18 de octubre"
        const lunes = lunesDe(fecha);
        const domingo = sumarDias(lunes, 6);
        texto = `Semana del ${fechaLegible(lunes, { day: 'numeric' })} al ${fechaLegible(domingo, { day: 'numeric', month: 'long' })}`;
        estamosEnHoy = lunes === lunesDe(hoy);
    } else {                                               // "Hoy · jueves, 15 de octubre"
        const legible = fechaLegible(fecha);
        texto = fecha === hoy ? 'Hoy · ' + legible : mayusculaInicial(legible);
        estamosEnHoy = fecha === hoy;
    }

    document.querySelector('#fechaDia').textContent = texto; // aria-live la lee en voz alta al cambiar

    const siguiente = document.querySelector('#btnFechaSiguiente');
    siguiente.disabled = estamosEnHoy;                     // no se puede ir al futuro
    document.querySelector('#btnIrHoy').classList.toggle('d-none', estamosEnHoy); // "Volver a hoy" solo si estás en otro día
    document.querySelector('#btnFechaAnterior').setAttribute('aria-label', enSemana ? 'Semana anterior' : 'Día anterior');
    siguiente.setAttribute('aria-label', enSemana ? 'Semana siguiente' : 'Día siguiente');

    // si estás viendo otro día, un aviso: lo que añadas irá a ese día
    document.querySelector('#avisoOtroDia').classList.toggle('d-none', enSemana || estamosEnHoy);
}

// Las 4 barras: lo que llevas frente a tu objetivo
function pintarProgreso() {
    const totales = totalesDe(fechaActual());

    document.querySelector('#progresoDia').innerHTML = NUTRIENTES.map(n => {
        const valor = totales[n.clave];                    // lo que llevas
        const meta = objetivo[n.clave];                    // tu objetivo
        const porcentaje = Math.min(100, Math.round(valor / meta * 100)); // % conseguido (con tope en 100)
        const diferencia = Math.round(meta - valor);       // cuánto falta (si es negativo, te has pasado)

        const estadoTexto = diferencia >= 0                // operador ternario: condición ? sí : no
            ? `faltan ${formatoNumero(diferencia)} ${n.unidad}`
            : `<span class="excedido">+${formatoNumero(-diferencia)} ${n.unidad} de más</span>`;

        // aria-valuetext es lo que lee un lector de pantalla: "1.200 de 2.100 kcal"
        return `
      <div class="fila-progreso">
        <div class="d-flex justify-content-between flex-wrap gap-1 small mb-1">
          <strong>${n.nombre}</strong>
          <span>${formatoNumero(valor)} / ${formatoNumero(meta)} ${n.unidad} · ${estadoTexto}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${n.nombre}" aria-valuenow="${porcentaje}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${formatoNumero(valor)} de ${formatoNumero(meta)} ${n.unidad}">
          <div class="progress-bar ${n.clase}" style="width: ${porcentaje}%"></div>
        </div>
      </div>`;
    }).join('');
}

// Texto corto con los macros: "240 kcal · P 30 · C 10 · G 8"
function textoMacros(t) {
    return `${formatoNumero(t.kcal)} kcal · P ${formatoNumero(t.proteina, 1)} · C ${formatoNumero(t.carbohidratos, 1)} · G ${formatoNumero(t.grasas, 1)}`;
}

// Las cuatro tarjetas de comidas con sus líneas
function pintarComidas() {
    const fecha = fechaActual();

    document.querySelector('#comidasDia').innerHTML = COMIDAS.map(c => {
        const lineas = lineasDe(fecha, c.id);              // lo de esa comida
        const t = sumarLineas(lineas);                     // su total

        // una fila por línea: nombre y macros; para alimentos, la casilla de gramos; para platos y recetas, − raciones +
        const filas = lineas.map(l => {
            const nombre = escaparHtml(l.nombre);
            const control = l.unidad === 'g'
                ? `<div class="input-group input-group-sm cantidad-gramos">
                     <input type="number" min="1" step="1" inputmode="decimal" value="${l.cantidad}" class="form-control linea-gramos" aria-label="Gramos de ${nombre}">
                     <span class="input-group-text">g</span>
                   </div>`
                : `<div class="btn-group btn-group-sm" role="group" aria-label="Raciones de ${nombre}">
                     <button type="button" class="btn btn-outline-dark linea-menos" aria-label="Media ración menos de ${nombre}">−</button>
                     <span class="btn btn-outline-dark disabled contador-raciones">× ${numeroConMedio(l.cantidad)}</span>
                     <button type="button" class="btn btn-outline-dark linea-mas" aria-label="Media ración más de ${nombre}">+</button>
                   </div>`;

            return `
          <li class="linea-diario" data-id="${escaparHtml(l.id)}" data-comida="${c.id}">
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold text-truncate">${nombre}</div>
              <small class="text-body-secondary">${textoMacros(totalesLinea(l))}</small>
            </div>
            ${control}
            <button type="button" class="btn btn-link btn-sm text-danger px-1 linea-quitar" aria-label="Quitar ${nombre}">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </li>`;
        }).join('');

        // la tarjeta de la comida: título con su total, las filas y los botones
        return `
      <section class="comida-tarjeta" aria-labelledby="titulo-${c.id}">
        <div class="comida-cabecera">
          <h3 id="titulo-${c.id}" class="h6 mb-0"><i class="bi ${c.icono}" aria-hidden="true"></i> ${c.nombre}</h3>
          <span class="comida-total">${lineas.length ? `${formatoNumero(t.kcal)} kcal · P ${formatoNumero(t.proteina)} g` : ''}</span>
        </div>
        ${lineas.length ? `<ul class="list-unstyled mb-2">${filas}</ul>` : '<p class="small text-body-secondary mb-2">Nada apuntado.</p>'}
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button type="button" class="btn btn-verde btn-sm btn-anadir" data-comida="${c.id}">
            <i class="bi bi-plus-lg" aria-hidden="true"></i> Añadir<span class="visually-hidden"> a ${c.nombre.toLowerCase()}</span>
          </button>
          ${lineas.length > 1 ? `<button type="button" class="btn btn-link btn-sm btn-guardar-plato" data-comida="${c.id}">
            <i class="bi bi-bookmark-plus" aria-hidden="true"></i> Guardar como plato<span class="visually-hidden"> (${c.nombre.toLowerCase()})</span>
          </button>` : ''}
        </div>
      </section>`;
    }).join('');
}

// La vista de la semana (de lunes a domingo): resumen, dos gráficos y la lista de días
function pintarVistaSemana() {
    const hoy = fechaHoy();
    const lunes = lunesDe(fechaActual());

    // los 7 días: Array.from({ length: 7 }, (_, i) => ...) crea una lista de 7 elementos; "i" va de 0 a 6
    const dias = Array.from({ length: 7 }, (_, i) => {
        const fecha = sumarDias(lunes, i);
        return { fecha, totales: totalesDe(fecha), futuro: fecha > hoy }; // las fechas en texto se comparan bien con >
    });

    const conDatos = dias.filter(d => d.totales.kcal > 0); // los días con algo apuntado

    // la media de un nutriente en los días con datos; reduce() va sumando día a día, empezando en 0
    const media = clave => conDatos.length === 0 ? 0 : conDatos.reduce((suma, d) => suma + d.totales[clave], 0) / conDatos.length;
    const diasProteina = conDatos.filter(d => d.totales.proteina >= objetivo.proteina).length; // días que llegaste a tu proteína

    const resumen = conDatos.length === 0
        ? '<p class="text-body-secondary">Esta semana todavía no hay nada apuntado.</p>'
        : `
      <div class="macros">
        <div class="macro"><strong>${formatoNumero(media('kcal'))}</strong>kcal/día de media</div>
        <div class="macro"><strong>${formatoNumero(media('proteina'))} g</strong>proteína/día</div>
        <div class="macro"><strong>${diasProteina}/${conDatos.length}</strong>días con tu proteína</div>
      </div>
      <p class="small text-body-secondary mt-2 mb-0">Medias de los ${conDatos.length} ${conDatos.length === 1 ? 'día' : 'días'} con algo apuntado.</p>`;

    const nombres = dias.map(d => fechaLegible(d.fecha, { weekday: 'long', day: 'numeric' })); // "lunes, 13"
    const indiceHoy = dias.findIndex(d => d.fecha === hoy); // en qué posición está hoy (-1 si es otra semana)

    document.querySelector('#resumenSemana').innerHTML = `
      ${resumen}
      <div class="row g-4 mt-1">
        <div class="col-md-6">
          <h3 class="h6 mb-1">Calorías</h3>
          ${graficoBarras({ valores: dias.map(d => d.totales.kcal), meta: objetivo.kcal, nombres, indiceHoy, clase: 'barra-kcal', unidad: 'kcal', titulo: 'Calorías' })}
        </div>
        <div class="col-md-6">
          <h3 class="h6 mb-1">Proteína</h3>
          ${graficoBarras({ valores: dias.map(d => d.totales.proteina), meta: objetivo.proteina, nombres, indiceHoy, clase: 'macro-p', unidad: 'g', titulo: 'Proteína' })}
        </div>
      </div>
      <h3 class="h6 mt-4">Día a día</h3>
      <ul class="list-unstyled mb-0 dias-semana">
        ${dias.map((d, i) => `
          <li>
            <button type="button" class="dia-semana${d.fecha === hoy ? ' hoy' : ''}" data-fecha="${d.fecha}"${d.futuro ? ' disabled' : ''}>
              <span>${mayusculaInicial(nombres[i])}</span>
              <span class="text-body-secondary">${d.futuro || d.totales.kcal === 0 ? '—' : `${formatoNumero(d.totales.kcal)} kcal · P ${formatoNumero(d.totales.proteina)} g`}</span>
            </button>
          </li>`).join('')}
      </ul>`;
}

// Dibuja un gráfico de 7 barras en SVG con una línea discontinua en el objetivo
function graficoBarras({ valores, meta, nombres, indiceHoy, clase, unidad, titulo }) {
    const ancho = 320;                                     // medidas del dibujo (luego se estira al ancho disponible)
    const alto = 140;
    const arriba = 16;                                     // margen de arriba (texto del objetivo)
    const abajo = 22;                                      // margen de abajo (letras de los días)
    const zona = alto - arriba - abajo;                    // la altura para las barras
    const maximo = Math.max(meta * 1.15, ...valores);      // el valor más alto: el objetivo + 15 %, o un día que lo pase
    const hueco = ancho / valores.length;                  // el espacio de cada día
    const anchoBarra = hueco * 0.56;                       // la barra ocupa algo más de la mitad de su hueco

    const y = v => arriba + zona - (v / maximo) * zona;    // valor -> altura del dibujo (en SVG, la y crece hacia ABAJO)

    const barras = valores.map((v, i) => {
        const x = i * hueco + (hueco - anchoBarra) / 2;    // la barra, centrada en su hueco
        const centro = i * hueco + hueco / 2;              // el centro (para la letra)
        return `
        <rect x="${x}" y="${arriba}" width="${anchoBarra}" height="${zona}" rx="4" class="fondo-barra" />
        <rect x="${x}" y="${y(v)}" width="${anchoBarra}" height="${(v / maximo) * zona}" rx="4" class="barra ${clase}"><title>${mayusculaInicial(nombres[i])}: ${formatoNumero(v)} ${unidad}</title></rect>
        <text x="${centro}" y="${alto - 6}" class="etiqueta-barra${i === indiceHoy ? ' hoy' : ''}">${INICIALES[i]}</text>`;
    }).join('');

    // la descripción para lectores de pantalla
    const descripcion = `${titulo} por día: ` + valores.map((v, i) => `${nombres[i]}, ${formatoNumero(v)} ${unidad}`).join('; ') + `. Objetivo: ${formatoNumero(meta)} ${unidad}.`;

    return `
      <svg class="grafico-semana" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${escaparHtml(descripcion)}">
        ${barras}
        <line x1="0" x2="${ancho}" y1="${y(meta)}" y2="${y(meta)}" class="linea-meta" />
        <text x="${ancho}" y="${y(meta) - 4}" class="texto-meta">objetivo ${formatoNumero(meta)} ${unidad}</text>
      </svg>`;
}

// Rellena el formulario del objetivo con los valores actuales
function rellenarFormularioObjetivo() {
    const f = document.querySelector('#formObjetivo');
    f.kcal.value = objetivo.kcal;
    f.proteina.value = objetivo.proteina;
    f.carbohidratos.value = objetivo.carbohidratos;
    f.grasas.value = objetivo.grasas;
}

// Mueve la fecha: "pasos" días (o semanas en la vista de semana) hacia delante (+) o hacia atrás (-)
function moverFecha(pasos) {
    const dias = vista === 'semana' ? pasos * 7 : pasos;
    let nueva = sumarDias(fechaActual(), dias);
    if (nueva >= fechaHoy()) nueva = null;                 // si llega a hoy (o se pasa), volvemos a "hoy"
    fechaVista = nueva;
    pintarDia();
}

// Vuelve a leer todo del almacén (al arrancar y cuando llegan datos de la nube)
function recargar() {
    historial = leerHistorial();
    objetivo = leerObjetivo();
    rellenarFormularioObjetivo();
    pintarDia();
}

/* ---------- ARRANQUE: oyentes de la sección ---------- */

export function iniciarDia() {
    recargar();                                            // lee y pinta
    guardarHistorial();                                    // guarda ya en el formato nuevo (si había algo antiguo)
    alCambiarDatos(recargar);                              // si llegan datos de la nube, se recarga

    // Día / Semana
    document.querySelector('#btnVistaDia').addEventListener('click', () => { vista = 'dia'; pintarDia(); });
    document.querySelector('#btnVistaSemana').addEventListener('click', () => { vista = 'semana'; pintarDia(); });

    // flechas ← → y "Volver a hoy"
    document.querySelector('#btnFechaAnterior').addEventListener('click', () => moverFecha(-1));
    document.querySelector('#btnFechaSiguiente').addEventListener('click', () => moverFecha(1));
    document.querySelector('#btnIrHoy').addEventListener('click', () => { fechaVista = null; pintarDia(); });

    // en la lista de la semana, al pulsar un día se abre ese día
    document.querySelector('#resumenSemana').addEventListener('click', (e) => {
        const boton = e.target.closest('.dia-semana');
        if (!boton) return;
        fechaVista = boton.dataset.fecha === fechaHoy() ? null : boton.dataset.fecha; // null si es hoy
        vista = 'dia';
        pintarDia();
        document.querySelector('#btnVistaDia').focus();    // el botón pulsado ha desaparecido: llevamos el foco arriba (para quien usa teclado)
    });

    const comidas = document.querySelector('#comidasDia'); // el hueco de las cuatro comidas

    // clics: Añadir, Guardar como plato, − + y quitar
    comidas.addEventListener('click', (e) => {
        const anadir = e.target.closest('.btn-anadir');    // ¿"Añadir"?
        if (anadir) { abrirAnadir({ comida: anadir.dataset.comida }); return; }

        const plato = e.target.closest('.btn-guardar-plato'); // ¿"Guardar como plato"?
        if (plato) {
            comidaParaPlato = plato.dataset.comida;        // apuntamos qué comida
            document.querySelector('#formPlato').reset();  // el formulario, vacío
            bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalPlato')).show(); // y abrimos la ventana del nombre
            return;
        }

        const fila = e.target.closest('.linea-diario');    // ¿algo dentro de una línea?
        if (!fila) return;
        const { comida, id } = fila.dataset;               // sacamos data-comida y data-id de golpe
        const linea = buscarLinea(comida, id);
        if (!linea) return;

        if (e.target.closest('.linea-mas')) cambiarCantidad(comida, id, linea.cantidad + 0.5);       // media ración más
        else if (e.target.closest('.linea-menos')) cambiarCantidad(comida, id, linea.cantidad - 0.5); // media ración menos
        else if (e.target.closest('.linea-quitar')) quitarLinea(comida, id);                         // quitar
    });

    // al terminar de escribir los gramos ("change"), se guardan
    comidas.addEventListener('change', (e) => {
        const casilla = e.target.closest('.linea-gramos');
        if (!casilla) return;
        const fila = casilla.closest('.linea-diario');
        const gramos = Number(casilla.value);              // los gramos nuevos
        if (gramos > 0) cambiarCantidad(fila.dataset.comida, fila.dataset.id, gramos);
        else pintarDia();                                  // si no valen, vuelve el valor anterior
    });

    // la ventana "Guardar como plato": al enviar, se crea el plato con lo de esa comida
    document.querySelector('#formPlato').addEventListener('submit', (e) => {
        e.preventDefault();                                // que no recargue la página
        const nombre = e.target.nombre.value.trim();
        const lineas = lineasDe(fechaActual(), comidaParaPlato);
        if (nombre === '' || lineas.length === 0) return;

        // lo que lleva, como texto: "150 g Salmón · 70 g Arroz basmati (crudo)"
        const detalle = lineas.map(l => (l.unidad === 'g' ? `${formatoNumero(l.cantidad)} g ` : `×${numeroConMedio(l.cantidad)} `) + l.nombre).join(' · ');
        crearPlato(nombre, sumarLineas(lineas), detalle);  // el plato guarda la suma como "1 ración"

        bootstrap.Modal.getInstance(document.querySelector('#modalPlato')).hide();
        mostrarAviso(`Plato «${nombre}» guardado ✓`);
    });

    // botón "Vaciar día"
    document.querySelector('#btnVaciarDia').addEventListener('click', () => {
        const fecha = fechaActual();
        if (lineasDelDia(fecha).length === 0) return;      // si ya está vacío, nada
        if (confirm(`¿Vaciar todo lo de ${nombreDelDia(fecha)}?`)) { // confirm() abre "Aceptar / Cancelar"
            delete historial[fecha];
            guardarHistorial();
            pintarDia();
        }
    });

    // tu objetivo
    document.querySelector('#formObjetivo').addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const nuevo = { kcal: Number(f.kcal.value), proteina: Number(f.proteina.value), carbohidratos: Number(f.carbohidratos.value), grasas: Number(f.grasas.value) };
        if (!Object.values(nuevo).every(v => v > 0)) return; // todos mayores que 0
        objetivo = nuevo;
        guardar('objetivo', objetivo);
        pintarDia();
        mostrarAviso('Objetivo guardado ✓');
    });

    document.querySelector('#btnObjetivoDefecto').addEventListener('click', () => { // "Restaurar"
        objetivo = { ...OBJETIVO_DEFECTO };
        guardar('objetivo', objetivo);
        rellenarFormularioObjetivo();
        pintarDia();
    });
}
