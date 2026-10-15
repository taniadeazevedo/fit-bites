/* =====================================================================
   FIT BITES · datos.js
   Hablar con la "despensa": json-server (en tu ordenador) o el archivo
   recetas.json (en la web publicada). Aquí solo se piden y se envían datos;
   pintarlos en la página es cosa de otros archivos.
   ===================================================================== */

import { URL_RECETAS, ARCHIVO_RECETAS, ARCHIVO_ALIMENTOS, EN_LOCAL } from './config.js'; // direcciones y si estamos en local
import { estado } from './estado.js';                   // para apuntar si estamos en modo lectura

/* ---------- DATOS: hablar con json-server o con el archivo ---------- */

// "async" = esta función puede esperar a que lleguen datos sin congelar la página
export async function cargarRecetas() {
    // En tu ordenador intenta usar json-server: así se puede crear, editar y borrar
    if (EN_LOCAL) {                                       // solo si la web está abierta en tu ordenador...
        try {                                             // "try" = intenta esto; si falla, salta al "catch"
            const respuesta = await fetch(URL_RECETAS);   // pide las recetas a json-server y ESPERA (await) la respuesta

            if (respuesta.ok) {                           // ok = el servidor contestó bien (códigos 200-299)
                estado.modoLectura = false;                      // hay servidor: se puede editar
                return await respuesta.json();            // convierte el texto JSON en una lista y la devuelve
            }
        } catch (error) {                                 // si json-server está apagado, fetch falla y llegamos aquí
            console.info('json-server no responde: se lee el archivo en modo lectura'); // mensaje informativo en la consola
        }
    }

    // Sin json-server (por ejemplo, en GitHub Pages) se lee el archivo, solo para ver
    estado.modoLectura = true;                                   // sin servidor: solo lectura

    const respuesta = await fetch(ARCHIVO_RECETAS);       // pide el archivo recetas.json como si fuera una página más

    if (!respuesta.ok) {                                  // "!" = NO. Si no se pudo leer el archivo...
        throw new Error('No se pudo leer ' + ARCHIVO_RECETAS + ' (' + respuesta.status + ')'); // ...lanza un error (lo recogerá quien llamó)
    }

    const datos = await respuesta.json();                 // convierte el JSON del archivo en un objeto
    return datos.recetas;                                 // el archivo tiene la forma { "recetas": [...] }: devolvemos solo la lista
}

// POST = crear una receta nueva en el servidor
export async function guardarReceta(receta) {
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
export async function actualizarReceta(receta) {
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
export async function borrarReceta(id) {
    const respuesta = await fetch(URL_RECETAS + id, { method: 'DELETE' }); // .../recetas/3 con el verbo DELETE

    if (!respuesta.ok) {                                  // si el servidor no pudo borrarla...
        throw new Error('No se pudo borrar (' + respuesta.status + ')'); // ...error
    }
}                                                         // no devuelve nada: borrar no necesita respuesta

// Lee la tabla de alimentos (valores por cada 100 g en crudo) del archivo json/alimentos.json
export async function cargarAlimentos() {
    const respuesta = await fetch(ARCHIVO_ALIMENTOS);      // pide el archivo (es un archivo normal: no necesita json-server)

    if (!respuesta.ok) {                                   // si no se pudo leer...
        throw new Error('No se pudo leer ' + ARCHIVO_ALIMENTOS + ' (' + respuesta.status + ')'); // ...lanza un error
    }

    const datos = await respuesta.json();                  // convierte el JSON en un objeto
    return datos.alimentos;                                // el archivo tiene la forma { "alimentos": [...] }: devolvemos la lista
}
