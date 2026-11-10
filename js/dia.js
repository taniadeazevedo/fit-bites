/* =====================================================================
   FIT BITES · dia.js
   El DIARIO: lo que comes cada día, separado por comidas (desayuno,
   comida, merienda y cena), frente a tu objetivo. Y la vista "Semana"
   con medias y gráficos.
   Diseño inspirado en los diarios más usados (MyFitnessPal, Yazio...):
   - arriba, una tira con los 7 días de la semana para cambiar de día
   - una tarjeta destacada con las calorías que te quedan y un anillo con el % del objetivo
   - cada comida es una lista: nombre y cantidad a la izquierda, kcal a la derecha;
     al pulsar una fila se abre para cambiar la cantidad o eliminarla

   Se guarda en el almacén con esta forma (el historial):
     { "2026-10-15": { desayuno: [línea, línea], comida: [...], merienda: [], cena: [] } }

   Cada LÍNEA guarda una copia de sus valores, para que el historial no
   cambie aunque luego corrijas o borres un alimento:
     { id, origen: 'alimento' | 'receta', ref, nombre,
       cantidad, unidad: 'g' | 'racion', valores: { kcal, proteina, carbohidratos, grasas } }
   - unidad 'g'      -> valores por cada 100 g (cantidad = gramos)
   - unidad 'racion' -> valores por ración     (cantidad = raciones)
   ===================================================================== */

import { COMIDAS, NUTRIENTES, OBJETIVO_DEFECTO, DIAS_GUARDADOS, CLAVE_DIA_ANTIGUO } from './config.js'; // ajustes
import { estado, buscarReceta } from './estado.js';     // las recetas (para pasar al formato nuevo lo que tenías apuntado)
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar y leer los datos de la persona
import { escaparHtml, formatoNumero, numeroConMedio, mayusculaInicial, fechaHoy, sumarDias, lunesDe, fechaLegible, textoAFecha, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { abrirAnadir } from './anadir.js';              // la ventana para añadir alimentos
import { buscarAlimento } from './alimentos.js';        // la categoría de cada alimento (para su icono)
import { fotoValida } from './fotos.js';                // la foto de las recetas (para su miniatura)

// ---------- ESTADO DE ESTE ARCHIVO ----------
let historial = {};                        // lo comido cada día (ver arriba)
let objetivo = { ...OBJETIVO_DEFECTO };    // tu objetivo diario ("..." = una copia, para no estropear el original)
let fechaVista = null;                     // el día que se está viendo; null = "hoy" (así, si pasa la medianoche con la web abierta, sigue siendo hoy)
let vista = 'dia';                         // qué se ve: 'dia' o 'semana'
let lineaEditando = null;                  // el id de la fila que está abierta para editar (o null)

const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];   // las letras de los días de la semana, empezando en lunes
const MACROS = NUTRIENTES.filter(n => n.clave !== 'kcal'); // proteína, carbohidratos y grasas (sin las kcal, que van en el anillo)

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

// La cantidad escrita para leerla: "80 g" o "1½ ración" / "2 raciones"
function textoCantidad(l) {
    if (l.unidad === 'g') return `${formatoNumero(l.cantidad)} g`;
    return `${numeroConMedio(l.cantidad)} ${l.cantidad > 1 ? 'raciones' : 'ración'}`;
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

// Los alimentos que has apuntado últimamente (para la lista "Recientes" al añadir), con la última cantidad que usaste
// Devuelve hasta "cuantos": [{ ref: 'salmon', cantidad: 125 }, ...]
export function alimentosRecientes(cuantos = 6) {
    const vistos = new Map();                              // ref -> cantidad (un Map recuerda el orden en que se añaden)
    const fechas = Object.keys(historial).sort().reverse(); // de la fecha más nueva a la más antigua
    for (const fecha of fechas) {
        const lineas = lineasDelDia(fecha).slice().reverse(); // dentro del día, de lo último apuntado a lo primero
        for (const l of lineas) {
            if (l.origen === 'alimento' && !vistos.has(l.ref)) vistos.set(l.ref, l.cantidad); // la primera vez que lo vemos (la más reciente)
            if (vistos.size >= cuantos) break;
        }
        if (vistos.size >= cuantos) break;
    }
    return [...vistos].map(([ref, cantidad]) => ({ ref, cantidad })); // de Map a lista de objetos
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
    return `${linea.nombre} añadido a ${nombreComida}${cuando}`;
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
    if (lineaEditando === id) lineaEditando = null;        // ya no hay nada que editar
    guardarHistorial();
    pintarDia();
}

/* ---------- PINTAR ---------- */

// Cambia entre la vista "día" y "semana" (también la usan las pestañas del móvil)
export function cambiarVista(nueva) {
    vista = nueva;
    pintarDia();
}

// Dibuja la sección entera: cabecera, tira de días y la vista elegida (día o semana)
export function pintarDia() {
    pintarCabecera();                                      // fecha, Día / Semana y "Volver a hoy"
    pintarTira();                                          // los 7 días

    document.querySelector('#bloqueDia').classList.toggle('d-none', vista !== 'dia');        // el bloque del día se ve solo en la vista "día"
    document.querySelector('#bloqueSemana').classList.toggle('d-none', vista !== 'semana');  // y el de la semana, en la vista "semana"

    if (vista === 'dia') {
        pintarResumen();                                   // el anillo y los macros
        pintarComidas();                                   // las cuatro comidas
    } else {
        pintarVistaSemana();
    }
}

// La cabecera: fecha (o semana), Día / Semana y "Volver a hoy"
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
    let estamosEnHoy;                                      // ¿lo que vemos incluye hoy?

    if (enSemana) {                                        // "Semana del 12 al 18 de octubre"
        const lunes = lunesDe(fecha);
        const domingo = sumarDias(lunes, 6);
        texto = `Semana del ${fechaLegible(lunes, { day: 'numeric' })} al ${fechaLegible(domingo, { day: 'numeric', month: 'long' })}`;
        estamosEnHoy = lunes === lunesDe(hoy);
    } else {                                               // "Hoy, jueves 15 de octubre"
        const legible = fechaLegible(fecha, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''); // sin la coma: "jueves 15 de octubre"
        texto = fecha === hoy ? 'Hoy, ' + legible : fecha === sumarDias(hoy, -1) ? 'Ayer, ' + legible : mayusculaInicial(legible);
        estamosEnHoy = fecha === hoy;
    }

    document.querySelector('#fechaDia').textContent = texto; // aria-live la lee en voz alta al cambiar

    // el saludo según la hora: antes de las 6 y desde las 21, "Buenas noches"; antes de las 13, "Buenos días"; si no, "Buenas tardes"
    const hora = new Date().getHours();
    document.querySelector('#saludo').textContent = hora < 6 || hora >= 21 ? 'Buenas noches' : hora < 13 ? 'Buenos días' : 'Buenas tardes';
    document.querySelector('#btnIrHoy').classList.toggle('d-none', estamosEnHoy); // "Volver a hoy" solo si estás en otro día

    // si estás viendo otro día, un aviso: lo que añadas irá a ese día
    document.querySelector('#avisoOtroDia').classList.toggle('d-none', enSemana || estamosEnHoy);
}

// La tira de los 7 días (de lunes a domingo) de la semana que se está viendo, con el mes encima
function pintarTira() {
    const hoy = fechaHoy();
    const elegida = fechaActual();
    const lunes = lunesDe(elegida);

    // el mes de la semana: "Noviembre 2026" (si la semana cruza dos meses, el del jueves, que es el que más días tiene)
    document.querySelector('#mesTira').textContent = mayusculaInicial(fechaLegible(sumarDias(lunes, 3), { month: 'long', year: 'numeric' }).replace(' de ', ' '));

    document.querySelector('#diasTira').innerHTML = INICIALES.map((letra, i) => {
        const fecha = sumarDias(lunes, i);                 // lunes + i días
        const conDatos = lineasDelDia(fecha).length > 0;   // ¿tiene algo apuntado? (sale un puntito)
        const marcada = vista === 'dia' && fecha === elegida; // el día que se está viendo (en la vista semana, ninguno)
        const kcal = conDatos ? `, ${formatoNumero(totalesDe(fecha).kcal)} kcal` : ''; // para el lector de pantalla
        const clases = ['dia-tira', fecha === hoy ? 'hoy' : '', conDatos ? 'con-datos' : ''].join(' ');
        return `<button type="button" class="${clases}" data-fecha="${fecha}" aria-pressed="${marcada}"${fecha > hoy ? ' disabled' : ''}
                  aria-label="${mayusculaInicial(fechaLegible(fecha, { weekday: 'long', day: 'numeric' }))}${fecha === hoy ? ' (hoy)' : ''}${kcal}">
                  <span class="letra" aria-hidden="true">${letra}</span>
                  <span class="numero" aria-hidden="true">${textoAFecha(fecha).getDate()}</span>
                </button>`;
    }).join('');

    document.querySelector('#btnFechaSiguiente').disabled = lunes === lunesDe(hoy); // no se puede ir a semanas futuras
}

// El anillo en SVG: un círculo cuyo trazo se "llena" según la proporción (de 0 a 1)
// stroke-dasharray = lo largo de la línea; stroke-dashoffset = cuánto se esconde. Escondiendo menos, se ve más anillo
function anilloSvg(proporcion, pasado) {
    const radio = 52;
    const circunferencia = 2 * Math.PI * radio;            // la longitud del círculo: 2·π·r
    const esconder = circunferencia * (1 - Math.min(1, proporcion)); // con tope en 1 (anillo completo)
    return `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="anillo-carril" cx="60" cy="60" r="${radio}" />
        <circle class="anillo-progreso${pasado ? ' pasado' : ''}" cx="60" cy="60" r="${radio}"
          stroke-dasharray="${circunferencia}" stroke-dashoffset="${esconder}" />
      </svg>`;
}

// El resumen: la tarjeta destacada (kcal restantes + anillo) y las 3 tarjetas de macros
function pintarResumen() {
    const fecha = fechaActual();
    const t = totalesDe(fecha);
    const restantes = Math.round(objetivo.kcal - t.kcal);  // lo que queda (si es negativo, te has pasado)
    const pasado = restantes < 0;
    const porcentaje = Math.round(t.kcal / objetivo.kcal * 100); // % del objetivo
    const etiqueta = fecha === fechaHoy() ? 'Ingesta de hoy' : 'Ingesta del día'; // el texto de la etiqueta de arriba

    document.querySelector('#anilloDia').innerHTML = `
      <div class="destacada-texto">
        <span class="chip-etiqueta"><i class="bi bi-fire" aria-hidden="true"></i> ${etiqueta}</span>
        <p class="destacada-numero${pasado ? ' pasado' : ''}">${formatoNumero(Math.abs(restantes))}<span> kcal</span></p>
        <p class="destacada-sub">${pasado ? 'de más sobre tu objetivo' : fecha === fechaHoy() ? 'te quedan para hoy' : 'te quedaban ese día'}</p>
        <div class="destacada-cifras">
          <span><strong>${formatoNumero(t.kcal)}</strong> comido</span>
          <span><strong>${formatoNumero(objetivo.kcal)}</strong> objetivo</span>
        </div>
      </div>
      <div class="anillo-caja">
        ${anilloSvg(t.kcal / objetivo.kcal, pasado)}
        <div class="anillo-centro">
          <span class="anillo-numero">${porcentaje}<small>%</small></span>
          <span class="anillo-etiqueta">del objetivo</span>
        </div>
      </div>`;

    // las 3 tarjetas: icono con la inicial, nombre, "82 / 100 g" y una barra fina
    document.querySelector('#progresoDia').innerHTML = MACROS.map(n => {
        const valor = t[n.clave];
        const meta = objetivo[n.clave];
        const porcentajeMacro = Math.min(100, Math.round(valor / meta * 100)); // con tope en 100 para que no se salga
        const pasadoMacro = valor > meta * 1.05;           // más de un 5 % por encima: lo marcamos
        return `
      <div class="macro-tarjeta">
        <span class="macro-icono ${n.clase}-suave" aria-hidden="true">${n.nombre.charAt(0)}</span>
        <span class="macro-nombre">${n.nombre}</span>
        <span class="macro-valor"><strong class="${pasadoMacro ? 'excedido' : ''}">${formatoNumero(valor)}</strong> / ${formatoNumero(meta)} g</span>
        <div class="macro-barra" role="progressbar" aria-label="${n.nombre}" aria-valuenow="${porcentajeMacro}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${formatoNumero(valor)} de ${formatoNumero(meta)} gramos">
          <span class="${n.clase}" style="width: ${porcentajeMacro}%"></span>
        </div>
      </div>`;
    }).join('');
}

// Un icono para cada categoría de alimento (para la miniatura de las filas)
const ICONOS_CATEGORIA = {
    'Proteínas': 'bi-egg-fried',
    'Lácteos': 'bi-cup-straw',
    'Cereales y legumbres': 'bi-basket2',
    'Verduras': 'bi-flower2',
    'Frutas': 'bi-apple',
    'Frutos secos y grasas': 'bi-droplet-half',
    'Salsas y otros': 'bi-cup-hot'
};

// La miniatura de una fila: la foto si es una receta con foto; si no, el icono de su categoría
function miniatura(l) {
    if (l.origen === 'receta') {
        const receta = buscarReceta(l.ref);
        if (receta && fotoValida(receta.foto)) return `<img class="fila-miniatura" src="${escaparHtml(receta.foto)}" alt="" loading="lazy">`; // alt="" = es decoración (el nombre ya va al lado)
        return '<span class="fila-miniatura" aria-hidden="true"><i class="bi bi-journal-richtext"></i></span>';
    }
    const categoria = buscarAlimento(l.ref)?.categoria;    // la categoría del alimento (si aún existe)
    return `<span class="fila-miniatura" aria-hidden="true"><i class="bi ${ICONOS_CATEGORIA[categoria] ?? 'bi-circle'}"></i></span>`;
}

// Las cuatro comidas: icono, título con su total, botón + redondo y las filas
function pintarComidas() {
    const fecha = fechaActual();

    document.querySelector('#comidasDia').innerHTML = COMIDAS.map(c => {
        const lineas = lineasDe(fecha, c.id);              // lo de esa comida
        const t = sumarLineas(lineas);                     // su total

        const filas = lineas.map(l => {
            const nombre = escaparHtml(l.nombre);
            const lt = totalesLinea(l);                    // los totales de esta fila
            const abierta = l.id === lineaEditando;        // ¿está abierta para editar?
            const idEditor = 'editor-' + escaparHtml(l.id); // un id para unir el botón con su editor (aria-controls)

            // el editor: gramos (casilla) o raciones (− +), y los botones Eliminar y Listo
            const control = l.unidad === 'g'
                ? `<div class="input-group input-group-sm cantidad-gramos">
                     <input type="number" min="1" step="1" inputmode="decimal" value="${l.cantidad}" class="form-control linea-gramos" aria-label="Gramos de ${nombre}">
                     <span class="input-group-text">g</span>
                   </div>`
                : `<div class="btn-group btn-group-sm" role="group" aria-label="Raciones de ${nombre}">
                     <button type="button" class="btn btn-outline-dark linea-menos" aria-label="Media ración menos">−</button>
                     <span class="btn btn-outline-dark disabled contador-raciones">${numeroConMedio(l.cantidad)}</span>
                     <button type="button" class="btn btn-outline-dark linea-mas" aria-label="Media ración más">+</button>
                   </div>`;

            return `
          <li class="fila-alimento${abierta ? ' editando' : ''}" data-id="${escaparHtml(l.id)}" data-comida="${c.id}">
            <button type="button" class="fila-alimento-boton" aria-expanded="${abierta}" aria-controls="${idEditor}">
              ${miniatura(l)}
              <span class="fila-texto">
                <span class="fila-nombre">${nombre}</span>
                <span class="fila-detalle">${textoCantidad(l)} · P ${formatoNumero(lt.proteina, 1)} · C ${formatoNumero(lt.carbohidratos, 1)} · G ${formatoNumero(lt.grasas, 1)}</span>
              </span>
              <span class="fila-kcal">${formatoNumero(lt.kcal)} <small>kcal</small></span>
            </button>
            ${abierta ? `
            <div class="fila-editor" id="${idEditor}">
              ${control}
              <button type="button" class="btn btn-link btn-sm text-danger linea-quitar ms-auto">Eliminar</button>
              <button type="button" class="btn btn-verde btn-sm linea-listo">Listo</button>
            </div>` : ''}
          </li>`;
        }).join('');

        // la tarjeta de la comida: cabecera (icono, nombre, kcal y +) y la lista
        return `
      <section class="tarjeta comida-tarjeta" aria-labelledby="titulo-${c.id}">
        <div class="comida-cabecera">
          <span class="comida-icono" aria-hidden="true"><i class="bi ${c.icono}"></i></span>
          <div class="flex-grow-1 min-w-0">
            <h2 id="titulo-${c.id}" class="comida-titulo">${c.nombre}</h2>
            <span class="comida-macros">${lineas.length
                ? `<i class="bi bi-fire" aria-hidden="true"></i> <strong>${formatoNumero(t.kcal)} kcal</strong> · P ${formatoNumero(t.proteina)} · C ${formatoNumero(t.carbohidratos)} · G ${formatoNumero(t.grasas)}`
                : 'Sin alimentos todavía'}</span>
          </div>
          <button type="button" class="btn-mas btn-anadir" data-comida="${c.id}" aria-label="Añadir alimento a ${c.nombre.toLowerCase()}">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </div>
        ${lineas.length ? `<ul class="lista-filas">${filas}</ul>` : ''}
      </section>`;
    }).join('');
}

// La vista de la semana (de lunes a domingo): la media en grande, los gráficos, cifras y la lista de días
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

    const nombres = dias.map(d => fechaLegible(d.fecha, { weekday: 'long', day: 'numeric' })); // "lunes, 13"
    const indiceHoy = dias.findIndex(d => d.fecha === hoy); // en qué posición está hoy (-1 si es otra semana)

    // una tarjeta pequeña de cifra (como las de la referencia): icono, nombre y número
    const cifra = (icono, clase, nombre, valor) => `
      <div class="tarjeta cifra-tarjeta">
        <span class="macro-icono ${clase}" aria-hidden="true"><i class="bi ${icono}"></i></span>
        <div>
          <span class="cifra-nombre">${nombre}</span>
          <strong class="cifra-valor">${valor}</strong>
        </div>
      </div>`;

    document.querySelector('#resumenSemana').innerHTML = `
      <div class="cifras-grid">
        ${cifra('bi-lightning-charge-fill', 'macro-p-suave', 'Proteína al día', `${formatoNumero(media('proteina'))} g`)}
        ${cifra('bi-trophy-fill', 'lima-suave', 'Días con tu proteína', `${diasProteina}/${conDatos.length}`)}
        ${cifra('bi-calendar-check-fill', 'macro-g-suave', 'Días apuntados', `${conDatos.length}/7`)}
        ${cifra('bi-basket2-fill', 'macro-c-suave', 'Carbohidratos al día', `${formatoNumero(media('carbohidratos'))} g`)}
      </div>
      <div class="row g-3 mt-0">
        <div class="col-lg-6">
          <div class="tarjeta grafico-tarjeta">
            <div class="grafico-cabecera">
              <div>
                <span class="etiqueta-suave">Calorías · media diaria</span>
                <p class="numero-grande">${formatoNumero(media('kcal'))}<span> kcal</span></p>
              </div>
              <span class="etiqueta-suave">Objetivo ${formatoNumero(objetivo.kcal)} kcal</span>
            </div>
            ${graficoBarras({ valores: dias.map(d => d.totales.kcal), meta: objetivo.kcal, nombres, indiceHoy, unidad: 'kcal', titulo: 'Calorías' })}
          </div>
        </div>
        <div class="col-lg-6">
          <div class="tarjeta grafico-tarjeta">
            <div class="grafico-cabecera">
              <div>
                <span class="etiqueta-suave">Proteína · media diaria</span>
                <p class="numero-grande">${formatoNumero(media('proteina'))}<span> g</span></p>
              </div>
              <span class="etiqueta-suave">Objetivo ${formatoNumero(objetivo.proteina)} g</span>
            </div>
            ${graficoBarras({ valores: dias.map(d => d.totales.proteina), meta: objetivo.proteina, nombres, indiceHoy, unidad: 'g', titulo: 'Proteína' })}
          </div>
        </div>
        <div class="col-12">
          <div class="tarjeta grafico-tarjeta">
            <h2 class="etiqueta-suave mb-2">Día a día</h2>
            <ul class="dias-semana">
              ${dias.map((d, i) => `
                <li>
                  <button type="button" class="dia-semana${d.fecha === hoy ? ' hoy' : ''}" data-fecha="${d.fecha}"${d.futuro ? ' disabled' : ''}>
                    <span>${mayusculaInicial(nombres[i])}</span>
                    <span class="text-body-secondary">${d.futuro || d.totales.kcal === 0 ? '—' : `${formatoNumero(d.totales.kcal)} kcal · P ${formatoNumero(d.totales.proteina)} g`}</span>
                  </button>
                </li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
      ${conDatos.length === 0 ? '<p class="text-body-secondary mt-3 mb-0">Esta semana todavía no hay nada apuntado.</p>' : ''}`;
}

// Dibuja un gráfico de 7 barras en SVG, como el de la referencia: barras lima redondeadas, la de hoy en verde oscuro,
// y encima de cada barra el % del objetivo. Una línea discontinua marca el objetivo
function graficoBarras({ valores, meta, nombres, indiceHoy, unidad, titulo }) {
    const ancho = 560;                                     // medidas del dibujo (luego se estira al ancho disponible)
    const alto = 210;
    const arriba = 26;                                     // margen de arriba (para los % de encima)
    const abajo = 24;                                      // margen de abajo (letras de los días)
    const zona = alto - arriba - abajo;                    // la altura para las barras
    const maximo = Math.max(meta * 1.2, ...valores);       // el valor más alto: el objetivo + 20 %, o un día que lo pase
    const hueco = ancho / valores.length;                  // el espacio de cada día
    const anchoBarra = Math.min(38, hueco * 0.5);          // la barra: la mitad del hueco (como mucho 38)

    const y = v => arriba + zona - (v / maximo) * zona;    // valor -> altura del dibujo (en SVG, la y crece hacia ABAJO)

    const barras = valores.map((v, i) => {
        const x = i * hueco + (hueco - anchoBarra) / 2;    // la barra, centrada en su hueco
        const centro = i * hueco + hueco / 2;              // el centro (para los textos)
        const altoBarra = Math.max(0, (v / maximo) * zona);
        const esHoy = i === indiceHoy;
        return `
        <rect x="${x}" y="${arriba}" width="${anchoBarra}" height="${zona}" rx="${anchoBarra / 2}" class="fondo-barra" />
        ${v > 0 ? `<rect x="${x}" y="${y(v)}" width="${anchoBarra}" height="${altoBarra}" rx="${Math.min(anchoBarra / 2, altoBarra / 2)}" class="barra${esHoy ? ' barra-hoy' : ''}"><title>${mayusculaInicial(nombres[i])}: ${formatoNumero(v)} ${unidad}</title></rect>
        <text x="${centro}" y="${y(v) - 7}" class="porcentaje-barra${esHoy ? ' hoy' : ''}">${Math.round(v / meta * 100)}%</text>` : ''}
        <text x="${centro}" y="${alto - 5}" class="etiqueta-barra${esHoy ? ' hoy' : ''}">${INICIALES[i]}</text>`;
    }).join('');

    // la descripción para lectores de pantalla
    const descripcion = `${titulo} por día: ` + valores.map((v, i) => `${nombres[i]}, ${formatoNumero(v)} ${unidad}`).join('; ') + `. Objetivo: ${formatoNumero(meta)} ${unidad}.`;

    return `
      <svg class="grafico-semana" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="${escaparHtml(descripcion)}">
        <line x1="0" x2="${ancho}" y1="${y(meta)}" y2="${y(meta)}" class="linea-meta" />
        ${barras}
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

// Va a un día (null = hoy) y repinta
function irAFecha(fecha) {
    fechaVista = !fecha || fecha >= fechaHoy() ? null : fecha; // hoy o el futuro = "hoy"
    lineaEditando = null;                                  // al cambiar de día se cierra lo que estuviera abierto
    pintarDia();
}

// Vuelve a leer todo del almacén (al arrancar y cuando llegan datos de la nube)
function recargar() {
    historial = leerHistorial();
    objetivo = leerObjetivo();
    rellenarFormularioObjetivo();
    pintarDia();
}

// Después de repintar, devuelve el foco al mismo sitio (si no, quien usa teclado lo pierde al redibujarse la lista)
function enfocar(id, selector) {
    document.querySelector(`.fila-alimento[data-id="${id}"] ${selector}`)?.focus(); // "?." = si no existe, no hace nada
}

/* ---------- ARRANQUE: oyentes de la sección ---------- */

export function iniciarDia() {
    recargar();                                            // lee y pinta
    guardarHistorial();                                    // guarda ya en el formato nuevo (si había algo antiguo)
    alCambiarDatos(recargar);                              // si llegan datos de la nube, se recarga

    // Día / Semana
    document.querySelector('#btnVistaDia').addEventListener('click', () => cambiarVista('dia'));
    document.querySelector('#btnVistaSemana').addEventListener('click', () => cambiarVista('semana'));

    // flechas: una semana antes o después. "Volver a hoy"
    document.querySelector('#btnFechaAnterior').addEventListener('click', () => irAFecha(sumarDias(fechaActual(), -7)));
    document.querySelector('#btnFechaSiguiente').addEventListener('click', () => irAFecha(sumarDias(fechaActual(), 7)));
    document.querySelector('#btnIrHoy').addEventListener('click', () => irAFecha(null));

    // un día de la tira: se ve ese día (en la vista de día)
    document.querySelector('#diasTira').addEventListener('click', (e) => {
        const boton = e.target.closest('.dia-tira');
        if (!boton) return;
        vista = 'dia';
        irAFecha(boton.dataset.fecha);
        document.querySelector(`.dia-tira[data-fecha="${boton.dataset.fecha}"]`)?.focus(); // el foco sigue en el día pulsado (se ha redibujado)
    });

    // en la lista de la semana, al pulsar un día se abre ese día
    document.querySelector('#resumenSemana').addEventListener('click', (e) => {
        const boton = e.target.closest('.dia-semana');
        if (!boton) return;
        vista = 'dia';
        irAFecha(boton.dataset.fecha);
        document.querySelector('#btnVistaDia').focus();    // el botón pulsado ha desaparecido: llevamos el foco arriba (para quien usa teclado)
    });

    const comidas = document.querySelector('#comidasDia'); // el hueco de las cuatro comidas

    // clics: Añadir alimento, abrir/cerrar una fila, − +, Eliminar y Listo
    comidas.addEventListener('click', (e) => {
        const anadir = e.target.closest('.btn-anadir');    // ¿"Añadir alimento"?
        if (anadir) { abrirAnadir({ comida: anadir.dataset.comida }); return; }

        const fila = e.target.closest('.fila-alimento');   // ¿algo dentro de una fila?
        if (!fila) return;
        const { comida, id } = fila.dataset;               // sacamos data-comida y data-id de golpe
        const linea = buscarLinea(comida, id);
        if (!linea) return;

        if (e.target.closest('.fila-alimento-boton')) {    // pulsar la fila: se abre (o se cierra si ya estaba abierta)
            lineaEditando = lineaEditando === id ? null : id;
            pintarDia();
            if (lineaEditando) enfocar(id, linea.unidad === 'g' ? '.linea-gramos' : '.linea-mas'); // el cursor a la cantidad
            else enfocar(id, '.fila-alimento-boton');
            return;
        }

        if (e.target.closest('.linea-mas')) { cambiarCantidad(comida, id, linea.cantidad + 0.5); enfocar(id, '.linea-mas'); }        // media ración más
        else if (e.target.closest('.linea-menos')) { cambiarCantidad(comida, id, linea.cantidad - 0.5); enfocar(id, '.linea-menos'); } // media ración menos
        else if (e.target.closest('.linea-quitar')) { quitarLinea(comida, id); mostrarAviso(`${linea.nombre} eliminado`); }          // eliminar
        else if (e.target.closest('.linea-listo')) {                                                                                // listo: se cierra
            const casilla = fila.querySelector('.linea-gramos');
            if (casilla && Number(casilla.value) > 0) linea.cantidad = Number(casilla.value); // por si no se había "cambiado" aún
            lineaEditando = null;
            guardarHistorial();
            pintarDia();
            enfocar(id, '.fila-alimento-boton');
        }
    });

    // al terminar de escribir los gramos ("change") o pulsar Enter, se guardan
    comidas.addEventListener('change', (e) => {
        const casilla = e.target.closest('.linea-gramos');
        if (!casilla) return;
        const fila = casilla.closest('.fila-alimento');
        const gramos = Number(casilla.value);              // los gramos nuevos
        if (gramos > 0) cambiarCantidad(fila.dataset.comida, fila.dataset.id, gramos);
        else pintarDia();                                  // si no valen, vuelve el valor anterior
    });

    comidas.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.linea-gramos')) {     // Enter en los gramos = Listo
            e.preventDefault();
            e.target.closest('.fila-alimento').querySelector('.linea-listo').click();
        }
        if (e.key === 'Escape' && lineaEditando) {                        // Escape = cerrar sin más
            const id = lineaEditando;
            lineaEditando = null;
            pintarDia();
            enfocar(id, '.fila-alimento-boton');
        }
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
        mostrarAviso('Objetivo guardado');
    });

    document.querySelector('#btnObjetivoDefecto').addEventListener('click', () => { // "Restaurar"
        objetivo = { ...OBJETIVO_DEFECTO };
        guardar('objetivo', objetivo);
        rellenarFormularioObjetivo();
        pintarDia();
    });
}
