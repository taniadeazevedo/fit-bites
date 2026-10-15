/* =====================================================================
   FIT BITES · formulario.js
   La ventana para crear y editar recetas: campos, ingredientes,
   kcal automáticas, foto y el envío a json-server (POST o PUT).
   ===================================================================== */

import { estado } from './estado.js';                   // las recetas cargadas
import { escaparHtml, mostrarAviso } from './utilidades.js'; // herramientas pequeñas
import { reducirImagen, fotoValida } from './fotos.js'; // preparar la foto
import { cargarRecetas, guardarReceta, actualizarReceta } from './datos.js'; // hablar con json-server
import { mostrarRecetas } from './recetas.js';          // repintar las tarjetas después de guardar

// ---------- ESTADO DE ESTE ARCHIVO ----------
let ingredientesForm = [];     // ingredientes del formulario mientras se escriben (todavía sin guardar)
let kcalManual = false;        // true si la persona ha escrito las kcal a mano (entonces no se recalculan solas)
let recetaEditando = null;     // la receta que se está editando (null = estamos creando una nueva)
let fotoForm = '';             // la foto del formulario convertida en texto (Base64); '' = sin foto

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
export function abrirFormulario(receta = null) {                  // si no le pasas receta, vale null = nueva
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

        const mensaje = recetaEditando ? 'Cambios guardados' : 'Receta guardada'; // el mensaje según el caso

        estado.recetas = await cargarRecetas();            // volvemos a pedir la lista al servidor (ya con el cambio)
        mostrarRecetas();                                  // y la volvemos a dibujar

        bootstrap.Modal.getInstance(document.querySelector('#modalReceta')).hide(); // cerramos la ventana del formulario
        mostrarAviso(mensaje);                             // y enseñamos el aviso verde
    } catch (error) {                                      // si algo falló (servidor apagado, etc.)...
        console.error('Error al guardar la receta:', error); // ...lo apuntamos en la consola (para ti)
        mostrarAviso('No se pudo guardar. ¿Está encendido json-server?'); // ...y avisamos a la persona
    }
}

/* ---------- ARRANQUE: oyentes del formulario ---------- */

export function iniciarFormulario() {
    // abrir el formulario para una receta nueva
    // () => abrirFormulario() es una "función flecha": una forma corta de escribir una función
    document.querySelector('#btnNueva').addEventListener('click', () => abrirFormulario());

    // ingredientes: botón, tecla Enter y quitar
    document.querySelector('#btnAnadirIngrediente').addEventListener('click', anadirIngrediente); // al pulsar "Añadir" se llama a la función (sin paréntesis: le pasamos la función, no la ejecutamos)

    document.querySelector('#campoIngrediente').addEventListener('keydown', (e) => { // "keydown" = al pulsar una tecla en la casilla
        if (e.key === 'Enter') {                           // si la tecla es Enter...
            e.preventDefault();                            // ...no debe enviar el formulario entero...
            anadirIngrediente();                           // ...solo añadir el ingrediente
        }
    });

    document.querySelector('#listaIngredientes').addEventListener('click', (e) => { // clics en las etiquetas de ingredientes
        const boton = e.target.closest('button');          // ¿fue en el botón × de alguna?
        if (!boton) return;                                // si no, no hacemos nada

        ingredientesForm.splice(Number(boton.dataset.indice), 1); // splice(posición, cuántos) quita elementos de la lista: aquí, 1 en esa posición
        pintarIngredientes();                              // refrescamos las etiquetas
        document.querySelector('#campoIngrediente').focus(); // el botón pulsado ha desaparecido: devolvemos el foco a la casilla (para quien usa teclado)
    });

    // kcal automáticas a partir de los macros (hasta que se escriban a mano)
    for (const nombre of ['proteina', 'carbohidratos', 'grasas']) { // repetimos para los tres campos...
        // `...${nombre}...` monta el selector: #formReceta [name="proteina"], etc.
        document.querySelector(`#formReceta [name="${nombre}"]`).addEventListener('input', calcularKcalAuto); // "input" = cada vez que se escribe algo
    }

    document.querySelector('#formReceta [name="kcal"]').addEventListener('input', () => { // si alguien escribe en el campo de kcal...
        kcalManual = true;                                 // ...apuntamos que lo ha hecho a mano (ya no se recalcula solo)
    });

    // foto: elegir o hacer una foto, reducirla y mostrar la vista previa
    document.querySelector('#recFoto').addEventListener('change', async (e) => { // "change" = cuando se elige un archivo
        const archivo = e.target.files[0];                 // el primer archivo elegido (files es una lista)
        const error = document.querySelector('#errorFoto'); // el sitio donde se escribe un posible error
        error.classList.add('d-none');                     // lo ocultamos de momento

        if (!archivo) return;                              // si no hay archivo (se canceló), terminamos

        if (!archivo.type.startsWith('image/')) {          // si el tipo de archivo no empieza por "image/", no es una imagen
            error.textContent = 'Elige un archivo de imagen.'; // escribimos el error
            error.classList.remove('d-none');              // lo mostramos
            e.target.value = '';                           // vaciamos la selección
            return;                                        // y terminamos
        }

        try {                                              // si es una imagen, la reducimos
            fotoForm = await reducirImagen(archivo);       // la reduce y guarda el texto resultante
            mostrarVistaFoto();                            // enseña la vista previa
        } catch (err) {                                    // si algo falla al reducirla...
            console.error('Error con la foto:', err);      // ...consola
            error.textContent = 'No se pudo usar esa imagen. Prueba con otra.'; // ...mensaje de error
            error.classList.remove('d-none');              // ...lo mostramos
        }
    });

    document.querySelector('#btnQuitarFoto').addEventListener('click', () => { // botón "Quitar foto"
        fotoForm = '';                                     // olvidamos la foto
        document.querySelector('#recFoto').value = '';     // vaciamos el selector de archivo
        mostrarVistaFoto();                                // y ocultamos la vista previa
    });

    // enviar
    document.querySelector('#formReceta').addEventListener('submit', enviarFormulario); // al enviar el formulario de recetas
}
