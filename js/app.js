'use strict';

const URL_RECETAS = 'http://localhost:3001/recetas/';      // json-server (solo en tu ordenador)
const ARCHIVO_RECETAS = 'json/recetas.json';               // el archivo, para la versión publicada

// ¿Se está abriendo la web desde tu ordenador (y no desde GitHub Pages)?
const EN_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let modoLectura = true;        // true = solo se pueden ver las recetas (no crear, editar ni borrar)

let recetas = [];
let ingredientesForm = [];     // ingredientes del formulario, mientras se escribe
let kcalManual = false;        // true si la persona ha escrito las kcal a mano
let recetaEditando = null;     // la receta que se está editando (null = receta nueva)
let idParaBorrar = null;       // el id de la receta que se va a borrar
let fotoForm = '';             // la foto del formulario (texto Base64), o '' si no hay
const MAX_CARACTERES_FOTO = 80000;   // límite de la foto en texto (json-server admite ~100 KB por petición)

/* ---------- DATOS ---------- */

async function cargarRecetas() {
    // En tu ordenador intenta usar json-server: así se puede crear, editar y borrar
    if (EN_LOCAL) {
        try {
            const respuesta = await fetch(URL_RECETAS);

            if (respuesta.ok) {
                modoLectura = false;
                return await respuesta.json();
            }
        } catch (error) {
            console.info('json-server no responde: se lee el archivo en modo lectura');
        }
    }

    // Sin json-server (por ejemplo, en GitHub Pages) se lee el archivo, solo para ver
    modoLectura = true;

    const respuesta = await fetch(ARCHIVO_RECETAS);

    if (!respuesta.ok) {
        throw new Error('No se pudo leer ' + ARCHIVO_RECETAS + ' (' + respuesta.status + ')');
    }

    const datos = await respuesta.json();
    return datos.recetas;
}

async function guardarReceta(receta) {
    const respuesta = await fetch(URL_RECETAS, {
        method: 'POST',
        body: JSON.stringify(receta),
        headers: { 'Content-type': 'application/json' }
    });

    if (!respuesta.ok) {
        throw new Error('No se pudo guardar (' + respuesta.status + ')');
    }

    return await respuesta.json();
}

async function actualizarReceta(receta) {
    const respuesta = await fetch(URL_RECETAS + receta.id, {
        method: 'PUT',
        body: JSON.stringify(receta),
        headers: { 'Content-type': 'application/json' }
    });

    if (!respuesta.ok) {
        throw new Error('No se pudo actualizar (' + respuesta.status + ')');
    }

    return await respuesta.json();
}

async function borrarReceta(id) {
    const respuesta = await fetch(URL_RECETAS + id, { method: 'DELETE' });

    if (!respuesta.ok) {
        throw new Error('No se pudo borrar (' + respuesta.status + ')');
    }
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

/* ---------- FOTOS ---------- */

// Lee un archivo del ordenador y lo devuelve como texto (data URL)
function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
        lector.readAsDataURL(archivo);
    });
}

// Convierte ese texto en una imagen que el navegador puede dibujar
function cargarImagen(url) {
    return new Promise((resolve, reject) => {
        const imagen = new Image();
        imagen.onload = () => resolve(imagen);
        imagen.onerror = () => reject(new Error('El archivo no es una imagen válida'));
        imagen.src = url;
    });
}

// Dibuja la imagen en un lienzo (canvas) con un ancho máximo y la devuelve como JPEG en texto
function dibujarImagen(imagen, anchoMax, calidad) {
    const escala = Math.min(1, anchoMax / imagen.width);   // nunca se agranda
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);

    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

    return lienzo.toDataURL('image/jpeg', calidad);
}

// Reduce la foto hasta que quepa: una foto de móvil pesa varios MB y
// json-server rechaza las peticiones de más de 100 KB
async function reducirImagen(archivo) {
    const imagen = await cargarImagen(await leerArchivo(archivo));

    let ancho = 800;
    let calidad = 0.75;
    let resultado = dibujarImagen(imagen, ancho, calidad);

    while (resultado.length > MAX_CARACTERES_FOTO && ancho > 200) {
        if (calidad > 0.5) {
            calidad -= 0.1;                  // primero baja la calidad
        } else {
            ancho = Math.round(ancho * 0.8); // y luego el tamaño
        }
        resultado = dibujarImagen(imagen, ancho, calidad);
    }

    if (resultado.length > MAX_CARACTERES_FOTO) {
        throw new Error('La foto es demasiado grande');
    }

    return resultado;
}

// Solo se pintan fotos que de verdad sean una imagen (data:image/...)
function fotoValida(foto) {
    return typeof foto === 'string' && foto.startsWith('data:image/');
}

function mostrarVistaFoto() {
    const caja = document.querySelector('#vistaFotoCaja');

    if (fotoForm) {
        document.querySelector('#vistaFoto').src = fotoForm;
        caja.classList.remove('d-none');
    } else {
        document.querySelector('#vistaFoto').removeAttribute('src');
        caja.classList.add('d-none');
    }
}

// Muestra u oculta lo que solo tiene sentido con json-server encendido
function aplicarModo() {
    document.querySelector('#btnNueva').classList.toggle('d-none', modoLectura);

    // el aviso solo sale en tu ordenador (en la web publicada no hace falta)
    document.querySelector('#avisoLectura').classList.toggle('d-none', !(modoLectura && EN_LOCAL));
}

function mostrarAviso(texto) {
    const toast = document.querySelector('#toastAviso');
    toast.querySelector('.toast-body').textContent = texto;
    bootstrap.Toast.getOrCreateInstance(toast).show();
}

/* ---------- PINTAR LA LISTA ---------- */

function pintarRecetas(lista) {
    const contenedor = document.querySelector('#listaRecetas');
    contenedor.innerHTML = '';

    if (lista.length === 0) {
        contenedor.innerHTML = '<p class="text-body-secondary">Aún no hay recetas. ¡Añade la primera!</p>';
        return;
    }

    for (const receta of lista) {
        const pct = porcentajesMacros(receta);
        const numIngredientes = (receta.ingredientes ?? []).length;

        const col = document.createElement('div');
        col.className = 'col';

        col.innerHTML = `
      <article class="card h-100 border-0 shadow-sm receta" data-id="${receta.id}">
        <div class="receta-img ratio ratio-4x3 rounded-top">
          ${fotoValida(receta.foto)
            ? `<img src="${escaparHtml(receta.foto)}" class="receta-foto" alt="Foto de ${escaparHtml(receta.nombre)}">`
            : `<div class="d-flex align-items-center justify-content-center"><i class="bi bi-egg-fried fs-1"></i></div>`}
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

          <div class="d-flex justify-content-between small mb-3">
            <span><i class="punto macro-p"></i> P ${receta.proteina} g</span>
            <span><i class="punto macro-c"></i> C ${receta.carbohidratos} g</span>
            <span><i class="punto macro-g"></i> G ${receta.grasas} g</span>
          </div>

          <small class="text-body-secondary d-block"><i class="bi bi-basket"></i> ${numIngredientes} ingredientes · Ver receta</small>

          ${modoLectura ? '' : `
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-outline-dark btn-sm btn-editar" data-id="${receta.id}">
              <i class="bi bi-pencil-fill"></i> Editar
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-borrar"
              data-bs-toggle="modal" data-bs-target="#modalBorrar"
              data-id="${receta.id}" data-nombre="${escaparHtml(receta.nombre)}">
              <i class="bi bi-trash-fill"></i> Borrar
            </button>
          </div>`}
        </div>
      </article>`;

        contenedor.appendChild(col);
    }
}

/* ---------- DETALLE DE LA RECETA ---------- */

function abrirDetalle(id) {
    const receta = recetas.find(r => String(r.id) === String(id));
    if (!receta) return;

    document.querySelector('#detalleTitulo').textContent = receta.nombre;

    const foto = document.querySelector('#detalleFoto');
    if (fotoValida(receta.foto)) {
        foto.src = receta.foto;
        foto.alt = 'Foto de ' + receta.nombre;
        foto.classList.remove('d-none');
    } else {
        foto.removeAttribute('src');
        foto.classList.add('d-none');
    }
    document.querySelector('#detalleMeta').textContent =
        `${receta.categoria} · ${receta.tiempo} min · ${receta.kcal} kcal`;
    document.querySelector('#detalleMacros').textContent =
        `P ${receta.proteina} g · C ${receta.carbohidratos} g · G ${receta.grasas} g`;
    document.querySelector('#detallePreparacion').textContent = receta.preparacion || 'Sin preparación.';

    const lista = document.querySelector('#detalleIngredientes');
    lista.innerHTML = '';

    for (const ingrediente of receta.ingredientes ?? []) {
        const li = document.createElement('li');
        li.textContent = ingrediente;
        lista.appendChild(li);
    }

    bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalDetalle')).show();
}

/* ---------- FORMULARIO: INGREDIENTES ---------- */

function pintarIngredientes() {
    const lista = document.querySelector('#listaIngredientes');
    lista.innerHTML = '';

    ingredientesForm.forEach((ingrediente, indice) => {
        const li = document.createElement('li');
        li.className = 'chip-ingrediente';
        li.innerHTML = `
      <span>${escaparHtml(ingrediente)}</span>
      <button type="button" data-indice="${indice}" aria-label="Quitar ${escaparHtml(ingrediente)}">×</button>`;
        lista.appendChild(li);
    });

    if (ingredientesForm.length > 0) {
        document.querySelector('#errorIngredientes').classList.add('d-none');
    }
}

function anadirIngrediente() {
    const campo = document.querySelector('#campoIngrediente');
    const texto = campo.value.trim();

    if (texto === '') return;

    ingredientesForm.push(texto);
    campo.value = '';
    campo.focus();

    pintarIngredientes();
}

/* ---------- FORMULARIO: NUEVA RECETA ---------- */

function calcularKcalAuto() {
    if (kcalManual) return;

    const f = document.querySelector('#formReceta');
    const proteina = Number(f.proteina.value) || 0;
    const carbohidratos = Number(f.carbohidratos.value) || 0;
    const grasas = Number(f.grasas.value) || 0;

    f.kcal.value = Math.round(proteina * 4 + carbohidratos * 4 + grasas * 9);
}

function abrirFormulario(receta = null) {
    const f = document.querySelector('#formReceta');
    f.reset();
    f.classList.remove('was-validated');

    recetaEditando = receta;

    document.querySelector('#tituloReceta').textContent = receta ? 'Editar receta' : 'Nueva receta';
    document.querySelector('#btnGuardarReceta').textContent = receta ? 'Guardar cambios' : 'Guardar receta';

    if (receta) {
        f.nombre.value = receta.nombre;
        f.categoria.value = receta.categoria;
        f.tiempo.value = receta.tiempo;
        f.kcal.value = receta.kcal;
        f.proteina.value = receta.proteina;
        f.carbohidratos.value = receta.carbohidratos;
        f.grasas.value = receta.grasas;
        f.preparacion.value = receta.preparacion ?? '';

        ingredientesForm = [...(receta.ingredientes ?? [])];   // una COPIA, para no tocar la original
        kcalManual = true;                                      // respeta las kcal guardadas
        fotoForm = fotoValida(receta.foto) ? receta.foto : '';
    } else {
        ingredientesForm = [];
        kcalManual = false;
        fotoForm = '';
    }

    pintarIngredientes();
    mostrarVistaFoto();
    document.querySelector('#errorFoto').classList.add('d-none');
    document.querySelector('#errorIngredientes').classList.add('d-none');

    bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalReceta')).show();
}

async function enviarFormulario(e) {
    e.preventDefault();

    const f = e.target;
    const faltanIngredientes = ingredientesForm.length === 0;

    if (!f.checkValidity() || faltanIngredientes) {
        f.classList.add('was-validated');
        document.querySelector('#errorIngredientes').classList.toggle('d-none', !faltanIngredientes);
        return;
    }

    const datos = {
        nombre: f.nombre.value.trim(),
        categoria: f.categoria.value,
        tiempo: Number(f.tiempo.value),
        kcal: Number(f.kcal.value),
        proteina: Number(f.proteina.value),
        carbohidratos: Number(f.carbohidratos.value),
        grasas: Number(f.grasas.value),
        ingredientes: ingredientesForm,
        preparacion: f.preparacion.value.trim(),
        foto: fotoForm
    };

    try {
        if (recetaEditando) {
            await actualizarReceta({ ...datos, id: recetaEditando.id });   // PUT: editar
        } else {
            await guardarReceta(datos);                                     // POST: crear
        }

        const mensaje = recetaEditando ? 'Cambios guardados ✓' : 'Receta guardada ✓';

        recetas = await cargarRecetas();
        pintarRecetas(recetas);

        bootstrap.Modal.getInstance(document.querySelector('#modalReceta')).hide();
        mostrarAviso(mensaje);
    } catch (error) {
        console.error('Error al guardar la receta:', error);
        mostrarAviso('No se pudo guardar. ¿Está encendido json-server?');
    }
}

/* ---------- ARRANQUE ---------- */

async function iniciar() {
    try {
        recetas = await cargarRecetas();
        pintarRecetas(recetas);
        aplicarModo();
    } catch (error) {
        console.error('No se pudieron cargar las recetas:', error);

        document.querySelector('#listaRecetas').innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning mb-0">
          No se pudieron cargar las recetas.
          ${EN_LOCAL ? '<br>Comprueba que existe <code>json/recetas.json</code>.' : ''}
        </div>
      </div>`;
    }

    // abrir el formulario para una receta nueva
    document.querySelector('#btnNueva').addEventListener('click', () => abrirFormulario());

    // clics en las tarjetas: editar, borrar (lo gestiona Bootstrap) o abrir el detalle
    document.querySelector('#listaRecetas').addEventListener('click', (e) => {
        const botonEditar = e.target.closest('.btn-editar');

        if (botonEditar) {
            const receta = recetas.find(r => String(r.id) === botonEditar.dataset.id);
            if (receta) abrirFormulario(receta);
            return;
        }

        if (e.target.closest('.btn-borrar')) return;   // el modal de borrado se abre solo (data-bs-toggle)

        const tarjeta = e.target.closest('.receta');
        if (tarjeta) abrirDetalle(tarjeta.dataset.id);
    });

    // modal de confirmación: se prepara justo antes de abrirse
    const modalBorrar = document.querySelector('#modalBorrar');

    modalBorrar.addEventListener('show.bs.modal', (e) => {
        const boton = e.relatedTarget;                 // el botón "Borrar" que lo ha abierto
        idParaBorrar = boton.dataset.id;
        document.querySelector('#textoBorrar').textContent =
            `¿Seguro que quieres borrar «${boton.dataset.nombre}»?`;
    });

    document.querySelector('#btnConfirmarBorrado').addEventListener('click', async () => {
        try {
            await borrarReceta(idParaBorrar);

            recetas = await cargarRecetas();
            pintarRecetas(recetas);
            mostrarAviso('Receta borrada');
        } catch (error) {
            console.error('Error al borrar la receta:', error);
            mostrarAviso('No se pudo borrar. ¿Está encendido json-server?');
        }
    });

    // ingredientes: botón, tecla Enter y quitar
    document.querySelector('#btnAnadirIngrediente').addEventListener('click', anadirIngrediente);

    document.querySelector('#campoIngrediente').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();          // Enter no debe enviar el formulario
            anadirIngrediente();
        }
    });

    document.querySelector('#listaIngredientes').addEventListener('click', (e) => {
        const boton = e.target.closest('button');
        if (!boton) return;

        ingredientesForm.splice(Number(boton.dataset.indice), 1);
        pintarIngredientes();
    });

    // kcal automáticas a partir de los macros (hasta que se escriban a mano)
    for (const nombre of ['proteina', 'carbohidratos', 'grasas']) {
        document.querySelector(`#formReceta [name="${nombre}"]`).addEventListener('input', calcularKcalAuto);
    }

    document.querySelector('#formReceta [name="kcal"]').addEventListener('input', () => {
        kcalManual = true;
    });

    // foto: elegir o hacer una foto, reducirla y mostrar la vista previa
    document.querySelector('#recFoto').addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        const error = document.querySelector('#errorFoto');
        error.classList.add('d-none');

        if (!archivo) return;

        if (!archivo.type.startsWith('image/')) {
            error.textContent = 'Elige un archivo de imagen.';
            error.classList.remove('d-none');
            e.target.value = '';
            return;
        }

        try {
            fotoForm = await reducirImagen(archivo);
            mostrarVistaFoto();
        } catch (err) {
            console.error('Error con la foto:', err);
            error.textContent = 'No se pudo usar esa imagen. Prueba con otra.';
            error.classList.remove('d-none');
        }
    });

    document.querySelector('#btnQuitarFoto').addEventListener('click', () => {
        fotoForm = '';
        document.querySelector('#recFoto').value = '';
        mostrarVistaFoto();
    });

    // enviar
    document.querySelector('#formReceta').addEventListener('submit', enviarFormulario);
}

window.addEventListener('DOMContentLoaded', iniciar);
