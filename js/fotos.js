/* =====================================================================
   FIT BITES · fotos.js
   Preparar las fotos que se suben desde el formulario: leerlas,
   reducirlas con un canvas y comprobar que de verdad son imágenes.
   ===================================================================== */

import { MAX_CARACTERES_FOTO } from './config.js';      // el tamaño máximo que admite json-server

/* ---------- FOTOS ---------- */

// Lee un archivo del ordenador y lo devuelve como texto (data URL)
// Una Promise es una "promesa": el resultado llegará más tarde, y quien la use puede esperarlo con await
export function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {             // resolve = "todo bien, aquí está"; reject = "ha fallado"
        const lector = new FileReader();                  // FileReader es la herramienta del navegador para leer archivos
        lector.onload = () => resolve(lector.result);     // cuando termina de leer: entrega el resultado
        lector.onerror = () => reject(new Error('No se pudo leer el archivo')); // si falla: entrega un error
        lector.readAsDataURL(archivo);                    // empieza a leer y lo convierte a texto Base64
    });
}

// Convierte ese texto en una imagen que el navegador puede dibujar
export function cargarImagen(url) {
    return new Promise((resolve, reject) => {             // otra promesa: cargar una imagen tarda un momento
        const imagen = new Image();                       // crea una imagen vacía en memoria
        imagen.onload = () => resolve(imagen);            // cuando carga bien: la entrega
        imagen.onerror = () => reject(new Error('El archivo no es una imagen válida')); // si no era una imagen: error
        imagen.src = url;                                 // le damos el texto: empieza a cargar
    });
}

// Dibuja la imagen en un lienzo (canvas) con un ancho máximo y la devuelve como JPEG en texto
export function dibujarImagen(imagen, anchoMax, calidad) {
    const escala = Math.min(1, anchoMax / imagen.width);   // cuánto hay que reducirla; Math.min(1, ...) evita agrandarla
    const lienzo = document.createElement('canvas');       // un "canvas" es un lienzo en blanco donde se puede dibujar
    lienzo.width = Math.round(imagen.width * escala);      // ancho final del lienzo (redondeado)
    lienzo.height = Math.round(imagen.height * escala);    // alto final, con la misma proporción

    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height); // dibuja la foto en el lienzo, ya reducida

    return lienzo.toDataURL('image/jpeg', calidad);        // convierte el lienzo en texto JPEG; "calidad" va de 0 a 1
}

// Reduce la foto hasta que quepa: una foto de móvil pesa varios MB y
// json-server rechaza las peticiones de más de 100 KB
export async function reducirImagen(archivo) {
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

// Solo se pintan fotos que de verdad sean una imagen: o un texto Base64 (data:image/...) o la ruta de un archivo de la carpeta imgs/ (imgs/recetas/receta-1.jpg)
export function fotoValida(foto) {
    if (typeof foto !== 'string') return false;            // tiene que ser texto
    return foto.startsWith('data:image/')                  // ...y empezar por "data:image/" (foto subida desde el formulario)...
        || /^imgs\/[\w\-./]+\.(jpe?g|png|webp)$/i.test(foto); // ...o ser una ruta como "imgs/recetas/receta-1.jpg" (foto guardada como archivo, más nítida)
}
