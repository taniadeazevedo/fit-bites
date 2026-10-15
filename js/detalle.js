/* =====================================================================
   FIT BITES · detalle.js
   La ventana con el detalle de una receta. Tiene un selector de
   raciones (− 1 +) que recalcula las kcal, los macros y las
   cantidades de los ingredientes.
   ===================================================================== */

import { buscarReceta } from './estado.js';             // para encontrar la receta por su id
import { formatoNumero, numeroConMedio } from './utilidades.js'; // herramientas pequeñas
import { fotoValida } from './fotos.js';                // para saber si la foto se puede pintar
import { abrirAnadir } from './anadir.js';            // "Apuntar en el diario"

// ---------- ESTADO DE ESTE ARCHIVO ----------
let recetaDetalleId = null;    // el id de la receta que se está viendo
let raciones = 1;              // cuántas raciones se están viendo (empieza siempre en 1)

const RACIONES_MIN = 0.5;      // lo mínimo: media ración
const RACIONES_MAX = 10;       // lo máximo
const PASO_RACIONES = 0.5;     // cuánto suma o resta cada botón

// Multiplica la cantidad de un ingrediente escrito a mano: escalarIngrediente("120 g de salmón", 2) -> "240 g de salmón"
export function escalarIngrediente(texto, factor) {
    if (factor === 1) return texto;                        // con 1 ración, tal cual

    // separa el número del principio (o "½") del resto: "120 g de salmón" -> "120", " ", "g de salmón"
    const m = texto.match(/^(½|\d+(?:[.,]\d+)?)(\s*)(.*)$/);

    if (!m) return `${texto} (×${numeroConMedio(factor)})`; // sin cantidad ("Cebolla"): solo decimos cuántas veces

    const cantidad = (m[1] === '½' ? 0.5 : Number(m[1].replace(',', '.'))) * factor; // el número (con punto en vez de coma) por las raciones
    const conPeso = /^(kg|gr|g|ml|l)\b/i.test(m[3]);       // ¿lo que sigue es una unidad de peso o volumen? ("g de...", "ml de...")

    // con peso, número normal ("180 g"); con unidades sueltas, redondeamos a medias ("1½ aguacate"), nunca menos de ½
    const textoCantidad = conPeso
        ? formatoNumero(cantidad, 1)
        : numeroConMedio(Math.max(0.5, Math.round(cantidad * 2) / 2)); // Math.round(x * 2) / 2 redondea a la media más cercana

    return textoCantidad + m[2] + m[3];                    // el número nuevo + el espacio + el resto, como estaba
}

// Rellena lo que cambia con las raciones: kcal, macros, ingredientes y el contador
function pintarRaciones() {
    const receta = buscarReceta(recetaDetalleId);          // la receta que se está viendo
    if (!receta) return;                                   // si no está, no hacemos nada

    const r = raciones;                                    // un nombre corto para usarlo abajo

    document.querySelector('#detalleMeta').textContent =   // línea con tipo, categoría, tiempo y kcal
        `${receta.tipo ? receta.tipo + ' · ' : ''}${receta.categoria} · ${receta.tiempo} min · ${formatoNumero(receta.kcal * r)} kcal`; // si la receta tiene tipo, lo pone delante
    document.querySelector('#detalleMacros').textContent = // línea con los macros
        `P ${formatoNumero(receta.proteina * r, 1)} g · C ${formatoNumero(receta.carbohidratos * r, 1)} g · G ${formatoNumero(receta.grasas * r, 1)} g`;

    document.querySelector('#detalleRaciones').textContent = numeroConMedio(r); // el número entre − y +
    document.querySelector('#detalleMenos').disabled = r <= RACIONES_MIN;      // en el mínimo, "−" se apaga
    document.querySelector('#detalleMas').disabled = r >= RACIONES_MAX;        // en el máximo, "+" se apaga

    const lista = document.querySelector('#detalleIngredientes'); // la lista <ul> de ingredientes
    lista.innerHTML = '';                                  // la vaciamos

    for (const ingrediente of receta.ingredientes ?? []) { // por cada ingrediente (o ninguno, si no hay lista)...
        const li = document.createElement('li');           // ...creamos un <li>
        li.textContent = escalarIngrediente(ingrediente, r); // ...con la cantidad ya multiplicada
        lista.appendChild(li);                             // ...y lo metemos en la lista
    }

    // el botón dice cuántas raciones se añaden si no es una
    document.querySelector('#detalleAnadirTexto').textContent = r === 1 ? 'Apuntar en el diario' : `Apuntar ×${numeroConMedio(r)} en el diario`;
}

// Rellena y abre la ventana con el detalle de una receta
export function abrirDetalle(id) {
    const receta = buscarReceta(id);                       // busca la receta por su id
    if (!receta) return;                                   // si no la encuentra, no hacemos nada

    recetaDetalleId = receta.id;                           // apuntamos cuál estamos viendo
    raciones = 1;                                          // cada vez que se abre, empieza en 1 ración
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

    pintarRaciones();                                      // kcal, macros e ingredientes para 1 ración

    bootstrap.Modal.getOrCreateInstance(document.querySelector('#modalDetalle')).show(); // le pedimos a Bootstrap que abra la ventana
}

/* ---------- ARRANQUE: oyentes de la ventana de detalle ---------- */

export function iniciarDetalle() {
    document.querySelector('#detalleMenos').addEventListener('click', () => { // "−"
        raciones = Math.max(RACIONES_MIN, raciones - PASO_RACIONES); // resta media, sin bajar del mínimo
        pintarRaciones();                                  // y recalcula
    });

    document.querySelector('#detalleMas').addEventListener('click', () => { // "+"
        raciones = Math.min(RACIONES_MAX, raciones + PASO_RACIONES); // suma media, sin pasar del máximo
        pintarRaciones();                                  // y recalcula
    });

    document.querySelector('#detalleAnadirDia').addEventListener('click', () => { // botón "Apuntar en el diario"
        const modal = document.querySelector('#modalDetalle');
        const datos = { origen: 'receta', ref: String(recetaDetalleId), cantidad: raciones }; // la receta y las raciones elegidas
        // Bootstrap no deja abrir una ventana encima de otra: esperamos a que esta termine de cerrarse ("hidden") y abrimos la de añadir
        modal.addEventListener('hidden.bs.modal', () => abrirAnadir(datos), { once: true });
        bootstrap.Modal.getInstance(modal).hide();
    });
}
