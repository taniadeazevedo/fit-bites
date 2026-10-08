'use strict'; // modo estricto: JavaScript avisa de errores típicos (por ejemplo, usar una variable sin declararla)

/* =====================================================================
   FIT BITES · app.js
   Idea general (el restaurante):
   - json-server / recetas.json = la despensa (donde están las recetas)
   - este archivo = el camarero: pide las recetas, las pone en la mesa
     (la página) y atiende lo que hace la persona (clics, formularios)
   ===================================================================== */

// ---------- CONSTANTES (valores que no cambian nunca: se escriben con const) ----------

const URL_RECETAS = 'http://localhost:3001/recetas/';      // dirección de la "ventanilla" de json-server (solo existe en tu ordenador)
const ARCHIVO_RECETAS = 'json/recetas.json';               // el mismo contenido como archivo normal: lo usa la web publicada

// location.hostname es el nombre de la dirección donde estás (por ejemplo "localhost" o "taniadeazevedo.github.io")
// .includes(...) comprueba si ese nombre está en la lista; el resultado es true o false
const EN_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname); // true = abierto desde tu ordenador; false = desde GitHub Pages

// ---------- VARIABLES DE ESTADO (valores que sí cambian mientras usas la web: se escriben con let) ----------

let modoLectura = true;        // true = solo se pueden ver las recetas (no crear, editar ni borrar)

let recetas = [];              // aquí se guarda la lista de recetas, una vez cargada
let ingredientesForm = [];     // ingredientes del formulario mientras se escriben (todavía sin guardar)
let kcalManual = false;        // true si la persona ha escrito las kcal a mano (entonces no se recalculan solas)
let recetaEditando = null;     // la receta que se está editando (null = estamos creando una nueva)
let idParaBorrar = null;       // el id de la receta que se va a borrar (lo apuntamos al abrir la confirmación)
let fotoForm = '';             // la foto del formulario convertida en texto (Base64); '' = sin foto
let recetaDetalleId = null;    // el id de la receta que se está viendo en la ventana de detalle
let tipoFiltro = '';           // el tipo de plato elegido en el desplegable de arriba ('' = todos)
let textoBusqueda = '';        // lo que se ha escrito en el buscador ('' = sin búsqueda)
let soloProteina = false;      // true = el interruptor "Alta en proteína" está activado

// Tipos de plato: salen en el formulario Y en el filtro. Para añadir uno nuevo, escríbelo aquí y listo
const TIPOS_PLATO = ['Bowl', 'Pasta', 'Ensalada', 'Hamburguesa', 'Fajita', 'Wrap', 'Sándwich', 'Arroz', 'Tortilla', 'Postre', 'Otro'];

// Una receta se considera "alta en proteína" si tiene al menos estos gramos (cámbialo si quieres ser más o menos exigente)
const PROTEINA_ALTA = 35;

// "Mi día" se guarda en el navegador (localStorage), no en recetas.json
const CLAVE_DIA = 'fitbites-dia';              // nombre con el que guardamos "lo de hoy" en el navegador
const CLAVE_OBJETIVO = 'fitbites-objetivo';    // nombre con el que guardamos tu objetivo diario

// Objetivo orientativo para ganar masa muscular (la persona lo puede cambiar en la web)
const OBJETIVO_DEFECTO = { kcal: 2100, proteina: 100, carbohidratos: 290, grasas: 60 }; // un objeto: cada dato tiene un nombre y un valor

let dia = { fecha: '', items: [] };        // el día actual: su fecha y la lista de platos. items: [{ id: '1', raciones: 1.5 }, ...]
let objetivo = { ...OBJETIVO_DEFECTO };    // "..." copia todos los datos del objeto por defecto: así lo podemos cambiar sin estropear el original

const MAX_CARACTERES_FOTO = 80000;   // tamaño máximo de la foto en texto (json-server solo admite ~100 KB por petición)

/* ---------- DATOS: hablar con json-server o con el archivo ---------- */

// "async" = esta función puede esperar a que lleguen datos sin congelar la página
async function cargarRecetas() {
    // En tu ordenador intenta usar json-server: así se puede crear, editar y borrar
    if (EN_LOCAL) {                                       // solo si la web está abierta en tu ordenador...
        try {                                             // "try" = intenta esto; si falla, salta al "catch"
            const respuesta = await fetch(URL_RECETAS);   // pide las recetas a json-server y ESPERA (await) la respuesta

            if (respuesta.ok) {                           // ok = el servidor contestó bien (códigos 200-299)
                modoLectura = false;                      // hay servidor: se puede editar
                return await respuesta.json();            // convierte el texto JSON en una lista y la devuelve
            }
        } catch (error) {                                 // si json-server está apagado, fetch falla y llegamos aquí
            console.info('json-server no responde: se lee el archivo en modo lectura'); // mensaje informativo en la consola
        }
    }

    // Sin json-server (por ejemplo, en GitHub Pages) se lee el archivo, solo para ver
    modoLectura = true;                                   // sin servidor: solo lectura

    const respuesta = await fetch(ARCHIVO_RECETAS);       // pide el archivo recetas.json como si fuera una página más

    if (!respuesta.ok) {                                  // "!" = NO. Si no se pudo leer el archivo...
        throw new Error('No se pudo leer ' + ARCHIVO_RECETAS + ' (' + respuesta.status + ')'); // ...lanza un error (lo recogerá quien llamó)
    }

    const datos = await respuesta.json();                 // convierte el JSON del archivo en un objeto
    return datos.recetas;                                 // el archivo tiene la forma { "recetas": [...] }: devolvemos solo la lista
}

// POST = crear una receta nueva en el servidor
async function guardarReceta(receta) {
    const respuesta = await fetch(URL_RECETAS, {          // segundo parámetro de fetch: las opciones de la petición
        method: 'POST',                                   // el "verbo": POST significa "crear"
        body: JSON.stringify(receta),                     // el cuerpo: la receta convertida de objeto a texto JSON
        headers: { 'Content-type': 'application/json' }   // cabecera: avisa de que lo que enviamos es JSON
    });

    if (!respuesta.ok) {                                  // si el servidor respondió con error...
        throw new Error('No se pudo guardar (' + respuesta.status + ')'); // ...lo convertimos en un error de JavaScript
    }

    return await respuesta.json();                        // devuelve la receta creada (con el id que le puso el servidor)
}

// PUT = reemplazar una receta que ya existe (editar)
async function actualizarReceta(receta) {
    const respuesta = await fetch(URL_RECETAS + receta.id, { // la dirección lleva el id: .../recetas/3
        method: 'PUT',                                    // PUT significa "actualizar"
        body: JSON.stringify(receta),                     // la receta completa, ya con los cambios, en texto JSON
        headers: { 'Content-type': 'application/json' }   // avisa de que es JSON
    });

    if (!respuesta.ok) {                                  // si algo fue mal...
        throw new Error('No se pudo actualizar (' + respuesta.status + ')'); // ...error
    }

    return await respuesta.json();                        // devuelve la receta ya actualizada
}

// DELETE = borrar una receta
async function borrarReceta(id) {
    const respuesta = await fetch(URL_RECETAS + id, { method: 'DELETE' }); // .../recetas/3 con el verbo DELETE

    if (!respuesta.ok) {                                  // si el servidor no pudo borrarla...
        throw new Error('No se pudo borrar (' + respuesta.status + ')'); // ...error
    }
}                                                         // no devuelve nada: borrar no necesita respuesta

/* ---------- UTILIDADES: funciones pequeñas que usan otras funciones ---------- */

// Convierte caracteres especiales para que un texto nunca se interprete como HTML
// (si alguien escribe <b>hola</b> como nombre, se verá tal cual y no se ejecutará)
function escaparHtml(texto) {
    return String(texto)                                  // aseguramos que es texto (aunque nos pasen un número)
        .replaceAll('&', '&amp;')                         // "&" pasa a "&amp;" (hay que hacerlo el primero)
        .replaceAll('<', '&lt;')                          // "<" pasa a "&lt;" (así no abre una etiqueta)
        .replaceAll('>', '&gt;')                          // ">" pasa a "&gt;"
        .replaceAll('"', '&quot;');                       // comillas dobles: no pueden romper un atributo HTML
}

// Reparto de calorías entre macros: proteína y carbohidratos 4 kcal/g, grasas 9 kcal/g
function porcentajesMacros(receta) {
    const kcalP = receta.proteina * 4;                    // calorías que aporta la proteína
    const kcalC = receta.carbohidratos * 4;               // calorías de los carbohidratos
    const kcalG = receta.grasas * 9;                      // calorías de las grasas (aportan más por gramo)
    const total = kcalP + kcalC + kcalG;                  // suma de las tres

    if (total === 0) {                                    // si no hay datos, evitamos dividir entre cero
        return { p: 0, c: 0, g: 0 };                      // y devolvemos todo a cero
    }

    return {                                              // devolvemos un objeto con los tres porcentajes
        p: Math.round(kcalP / total * 100),               // qué % del total es proteína (Math.round redondea)
        c: Math.round(kcalC / total * 100),               // qué % es carbohidratos
        g: Math.round(kcalG / total * 100)                // qué % es grasa
    };
}

/* ---------- FOTOS ---------- */

// Lee un archivo del ordenador y lo devuelve como texto (data URL)
// Una Promise es una "promesa": el resultado llegará más tarde, y quien la use puede esperarlo con await
function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {             // resolve = "todo bien, aquí está"; reject = "ha fallado"
        const lector = new FileReader();                  // FileReader es la herramienta del navegador para leer archivos
        lector.onload = () => resolve(lector.result);     // cuando termina de leer: entrega el resultado
        lector.onerror = () => reject(new Error('No se pudo leer el archivo')); // si falla: entrega un error
        lector.readAsDataURL(archivo);                    // empieza a leer y lo convierte a texto Base64
    });
}

// Convierte ese texto en una imagen que el navegador puede dibujar
function cargarImagen(url) {
    return new Promise((resolve, reject) => {             // otra promesa: cargar una imagen tarda un momento
        const imagen = new Image();                       // crea una imagen vacía en memoria
        imagen.onload = () => resolve(imagen);            // cuando carga bien: la entrega
        imagen.onerror = () => reject(new Error('El archivo no es una imagen válida')); // si no era una imagen: error
        imagen.src = url;                                 // le damos el texto: empieza a cargar
    });
}

// Dibuja la imagen en un lienzo (canvas) con un ancho máximo y la devuelve como JPEG en texto
function dibujarImagen(imagen, anchoMax, calidad) {
    const escala = Math.min(1, anchoMax / imagen.width);   // cuánto hay que reducirla; Math.min(1, ...) evita agrandarla
    const lienzo = document.createElement('canvas');       // un "canvas" es un lienzo en blanco donde se puede dibujar
    lienzo.width = Math.round(imagen.width * escala);      // ancho final del lienzo (redondeado)
    lienzo.height = Math.round(imagen.height * escala);    // alto final, con la misma proporción

    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height); // dibuja la foto en el lienzo, ya reducida

    return lienzo.toDataURL('image/jpeg', calidad);        // convierte el lienzo en texto JPEG; "calidad" va de 0 a 1
}

// Reduce la foto hasta que quepa: una foto de móvil pesa varios MB y
// json-server rechaza las peticiones de más de 100 KB
async function reducirImagen(archivo) {
    const imagen = await cargarImagen(await leerArchivo(archivo)); // primero lee el archivo y luego lo convierte en imagen (esperando cada paso)

    let ancho = 800;                                       // empezamos con 800 píxeles de ancho
    let calidad = 0.75;                                    // y calidad del 75 %
    let resultado = dibujarImagen(imagen, ancho, calidad); // primer intento

    while (resultado.length > MAX_CARACTERES_FOTO && ancho > 200) { // mientras pese demasiado (y no sea ya diminuta)...
        if (calidad > 0.5) {                               // ...si todavía podemos bajar la calidad...
            calidad -= 0.1;                                // primero baja la calidad (resta 0,1)
        } else {                                           // ...y si ya está baja...
            ancho = Math.round(ancho * 0.8);               // ...reducimos el tamaño un 20 %
        }
        resultado = dibujarImagen(imagen, ancho, calidad); // volvemos a intentarlo con los nuevos valores
    }

    if (resultado.length > MAX_CARACTERES_FOTO) {          // si aun así no cabe...
        throw new Error('La foto es demasiado grande');    // ...avisamos con un error
    }

    return resultado;                                      // devolvemos la foto ya reducida, en texto
}

// Solo se pintan fotos que de verdad sean una imagen (data:image/...)
function fotoValida(foto) {
    return typeof foto === 'string' && foto.startsWith('data:image/'); // tiene que ser texto Y empezar por "data:image/"
}

// Enseña u oculta la vista previa de la foto en el formulario
function mostrarVistaFoto() {
    const caja = document.querySelector('#vistaFotoCaja'); // busca en la página el elemento con id="vistaFotoCaja"

    if (fotoForm) {                                        // si hay foto (un texto no vacío cuenta como "verdadero")...
        document.querySelector('#vistaFoto').src = fotoForm; // ...la ponemos en la etiqueta <img>
        caja.classList.remove('d-none');                   // ...y mostramos la caja (d-none = oculto en Bootstrap)
    } else {                                               // si no hay foto...
        document.querySelector('#vistaFoto').removeAttribute('src'); // ...quitamos la imagen
        caja.classList.add('d-none');                      // ...y ocultamos la caja
    }
}

// Muestra u oculta lo que solo tiene sentido con json-server encendido
function aplicarModo() {
    // classList.toggle(clase, condición): pone la clase si la condición es true y la quita si es false
    document.querySelector('#btnNueva').classList.toggle('d-none', modoLectura); // en modo lectura se oculta "Nueva receta"

    // el aviso solo sale en tu ordenador (en la web publicada no hace falta)
    document.querySelector('#avisoLectura').classList.toggle('d-none', !(modoLectura && EN_LOCAL)); // visible solo si: modo lectura Y en local
}

// Enseña un mensaje que aparece abajo y desaparece solo (un "toast" de Bootstrap)
function mostrarAviso(texto) {
    const toast = document.querySelector('#toastAviso');   // el recuadro del aviso
    toast.querySelector('.toast-body').textContent = texto; // escribe el mensaje dentro (textContent no interpreta HTML)
    bootstrap.Toast.getOrCreateInstance(toast).show();     // le pide a Bootstrap que lo muestre
}

/* ---------- MI DÍA: lo que has comido hoy y tu objetivo ---------- */

// Fecha de hoy en formato 2026-10-08 (con la hora local, no la UTC)
function fechaHoy() {
    const ahora = new Date();                              // la fecha y hora actuales
    const mes = String(ahora.getMonth() + 1).padStart(2, '0'); // getMonth() cuenta desde 0 (enero = 0), por eso +1; padStart rellena con un 0: "8" -> "08"
    const diaMes = String(ahora.getDate()).padStart(2, '0');   // día del mes, también con dos cifras
    return `${ahora.getFullYear()}-${mes}-${diaMes}`;      // monta el texto con comillas inversas: ${...} mete valores dentro
}

// Lee de localStorage lo que llevas hoy
function leerDia() {
    try {                                                  // si lo guardado está roto, JSON.parse falla: por eso usamos try
        const guardado = JSON.parse(localStorage.getItem(CLAVE_DIA)); // lee el texto guardado y lo convierte en objeto

        if (guardado && guardado.fecha === fechaHoy() && Array.isArray(guardado.items)) { // existe, es de HOY y tiene una lista de platos
            return guardado;                               // sigue siendo hoy: se mantiene
        }
    } catch {
        // si lo guardado está roto, se empieza de cero (no hacemos nada y seguimos abajo)
    }

    return { fecha: fechaHoy(), items: [] };               // día nuevo: en blanco
}

// Guarda en localStorage lo que llevas hoy
function guardarDia() {
    localStorage.setItem(CLAVE_DIA, JSON.stringify(dia)); // localStorage solo guarda texto: JSON.stringify convierte el objeto en texto
}

// Lee tu objetivo diario (o el de por defecto)
function leerObjetivo() {
    try {                                                  // por si lo guardado está roto
        const guardado = JSON.parse(localStorage.getItem(CLAVE_OBJETIVO)); // lee y convierte a objeto

        // comprueba que están las 4 claves (kcal, proteina, ...) y que todas son números mayores que 0
        if (guardado && Object.keys(OBJETIVO_DEFECTO).every(k => Number(guardado[k]) > 0)) {
            return guardado;                               // es válido: lo usamos
        }
    } catch {
        // si está roto, se usa el objetivo por defecto
    }

    return { ...OBJETIVO_DEFECTO };                        // una copia del objetivo por defecto
}

// Guarda tu objetivo diario
function guardarObjetivo() {
    localStorage.setItem(CLAVE_OBJETIVO, JSON.stringify(objetivo)); // objeto -> texto -> localStorage
}

// Si ha cambiado el día mientras la web estaba abierta, empieza uno nuevo
function asegurarDiaActual() {
    if (dia.fecha !== fechaHoy()) {                        // si la fecha guardada ya no es la de hoy...
        dia = { fecha: fechaHoy(), items: [] };            // ...empezamos un día en blanco
        guardarDia();                                      // ...y lo guardamos
    }
}

// Añade una ración de una receta a "Mi día"
function anadirAlDia(id) {
    asegurarDiaActual();                                   // primero nos aseguramos de que "dia" es el de hoy

    // find() busca el primer elemento que cumpla la condición; comparamos como texto para que 1 y "1" cuenten igual
    const item = dia.items.find(i => String(i.id) === String(id));

    if (item) {                                            // si esa receta ya estaba en el día...
        item.raciones += 1;                                // ...sumamos una ración más
    } else {                                               // si no estaba...
        dia.items.push({ id: String(id), raciones: 1 });   // ...la añadimos a la lista con 1 ración (push = añadir al final)
    }

    guardarDia();                                          // guardamos el cambio en el navegador
    pintarDia();                                           // y refrescamos el panel
}

// Cambia las raciones de un plato (por ejemplo +0,5 o -0,5)
function cambiarRaciones(id, cambio) {
    const item = dia.items.find(i => String(i.id) === String(id)); // busca el plato
    if (!item) return;                                     // si no existe, no hacemos nada

    item.raciones += cambio;                               // suma (o resta, si "cambio" es negativo)

    if (item.raciones <= 0) {                              // si llega a cero (o menos)...
        quitarDelDia(id);                                  // ...lo quitamos de la lista
        return;                                            // ...y terminamos (quitarDelDia ya guarda y repinta)
    }

    guardarDia();                                          // guardamos
    pintarDia();                                           // refrescamos
}

// Quita un plato de "Mi día"
function quitarDelDia(id) {
    dia.items = dia.items.filter(i => String(i.id) !== String(id)); // filter() se queda con los que cumplen la condición: todos menos ese id
    guardarDia();                                          // guardamos
    pintarDia();                                           // refrescamos
}

// Suma lo de hoy: cada receta × sus raciones (si una receta ya no existe, se ignora)
function totalesDia() {
    const totales = { kcal: 0, proteina: 0, carbohidratos: 0, grasas: 0 }; // empezamos con todo a cero

    for (const item of dia.items) {                        // recorre cada plato de hoy, uno por uno
        const receta = recetas.find(r => String(r.id) === String(item.id)); // busca su receta completa
        if (!receta) continue;                             // si la receta ya no existe, saltamos al siguiente plato

        totales.kcal += receta.kcal * item.raciones;               // suma las kcal (por las raciones)
        totales.proteina += receta.proteina * item.raciones;       // suma la proteína
        totales.carbohidratos += receta.carbohidratos * item.raciones; // suma los carbohidratos
        totales.grasas += receta.grasas * item.raciones;           // suma las grasas
    }

    return totales;                                        // devuelve el resultado
}

// Da formato a un número según el español: 1.234,5
function formatoNumero(n, decimales = 0) {                 // si no indicas decimales, vale 0
    return n.toLocaleString('es-ES', { maximumFractionDigits: decimales }); // toLocaleString escribe el número a la española
}

// Dibuja el panel "Mi día": contador, fecha, barras de progreso y lista de platos
function pintarDia() {
    asegurarDiaActual();                                   // comprueba que seguimos en el día de hoy

    const totales = totalesDia();                          // suma de todo lo de hoy
    const lineas = dia.items                               // empezamos con los platos de hoy...
        .map(item => ({ item, receta: recetas.find(r => String(r.id) === String(item.id)) })) // ...map() transforma cada plato en { plato, su receta }
        .filter(l => l.receta);                            // ...y nos quedamos solo con los que tienen receta (por si se borró alguna)

    // contador del menú y fecha
    document.querySelector('#contadorDia').textContent = lineas.length; // el número que sale junto a "Mi día" en el menú
    const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); // "jueves, 8 de octubre"
    document.querySelector('#fechaDia').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1); // pone la primera letra en mayúscula

    // progreso frente al objetivo
    const filas = [                                        // una lista con los datos de cada barra
        { clave: 'kcal', nombre: 'Kcal', unidad: 'kcal', clase: 'barra-kcal' },
        { clave: 'proteina', nombre: 'Proteína', unidad: 'g', clase: 'macro-p' },
        { clave: 'carbohidratos', nombre: 'Carbohidratos', unidad: 'g', clase: 'macro-c' },
        { clave: 'grasas', nombre: 'Grasas', unidad: 'g', clase: 'macro-g' }
    ];

    // map() crea un trozo de HTML por cada barra; join('') los une todos en un solo texto
    document.querySelector('#progresoDia').innerHTML = filas.map(f => {
        const valor = totales[f.clave];                    // lo que llevas hoy de ese nutriente (totales["kcal"], totales["proteina"]...)
        const meta = objetivo[f.clave];                    // tu objetivo para ese nutriente
        const porcentaje = Math.min(100, Math.round(valor / meta * 100)); // % conseguido, con tope en 100 para que la barra no se salga
        const diferencia = Math.round(meta - valor);       // cuánto falta (si es negativo, te has pasado)

        // operador ternario: condición ? si_es_verdadera : si_es_falsa
        const estado = diferencia >= 0
            ? `faltan ${formatoNumero(diferencia)} ${f.unidad}`                                   // te falta algo
            : `<span class="excedido">+${formatoNumero(-diferencia)} ${f.unidad} de más</span>`;  // te has pasado (se pinta en otro color)

        // el HTML de una barra: título, números y la barra con su ancho en %
        return `
      <div class="fila-progreso">
        <div class="d-flex justify-content-between small mb-1">
          <strong>${f.nombre}</strong>
          <span>${formatoNumero(valor)} / ${formatoNumero(meta)} ${f.unidad} · ${estado}</span>
        </div>
        <div class="progress" role="progressbar" aria-label="${f.nombre}" aria-valuenow="${porcentaje}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar ${f.clase}" style="width: ${porcentaje}%"></div>
        </div>
      </div>`;
    }).join('');

    // lista de lo comido hoy
    const contenedor = document.querySelector('#lineasDia'); // el hueco donde va la lista

    if (lineas.length === 0) {                             // si todavía no hay nada...
        contenedor.innerHTML = '<p class="text-body-secondary">Todavía no has añadido nada. Pulsa «Mi día» en una receta.</p>'; // ...mensaje de ayuda
        return;                                            // ...y terminamos aquí
    }

    // un trozo de HTML por plato: nombre, kcal, botones − y +, y botón de quitar
    // ({ item, receta }) saca esas dos partes de cada línea directamente
    contenedor.innerHTML = lineas.map(({ item, receta }) => `
      <div class="linea-dia" data-id="${escaparHtml(item.id)}">
        <div class="flex-grow-1">
          <div class="fw-semibold">${escaparHtml(receta.nombre)}</div>
          <small class="text-body-secondary">${formatoNumero(receta.kcal * item.raciones)} kcal · P ${formatoNumero(receta.proteina * item.raciones, 1)} g</small>
        </div>
        <div class="btn-group btn-group-sm" role="group" aria-label="Raciones">
          <button type="button" class="btn btn-outline-dark dia-menos" aria-label="Media ración menos">−</button>
          <span class="btn btn-outline-dark disabled">× ${formatoNumero(item.raciones, 1)}</span>
          <button type="button" class="btn btn-outline-dark dia-mas" aria-label="Media ración más">+</button>
        </div>
        <button type="button" class="btn btn-link btn-sm text-danger px-1 dia-quitar" aria-label="Quitar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>`).join('');
}

// Rellena el formulario del objetivo con los valores actuales
function rellenarFormularioObjetivo() {
    const f = document.querySelector('#formObjetivo');     // el formulario
    f.kcal.value = objetivo.kcal;                          // f.kcal es el campo con name="kcal"; .value es lo que contiene
    f.proteina.value = objetivo.proteina;                  // campo de proteína
    f.carbohidratos.value = objetivo.carbohidratos;        // campo de carbohidratos
    f.grasas.value = objetivo.grasas;                      // campo de grasas
}

/* ---------- FILTRO POR TIPO DE PLATO ---------- */

// Rellena los dos desplegables de tipo de plato (el del filtro y el del formulario) con la lista TIPOS_PLATO
function rellenarTipos() {
    const filtro = document.querySelector('#filtroTipo');       // el desplegable de arriba, para filtrar
    const formulario = document.querySelector('#recTipo');      // el desplegable del formulario de receta

    for (const tipo of TIPOS_PLATO) {                           // por cada tipo de la lista...
        filtro.add(new Option(tipo, tipo));                     // ...añade una opción al filtro (new Option(texto, valor))
        formulario.add(new Option(tipo, tipo));                 // ...y otra al formulario
    }
}

// Pasa un texto a minúsculas y le quita las tildes, para que "salmon" encuentre "Salmón"
function normalizarTexto(texto) {
    return String(texto)                                       // aseguramos que es texto
        .normalize('NFD')                                      // separa cada letra de su tilde: "ó" pasa a "o" + "´"
        .replace(/[\u0300-\u036f]/g, '')                      // borra esas tildes sueltas (el rango \u0300-\u036f son las marcas de tilde)
        .toLowerCase();                                        // todo en minúsculas
}

// Devuelve las recetas que cumplen el tipo elegido, lo escrito en el buscador Y el interruptor de proteína
function recetasFiltradas() {
    const busqueda = normalizarTexto(textoBusqueda.trim());    // lo escrito, sin espacios sobrantes y sin tildes

    return recetas.filter(r => {                               // filter se queda con las recetas para las que esto devuelva true
        const coincideTipo = tipoFiltro === '' || r.tipo === tipoFiltro; // sin tipo elegido, valen todas; si no, el tipo debe coincidir

        // el texto donde buscamos: el nombre y todos los ingredientes (join une la lista en un solo texto)
        const textoReceta = normalizarTexto(r.nombre + ' ' + (r.ingredientes ?? []).join(' '));
        const coincideTexto = busqueda === '' || textoReceta.includes(busqueda); // sin búsqueda valen todas; si no, el texto debe contenerla

        const coincideProteina = !soloProteina || r.proteina >= PROTEINA_ALTA; // interruptor apagado: valen todas; encendido: solo las que llegan al mínimo de proteína

        return coincideTipo && coincideTexto && coincideProteina; // la receta se muestra solo si cumple las tres condiciones (&& = Y)
    });
}

// Pinta las recetas aplicando los filtros que haya puestos (tipo y buscador)
function mostrarRecetas() {
    pintarRecetas(recetasFiltradas());                          // pintarRecetas dibuja la lista que le pasemos
}

/* ---------- PINTAR LA LISTA DE RECETAS ---------- */

// Recibe una lista de recetas y crea una tarjeta en la página por cada una
function pintarRecetas(lista) {
    const contenedor = document.querySelector('#listaRecetas'); // el hueco de la página donde van las tarjetas
    contenedor.innerHTML = '';                             // lo vaciamos antes de pintar (si no, se repetirían)

    if (lista.length === 0) {                              // si no hay ninguna receta...
        const hayFiltro = tipoFiltro !== '' || textoBusqueda.trim() !== '' || soloProteina; // ¿hay algún filtro o búsqueda puestos?
        const mensaje = hayFiltro ? 'No hay recetas que coincidan con lo que buscas.' : 'Aún no hay recetas. ¡Añade la primera!'; // ...el mensaje depende de si hay un filtro puesto
        contenedor.innerHTML = `<p class="text-body-secondary">${mensaje}</p>`; // ...y lo escribimos
        pintarDia();                                       // ...refrescamos "Mi día"
        return;                                            // ...y terminamos
    }

    for (const receta of lista) {                          // for...of: repite lo de dentro una vez por cada receta
        const pct = porcentajesMacros(receta);             // los % de proteína, carbohidratos y grasas
        const numIngredientes = (receta.ingredientes ?? []).length; // cuántos ingredientes tiene; "?? []" = si no tiene la lista, usa una vacía

        const col = document.createElement('div');         // crea un <div> nuevo (todavía fuera de la página)
        col.className = 'col';                             // le pone la clase "col" de Bootstrap (una columna de la rejilla)

        // Dentro de las comillas inversas va el HTML de la tarjeta; ${...} inserta valores de la receta.
        // - La foto: si es válida se pinta la imagen; si no, un icono de huevo frito
        // - Las 3 barras de colores usan los porcentajes (pct) como ancho
        // - Arriba a la izquierda sale una etiqueta con el tipo de plato (Bowl, Pasta...), si la receta lo tiene
        //   y otra, de color lima y con un 🔥, con "Alta en proteína" si llega al mínimo (PROTEINA_ALTA)
        // - El botón "Mi día" sale siempre; "Editar" y "Borrar" solo si no estamos en modo lectura
        col.innerHTML = `
      <article class="card h-100 border-0 shadow-sm receta" data-id="${receta.id}">
        <div class="receta-img ratio ratio-4x3 rounded-top">
          ${fotoValida(receta.foto)
            ? `<img src="${escaparHtml(receta.foto)}" class="receta-foto" alt="Foto de ${escaparHtml(receta.nombre)}">`
            : `<div class="d-flex align-items-center justify-content-center"><i class="bi bi-egg-fried fs-1"></i></div>`}
        </div>

        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="d-flex flex-wrap gap-1">
              ${receta.tipo ? `<span class="recipe-tag">${escaparHtml(receta.tipo)}</span>` : ''}
              ${receta.proteina >= PROTEINA_ALTA ? `<span class="recipe-tag recipe-tag--protein">🔥 Alta en proteína</span>` : ''}
            </span>
            <small class="text-body-secondary"><i class="bi bi-clock"></i> ${receta.tiempo} min</small>
          </div>

          <h3 class="h5">${escaparHtml(receta.nombre)}</h3>
          <p class="mb-3"><strong class="fs-4">${receta.kcal}</strong> kcal</p>

          <div class="progress-stacked mb-2" aria-label="Reparto de macros">
            <div class="progress" role="progressbar" style="width: ${pct.p}%"><div class="progress-bar macro-p"></div></div>
            <div class="progress" role="progressbar" style="width: ${pct.c}%"><div class="progress-bar macro-c"></div></div>
            <div class="progress" role="progressbar" style="width: ${pct.g}%"><div class="progress-bar macro-g"></div></div>
          </div>

          <div class="d-flex justify-content-between small mb-3">
            <span><i class="punto macro-p"></i> P ${receta.proteina} g</span>
            <span><i class="punto macro-c"></i> C ${receta.carbohidratos} g</span>
            <span><i class="punto macro-g"></i> G ${receta.grasas} g</span>
          </div>

          <small class="text-body-secondary d-block"><i class="bi bi-basket"></i> ${numIngredientes} ingredientes · Ver receta</small>

          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-verde btn-sm btn-dia" data-id="${receta.id}">
              <i class="bi bi-plus-lg"></i> Mi día
            </button>
            ${modoLectura ? '' : `
            <button type="button" class="btn btn-outline-dark btn-sm btn-editar" data-id="${receta.id}">
              <i class="bi bi-pencil-fill"></i> Editar
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-borrar"
              data-bs-toggle="modal" data-bs-target="#modalBorrar"
              data-id="${receta.id}" data-nombre="${escaparHtml(receta.nombre)}">
              <i class="bi bi-trash-fill"></i> Borrar
            </button>`}
          </div>
        </div>
      </article>`;

        contenedor.appendChild(col);                       // ahora sí: metemos la tarjeta dentro de la página (appendChild = añadir al final)
    }

    pintarDia();     // las recetas han cambiado: recalcula "Mi día"
}

/* ---------- DETALLE DE LA RECETA ---------- */

// Rellena y abre la ventana con el detalle de una receta
function abrirDetalle(id) {
    const receta = recetas.find(r => String(r.id) === String(id)); // busca la receta por su id
    if (!receta) return;                                   // si no la encuentra, no hacemos nada

    recetaDetalleId = receta.id;                           // apuntamos cuál estamos viendo (para el botón "Añadir a mi día")
    document.querySelector('#detalleTitulo').textContent = receta.nombre; // el título de la ventana

    const foto = document.querySelector('#detalleFoto');   // la etiqueta <img> de la ventana
    if (fotoValida(receta.foto)) {                         // si la receta tiene foto válida...
        foto.src = receta.foto;                            // ...la mostramos
        foto.alt = 'Foto de ' + receta.nombre;             // ...con un texto alternativo (para lectores de pantalla)
        foto.classList.remove('d-none');                   // ...y la hacemos visible
    } else {                                               // si no tiene foto...
        foto.removeAttribute('src');                       // ...quitamos la imagen
        foto.classList.add('d-none');                      // ...y la ocultamos
    }
    document.querySelector('#detalleMeta').textContent =   // línea con tipo, categoría, tiempo y kcal
        `${receta.tipo ? receta.tipo + ' · ' : ''}${receta.categoria} · ${receta.tiempo} min · ${receta.kcal} kcal`; // si la receta tiene tipo, lo pone delante
    document.querySelector('#detalleMacros').textContent = // línea con los macros
        `P ${receta.proteina} g · C ${receta.carbohidratos} g · G ${receta.grasas} g`;

    const lista = document.querySelector('#detalleIngredientes'); // la lista <ul> de ingredientes
    lista.innerHTML = '';                                  // la vaciamos

    for (const ingrediente of receta.ingredientes ?? []) { // por cada ingrediente (o ninguno, si no hay lista)...
        const li = document.createElement('li');           // ...creamos un <li>
        li.textContent = ingrediente;                      // ...le ponemos el texto del ingrediente
        lista.appendChild(li);                             // ...y lo metemos en la lista
    }

    bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalDetalle')).show(); // le pedimos a Bootstrap que abra la ventana
}

/* ---------- FORMULARIO: INGREDIENTES ---------- */

// Dibuja los ingredientes del formulario como "etiquetas" con una × para quitarlos
function pintarIngredientes() {
    const lista = document.querySelector('#listaIngredientes'); // el hueco donde van las etiquetas
    lista.innerHTML = '';                                  // lo vaciamos

    // forEach recorre la lista; "indice" es la posición (0, 1, 2...) de cada ingrediente
    ingredientesForm.forEach((ingrediente, indice) => {
        const li = document.createElement('li');           // un <li> por ingrediente
        li.className = 'chip-ingrediente';                 // clase CSS que le da forma de etiqueta
        // el botón guarda su posición en data-indice para saber cuál quitar
        li.innerHTML = `
      <span>${escaparHtml(ingrediente)}</span>
      <button type="button" data-indice="${indice}" aria-label="Quitar ${escaparHtml(ingrediente)}">×</button>`;
        lista.appendChild(li);                             // lo metemos en la lista
    });

    if (ingredientesForm.length > 0) {                     // si ya hay al menos un ingrediente...
        document.querySelector('#errorIngredientes').classList.add('d-none'); // ...ocultamos el aviso "añade al menos uno"
    }
}

// Añade a la lista el ingrediente que se ha escrito en el campo
function anadirIngrediente() {
    const campo = document.querySelector('#campoIngrediente'); // la casilla de texto
    const texto = campo.value.trim();                      // lo escrito, sin espacios al principio ni al final

    if (texto === '') return;                              // si está vacío, no hacemos nada

    ingredientesForm.push(texto);                          // lo añadimos a la lista
    campo.value = '';                                      // vaciamos la casilla para el siguiente
    campo.focus();                                         // ponemos el cursor otra vez en la casilla

    pintarIngredientes();                                  // refrescamos las etiquetas
}

/* ---------- FORMULARIO: NUEVA RECETA / EDITAR ---------- */

// Calcula las kcal a partir de los macros (si la persona no las ha escrito a mano)
function calcularKcalAuto() {
    if (kcalManual) return;                                // si las escribió a mano, no las tocamos

    const f = document.querySelector('#formReceta');       // el formulario
    const proteina = Number(f.proteina.value) || 0;        // Number() convierte el texto en número; "|| 0" = si no es número válido, usa 0
    const carbohidratos = Number(f.carbohidratos.value) || 0;
    const grasas = Number(f.grasas.value) || 0;

    f.kcal.value = Math.round(proteina * 4 + carbohidratos * 4 + grasas * 9); // proteína y carbos 4 kcal/g, grasas 9 kcal/g
}

// Abre el formulario: vacío (receta nueva) o relleno (editar una receta)
function abrirFormulario(receta = null) {                  // si no le pasas receta, vale null = nueva
    const f = document.querySelector('#formReceta');       // el formulario
    f.reset();                                             // lo vacía
    f.classList.remove('was-validated');                   // quita los avisos rojos de una validación anterior

    recetaEditando = receta;                               // apuntamos qué receta editamos (o null si es nueva)

    // ternario: si hay receta el título es "Editar receta"; si no, "Nueva receta"
    document.querySelector('#tituloReceta').textContent = receta ? 'Editar receta' : 'Nueva receta';
    document.querySelector('#btnGuardarReceta').textContent = receta ? 'Guardar cambios' : 'Guardar receta';

    if (receta) {                                          // si estamos EDITANDO: rellenamos cada campo con los datos de la receta
        f.nombre.value = receta.nombre;
        f.categoria.value = receta.categoria;
        f.tipo.value = receta.tipo ?? '';                  // el tipo; "?? ''" = si la receta no tiene tipo, se queda en "Elige…"
        f.tiempo.value = receta.tiempo;
        f.kcal.value = receta.kcal;
        f.proteina.value = receta.proteina;
        f.carbohidratos.value = receta.carbohidratos;
        f.grasas.value = receta.grasas;

        ingredientesForm = [...(receta.ingredientes ?? [])];   // una COPIA de la lista ("..."), para no tocar la original
        kcalManual = true;                                      // respeta las kcal guardadas (no las recalcula)
        fotoForm = fotoValida(receta.foto) ? receta.foto : '';  // la foto actual, si es válida
    } else {                                               // si es una receta NUEVA: todo en blanco
        ingredientesForm = [];
        kcalManual = false;
        fotoForm = '';
    }

    pintarIngredientes();                                  // dibuja las etiquetas de ingredientes
    mostrarVistaFoto();                                    // enseña u oculta la vista previa de la foto
    document.querySelector('#errorFoto').classList.add('d-none');          // oculta posibles errores anteriores
    document.querySelector('#errorIngredientes').classList.add('d-none');

    bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalReceta')).show(); // abre la ventana del formulario
}

// Se ejecuta al enviar el formulario: valida, guarda (POST o PUT) y refresca la lista
async function enviarFormulario(e) {                       // "e" es el evento "submit"
    e.preventDefault();                                    // evita que el formulario recargue la página (su comportamiento normal)

    const f = e.target;                                    // e.target = el formulario que se envió
    const faltanIngredientes = ingredientesForm.length === 0; // true si no hay ningún ingrediente

    if (!f.checkValidity() || faltanIngredientes) {        // si algún campo obligatorio está mal, O faltan ingredientes...
        f.classList.add('was-validated');                  // ...Bootstrap pinta los errores en rojo
        document.querySelector('#errorIngredientes').classList.toggle('d-none', !faltanIngredientes); // y enseña el aviso de ingredientes solo si faltan
        return;                                            // ...y no seguimos
    }

    const datos = {                                        // montamos el objeto con la receta
        nombre: f.nombre.value.trim(),                     // .trim() quita espacios sobrantes
        categoria: f.categoria.value,
        tipo: f.tipo.value,                                // el tipo de plato elegido en el desplegable
        tiempo: Number(f.tiempo.value),                    // los campos dan texto: Number() los convierte en números
        kcal: Number(f.kcal.value),
        proteina: Number(f.proteina.value),
        carbohidratos: Number(f.carbohidratos.value),
        grasas: Number(f.grasas.value),
        ingredientes: ingredientesForm,
        foto: fotoForm
    };

    try {                                                  // intentamos guardar; si algo falla, saltamos al catch
        if (recetaEditando) {                              // si estábamos editando...
            await actualizarReceta({ ...datos, id: recetaEditando.id });   // PUT: editar ("..." copia los datos y le añadimos el id)
        } else {                                           // si era nueva...
            await guardarReceta(datos);                                     // POST: crear
        }

        const mensaje = recetaEditando ? 'Cambios guardados ✓' : 'Receta guardada ✓'; // el mensaje según el caso

        recetas = await cargarRecetas();                   // volvemos a pedir la lista al servidor (ya con el cambio)
        mostrarRecetas();                            // y la volvemos a dibujar

        bootstrap.Modal.getInstance(document.querySelector('#modalReceta')).hide(); // cerramos la ventana del formulario
        mostrarAviso(mensaje);                             // y enseñamos el aviso verde
    } catch (error) {                                      // si algo falló (servidor apagado, etc.)...
        console.error('Error al guardar la receta:', error); // ...lo apuntamos en la consola (para ti)
        mostrarAviso('No se pudo guardar. ¿Está encendido json-server?'); // ...y avisamos a la persona
    }
}

/* ---------- ARRANQUE: lo primero que se ejecuta ---------- */

async function iniciar() {
    dia = leerDia();                                       // recupera "lo de hoy" del navegador
    objetivo = leerObjetivo();                             // recupera tu objetivo
    rellenarFormularioObjetivo();                          // lo pone en el formulario del objetivo
    rellenarTipos();                                       // llena los desplegables de tipo de plato (filtro y formulario)

    try {                                                  // intentamos cargar las recetas
        recetas = await cargarRecetas();                   // las pide (a json-server o al archivo)
        mostrarRecetas();                            // dibuja las tarjetas
        aplicarModo();                                     // muestra u oculta los botones según el modo
    } catch (error) {                                      // si no se pudo cargar nada...
        console.error('No se pudieron cargar las recetas:', error); // ...lo apuntamos en la consola

        // ...y enseñamos un aviso amarillo en la página
        document.querySelector('#listaRecetas').innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning mb-0">
          No se pudieron cargar las recetas.
          ${EN_LOCAL ? '<br>Comprueba que existe <code>json/recetas.json</code>.' : ''}
        </div>
      </div>`;
    }

    // ---- A partir de aquí: "oyentes" (listeners). Cada uno espera un evento y, cuando ocurre, ejecuta una función ----
    // Son como el camarero con la oreja atenta a la campanilla de la mesa.

    // abrir el formulario para una receta nueva
    // () => abrirFormulario() es una "función flecha": una forma corta de escribir una función
    document.querySelector('#btnNueva').addEventListener('click', () => abrirFormulario());

    // filtro por tipo de plato: al elegir otra opción, apuntamos el tipo y repintamos
    document.querySelector('#filtroTipo').addEventListener('change', (e) => { // "change" = cuando se elige otra opción del desplegable
        tipoFiltro = e.target.value;                       // el valor elegido ('' si es "Todos")
        mostrarRecetas();                                  // repinta solo las recetas de ese tipo
    });

    // buscador: cada vez que se escribe o se borra una letra, apuntamos el texto y repintamos
    document.querySelector('#buscador').addEventListener('input', (e) => { // "input" = cada vez que cambia lo escrito
        textoBusqueda = e.target.value;                    // lo que hay escrito ahora mismo en la casilla
        mostrarRecetas();                                  // repinta solo las recetas que coinciden
    });

    // interruptor "Alta en proteína": al activarlo o desactivarlo, apuntamos su estado y repintamos
    document.querySelector('#filtroProteina').addEventListener('change', (e) => { // "change" = cuando se marca o desmarca
        soloProteina = e.target.checked;                   // checked es true si está activado y false si no
        mostrarRecetas();                                  // repinta solo las recetas que cumplen
    });

    // clics en las tarjetas: editar, borrar (lo gestiona Bootstrap) o abrir el detalle
    // Ponemos UN solo oyente en toda la lista (delegación de eventos): sirve para todas las tarjetas, aunque se creen después
    document.querySelector('#listaRecetas').addEventListener('click', (e) => {
        const botonDia = e.target.closest('.btn-dia');     // closest() sube desde donde se hizo clic hasta encontrar un elemento con esa clase (o null)

        if (botonDia) {                                    // si el clic fue en el botón "Mi día"...
            anadirAlDia(botonDia.dataset.id);              // ...añadimos la receta (dataset.id lee el atributo data-id del botón)
            mostrarAviso('Añadido a Mi día ✓');            // ...avisamos
            return;                                        // ...y no seguimos (para no abrir también el detalle)
        }

        const botonEditar = e.target.closest('.btn-editar'); // ¿fue en el botón "Editar"?

        if (botonEditar) {                                 // si sí...
            const receta = recetas.find(r => String(r.id) === botonEditar.dataset.id); // buscamos esa receta
            if (receta) abrirFormulario(receta);           // ...y abrimos el formulario relleno
            return;                                        // ...y terminamos
        }

        if (e.target.closest('.btn-borrar')) return;   // el modal de borrado se abre solo (data-bs-toggle): aquí no hacemos nada

        const tarjeta = e.target.closest('.receta');       // ¿fue en cualquier otra parte de una tarjeta?
        if (tarjeta) abrirDetalle(tarjeta.dataset.id);     // si sí, abrimos el detalle de esa receta
    });

    // modal de confirmación: se prepara justo antes de abrirse
    const modalBorrar = document.querySelector('#modalBorrar'); // la ventana de "¿Seguro?"

    // "show.bs.modal" es un evento de Bootstrap: ocurre justo antes de que se muestre la ventana
    modalBorrar.addEventListener('show.bs.modal', (e) => {
        const boton = e.relatedTarget;                 // el botón "Borrar" que ha abierto la ventana (así sabemos de qué receta se trata)
        idParaBorrar = boton.dataset.id;               // apuntamos su id (data-id)
        document.querySelector('#textoBorrar').textContent = // escribimos la pregunta con el nombre de la receta
            `¿Seguro que quieres borrar «${boton.dataset.nombre}»?`;
    });

    // botón "Sí, borrar" de la ventana de confirmación
    document.querySelector('#btnConfirmarBorrado').addEventListener('click', async () => {
        try {                                              // intentamos borrar
            await borrarReceta(idParaBorrar);              // DELETE al servidor

            recetas = await cargarRecetas();               // pedimos la lista actualizada
            mostrarRecetas();                        // la dibujamos
            mostrarAviso('Receta borrada');                // avisamos
        } catch (error) {                                  // si falla...
            console.error('Error al borrar la receta:', error); // ...consola
            mostrarAviso('No se pudo borrar. ¿Está encendido json-server?'); // ...aviso
        }
    });

    // ingredientes: botón, tecla Enter y quitar
    document.querySelector('#btnAnadirIngrediente').addEventListener('click', anadirIngrediente); // al pulsar "Añadir" se llama a la función (sin paréntesis: le pasamos la función, no la ejecutamos)

    document.querySelector('#campoIngrediente').addEventListener('keydown', (e) => { // "keydown" = al pulsar una tecla en la casilla
        if (e.key === 'Enter') {                       // si la tecla es Enter...
            e.preventDefault();          // Enter no debe enviar el formulario entero
            anadirIngrediente();                       // ...añadimos el ingrediente
        }
    });

    document.querySelector('#listaIngredientes').addEventListener('click', (e) => { // clics en las etiquetas de ingredientes
        const boton = e.target.closest('button');      // ¿fue en el botón × de alguna?
        if (!boton) return;                            // si no, no hacemos nada

        ingredientesForm.splice(Number(boton.dataset.indice), 1); // splice(posición, cuántos) quita elementos de la lista: aquí, 1 en esa posición
        pintarIngredientes();                          // refrescamos las etiquetas
    });

    // kcal automáticas a partir de los macros (hasta que se escriban a mano)
    for (const nombre of ['proteina', 'carbohidratos', 'grasas']) { // repetimos para los tres campos...
        // `...${nombre}...` monta el selector: #formReceta [name="proteina"], etc.
        document.querySelector(`#formReceta [name="${nombre}"]`).addEventListener('input', calcularKcalAuto); // "input" = cada vez que se escribe algo
    }

    document.querySelector('#formReceta [name="kcal"]').addEventListener('input', () => { // si alguien escribe en el campo de kcal...
        kcalManual = true;                             // ...apuntamos que lo ha hecho a mano (ya no se recalcula solo)
    });

    // foto: elegir o hacer una foto, reducirla y mostrar la vista previa
    document.querySelector('#recFoto').addEventListener('change', async (e) => { // "change" = cuando se elige un archivo
        const archivo = e.target.files[0];             // el primer archivo elegido (files es una lista)
        const error = document.querySelector('#errorFoto'); // el sitio donde se escribe un posible error
        error.classList.add('d-none');                 // lo ocultamos de momento

        if (!archivo) return;                          // si no hay archivo (se canceló), terminamos

        if (!archivo.type.startsWith('image/')) {      // si el tipo de archivo no empieza por "image/", no es una imagen
            error.textContent = 'Elige un archivo de imagen.'; // escribimos el error
            error.classList.remove('d-none');          // lo mostramos
            e.target.value = '';                       // vaciamos la selección
            return;                                    // y terminamos
        }

        try {                                          // si es una imagen, la reducimos
            fotoForm = await reducirImagen(archivo);   // la reduce y guarda el texto resultante
            mostrarVistaFoto();                        // enseña la vista previa
        } catch (err) {                                // si algo falla al reducirla...
            console.error('Error con la foto:', err);  // ...consola
            error.textContent = 'No se pudo usar esa imagen. Prueba con otra.'; // ...mensaje de error
            error.classList.remove('d-none');          // ...lo mostramos
        }
    });

    document.querySelector('#btnQuitarFoto').addEventListener('click', () => { // botón "Quitar foto"
        fotoForm = '';                                 // olvidamos la foto
        document.querySelector('#recFoto').value = ''; // vaciamos el selector de archivo
        mostrarVistaFoto();                            // y ocultamos la vista previa
    });

    // Mi día: añadir desde el detalle, cambiar raciones, quitar, vaciar y objetivo
    document.querySelector('#detalleAnadirDia').addEventListener('click', () => { // botón "Añadir a mi día" de la ventana de detalle
        anadirAlDia(recetaDetalleId);                  // añadimos la receta que se está viendo
        bootstrap.Modal.getInstance(document.querySelector('#modalDetalle')).hide(); // cerramos la ventana
        mostrarAviso('Añadido a Mi día ✓');            // avisamos
    });

    document.querySelector('#lineasDia').addEventListener('click', (e) => { // clics dentro de la lista de "Mi día"
        const linea = e.target.closest('.linea-dia');  // ¿en qué plato se hizo clic?
        if (!linea) return;                            // si fue fuera de un plato, no hacemos nada

        const id = linea.dataset.id;                   // el id de ese plato (guardado en data-id)

        if (e.target.closest('.dia-mas')) {            // si se pulsó "+"...
            cambiarRaciones(id, 0.5);                  // ...media ración más
        } else if (e.target.closest('.dia-menos')) {   // si se pulsó "−"...
            cambiarRaciones(id, -0.5);                 // ...media ración menos
        } else if (e.target.closest('.dia-quitar')) {  // si se pulsó la "x"...
            quitarDelDia(id);                          // ...quitamos el plato
        }
    });

    document.querySelector('#btnVaciarDia').addEventListener('click', () => { // botón "Vaciar día"
        if (dia.items.length === 0) return;            // si ya está vacío, no hacemos nada

        if (confirm('¿Vaciar todo lo de hoy?')) {      // confirm() abre un cuadro "Aceptar / Cancelar" y devuelve true o false
            dia.items = [];                            // vaciamos la lista
            guardarDia();                              // guardamos
            pintarDia();                               // refrescamos
        }
    });

    document.querySelector('#formObjetivo').addEventListener('submit', (e) => { // al guardar el formulario del objetivo
        e.preventDefault();                            // evita que recargue la página

        const f = e.target;                            // el formulario
        const nuevo = {                                // montamos el objetivo nuevo con lo escrito
            kcal: Number(f.kcal.value),
            proteina: Number(f.proteina.value),
            carbohidratos: Number(f.carbohidratos.value),
            grasas: Number(f.grasas.value)
        };

        if (!Object.values(nuevo).every(v => v > 0)) return; // si algún valor no es mayor que 0, no guardamos

        objetivo = nuevo;                              // sustituimos el objetivo
        guardarObjetivo();                             // lo guardamos en el navegador
        pintarDia();                                   // refrescamos las barras
        mostrarAviso('Objetivo guardado ✓');           // avisamos
    });

    document.querySelector('#btnObjetivoDefecto').addEventListener('click', () => { // botón "Restaurar"
        objetivo = { ...OBJETIVO_DEFECTO };            // volvemos al objetivo por defecto (una copia)
        guardarObjetivo();                             // lo guardamos
        rellenarFormularioObjetivo();                  // actualizamos los campos del formulario
        pintarDia();                                   // refrescamos las barras
    });

    // enviar
    document.querySelector('#formReceta').addEventListener('submit', enviarFormulario); // al enviar el formulario de recetas
}

// "DOMContentLoaded" ocurre cuando la página ya está lista: entonces arrancamos todo con iniciar()
window.addEventListener('DOMContentLoaded', iniciar);
