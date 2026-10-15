/* =====================================================================
   FIT BITES · almacen.js
   El "almacén" de los datos de cada persona (historial, objetivo,
   favoritas, compra...). Todos los módulos leen y guardan AQUÍ, nunca
   directamente en localStorage. Así:
   - siempre hay una copia en el navegador (funciona sin cuenta y sin internet)
   - si has entrado con tu cuenta, nube.js sube cada cambio a Firebase
   - si llegan datos de la nube (otro dispositivo), se avisa a todos para repintar
   ===================================================================== */

import { CLAVES_USUARIO } from './config.js';           // nombre de cada dato en localStorage

const memoria = {};            // copia en memoria de lo ya leído: { historial: {...}, objetivo: {...} }
const oyentes = [];            // funciones que hay que llamar cuando los datos cambian "desde fuera" (la nube)
let subir = null;              // la función que sube un cambio a la nube (la pone nube.js al entrar; null = sin cuenta)

// Lee un dato. Si no existe (o está roto), devuelve "defecto"
export function leer(clave, defecto) {
    if (clave in memoria) return memoria[clave];           // "in" mira si el objeto tiene esa propiedad: si ya lo leímos, lo devolvemos

    try {                                                  // si el navegador no deja leer, o el texto está roto, JSON.parse falla
        const texto = localStorage.getItem(CLAVES_USUARIO[clave]); // el texto guardado (o null si no hay)
        if (texto !== null) {                              // si hay algo...
            memoria[clave] = JSON.parse(texto);            // ...lo convertimos en dato y lo apuntamos en memoria
            return memoria[clave];
        }
    } catch {
        // roto o sin permiso: usamos el de por defecto
    }

    return defecto;
}

// Guarda un dato: en memoria, en el navegador y (si hay cuenta) en la nube
export function guardar(clave, valor) {
    memoria[clave] = valor;                                // en memoria

    try {                                                  // en modo privado o con el almacenamiento lleno puede fallar
        localStorage.setItem(CLAVES_USUARIO[clave], JSON.stringify(valor)); // dato -> texto -> navegador
    } catch (error) {
        console.warn('No se pudo guardar en el navegador:', error); // avisamos en la consola, pero la web sigue
    }

    if (subir) subir(clave, valor);                        // si hay cuenta, a la nube
}

// Todos los datos de la persona en un solo objeto (para subirlos la primera vez que entra)
export function todosLosDatos() {
    const datos = {};                                      // empezamos vacío
    for (const clave of Object.keys(CLAVES_USUARIO)) {     // por cada dato posible...
        const valor = leer(clave, undefined);              // ...lo leemos
        if (valor !== undefined) datos[clave] = valor;     // ...y si existe, lo añadimos
    }
    return datos;
}

// Sustituye los datos por los que llegan de la nube y avisa para repintar
// "ignorar" = claves que NO se tocan (cambios que aún no se han terminado de subir)
export function reemplazarTodo(datos, ignorar = []) {
    for (const clave of Object.keys(CLAVES_USUARIO)) {     // por cada dato posible...
        if (ignorar.includes(clave)) continue;             // ...menos los que hay que ignorar
        const valor = datos[clave];                        // lo que dice la nube

        if (valor === undefined) {                         // si la nube no lo tiene...
            delete memoria[clave];                         // ...lo olvidamos
            try { localStorage.removeItem(CLAVES_USUARIO[clave]); } catch { }
        } else {                                           // si lo tiene...
            memoria[clave] = valor;                        // ...lo copiamos en memoria y en el navegador
            try { localStorage.setItem(CLAVES_USUARIO[clave], JSON.stringify(valor)); } catch { }
        }
    }
    avisar();                                              // y que todos repinten
}

// Borra los datos personales de ESTE navegador (al cerrar sesión, para que otra persona no los vea)
export function borrarTodoLocal() {
    for (const clave of Object.keys(CLAVES_USUARIO)) {
        delete memoria[clave];
        try { localStorage.removeItem(CLAVES_USUARIO[clave]); } catch { }
    }
    avisar();
}

// Apunta una función para que se llame cuando los datos cambien desde fuera
export function alCambiarDatos(funcion) {
    oyentes.push(funcion);
}

// Llama a todas las funciones apuntadas
function avisar() {
    for (const funcion of oyentes) funcion();
}

// nube.js pone aquí su función de subir al entrar (y null al salir)
export function ponerSubida(funcion) {
    subir = funcion;
}
