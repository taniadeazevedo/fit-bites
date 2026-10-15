/* =====================================================================
   FIT BITES · platos.js
   Tus platos guardados: una comida que repites ("mi bowl de salmón")
   guardada con un nombre para añadirla al diario de un toque.
   Cada plato guarda sus totales (kcal y macros por ración) y un texto
   con lo que lleva: { id, nombre, valores: {kcal...}, detalle: "150 g Salmón, 70 g Arroz..." }
   ===================================================================== */

import { leer, guardar, alCambiarDatos } from './almacen.js'; // guardar los platos

let platos = [];               // la lista de platos

// Lee los platos del almacén (solo los que tienen nombre y valores)
function leerPlatos() {
    const guardados = leer('platos', []);
    platos = Array.isArray(guardados) ? guardados.filter(p => p && p.nombre && p.valores) : [];
}

export function iniciarPlatos() {
    leerPlatos();                                          // los tuyos
    alCambiarDatos(leerPlatos);                            // si llegan de la nube, se vuelven a leer
}

// La lista, ordenada por nombre
export function listaPlatos() {
    return [...platos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); // copia ordenada (sin tocar la original)
}

export function buscarPlato(id) {
    return platos.find(p => p.id === id);
}

// Crea un plato con un nombre, sus totales y el texto de lo que lleva
export function crearPlato(nombre, valores, detalle) {
    const plato = { id: 'plato-' + Date.now().toString(36), nombre: nombre.trim(), valores, detalle };
    platos.push(plato);                                    // lo añadimos...
    guardar('platos', platos);                             // ...y guardamos
    return plato;
}

export function borrarPlato(id) {
    platos = platos.filter(p => p.id !== id);              // todos menos ese
    guardar('platos', platos);
}
