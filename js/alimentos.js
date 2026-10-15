/* =====================================================================
   FIT BITES · alimentos.js
   La lista de alimentos: los de la tabla (json/alimentos.json) y los
   que crea cada persona ("alimentos propios": tu yogur, tu batido...).
   Todos los valores son por cada 100 g en crudo.
   ===================================================================== */

import { CATEGORIAS_ALIMENTO } from './config.js';      // las categorías válidas
import { cargarAlimentos } from './datos.js';           // leer la tabla
import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar los propios
import { normalizarTexto } from './utilidades.js';      // buscar sin tildes

let base = [];                 // los alimentos de la tabla
let propios = [];              // los que has creado tú

// Comprueba que un alimento tiene buena pinta (nombre y 4 números que no sean negativos)
function alimentoValido(a) {
    return a && typeof a.nombre === 'string' && a.nombre.trim() !== ''
        && ['kcal', 'proteina', 'carbohidratos', 'grasas'].every(k => Number(a[k]) >= 0); // every() = todos cumplen
}

// Lee tus alimentos propios del almacén (y se queda solo con los válidos)
function leerPropios() {
    const guardados = leer('alimentosPropios', []);       // la lista guardada (o vacía)
    propios = Array.isArray(guardados) ? guardados.filter(alimentoValido) : [];
}

// Carga la tabla y tus alimentos. "async" porque tiene que esperar al archivo
export async function iniciarAlimentos() {
    base = await cargarAlimentos();                        // la tabla de json/alimentos.json
    leerPropios();                                         // los tuyos
    alCambiarDatos(leerPropios);                           // si llegan de la nube, se vuelven a leer
}

// Todos los alimentos: primero los tuyos (marcados con propio: true) y luego los de la tabla
export function todosLosAlimentos() {
    return [...propios.map(a => ({ ...a, propio: true })), ...base]; // "..." copia cada alimento y le añade propio: true
}

// Busca un alimento por su id
export function buscarAlimento(id) {
    return todosLosAlimentos().find(a => a.id === id);
}

// Filtra por lo escrito (sin tildes) y por categoría ('' = todas)
export function filtrarAlimentos(texto, categoria) {
    const busqueda = normalizarTexto(texto.trim());        // lo escrito, sin espacios sobrantes ni tildes
    return todosLosAlimentos().filter(a =>
        (categoria === '' || a.categoria === categoria) &&  // la categoría coincide (o no hay)...
        (busqueda === '' || normalizarTexto(a.nombre).includes(busqueda)) // ...y el nombre contiene lo escrito
    );
}

// Crea un alimento propio y lo devuelve
export function crearAlimentoPropio(datos) {
    const alimento = {
        id: 'propio-' + Date.now().toString(36),           // un id único: "propio-" + la hora actual escrita en base 36 (letras y números)
        nombre: datos.nombre.trim(),
        categoria: CATEGORIAS_ALIMENTO.includes(datos.categoria) ? datos.categoria : 'Salsas y otros', // si la categoría no existe, "otros"
        kcal: Number(datos.kcal),
        proteina: Number(datos.proteina),
        carbohidratos: Number(datos.carbohidratos),
        grasas: Number(datos.grasas),
        racion: Number(datos.racion) > 0 ? Number(datos.racion) : 100 // los gramos que se proponen al añadirlo (si no dices nada, 100)
    };
    propios.push(alimento);                                // lo añadimos a la lista
    guardar('alimentosPropios', propios);                  // y la guardamos
    return { ...alimento, propio: true };
}

// Borra un alimento propio (lo que ya apuntaste en el diario no cambia: allí se guardó una copia de sus valores)
export function borrarAlimentoPropio(id) {
    propios = propios.filter(a => a.id !== id);            // todos menos ese
    guardar('alimentosPropios', propios);
}
