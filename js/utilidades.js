/* =====================================================================
   FIT BITES · utilidades.js
   Funciones pequeñas que usan varios archivos: textos, números,
   fechas, localStorage y el aviso que sale abajo.
   ===================================================================== */

// ---------- TEXTOS ----------

// Convierte caracteres especiales para que un texto nunca se interprete como HTML
// (si alguien escribe <b>hola</b> como nombre, se verá tal cual y no se ejecutará)
export function escaparHtml(texto) {
    return String(texto)                                  // aseguramos que es texto (aunque nos pasen un número)
        .replaceAll('&', '&amp;')                         // "&" pasa a "&amp;" (hay que hacerlo el primero)
        .replaceAll('<', '&lt;')                          // "<" pasa a "&lt;" (así no abre una etiqueta)
        .replaceAll('>', '&gt;')                          // ">" pasa a "&gt;"
        .replaceAll('"', '&quot;');                       // comillas dobles: no pueden romper un atributo HTML
}

// Pasa un texto a minúsculas y le quita las tildes, para que "salmon" encuentre "Salmón"
export function normalizarTexto(texto) {
    return String(texto)                                  // aseguramos que es texto
        .normalize('NFD')                                 // separa cada letra de su tilde: "ó" pasa a "o" + "´"
        .replace(/[̀-ͯ]/g, '')                 // borra esas tildes sueltas (el rango ̀-ͯ son las marcas de tilde)
        .toLowerCase();                                   // todo en minúsculas
}

// Pone la primera letra en mayúscula: "jueves" -> "Jueves"
export function mayusculaInicial(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1); // la primera letra en mayúscula + el resto tal cual
}

// ---------- NÚMEROS ----------

// Da formato a un número según el español: 1.234,5
export function formatoNumero(n, decimales = 0) {         // si no indicas decimales, vale 0
    return n.toLocaleString('es-ES', { maximumFractionDigits: decimales }); // toLocaleString escribe el número a la española
}

// Escribe un número con "½" cuando acaba en medio: 0,5 -> "½", 1,5 -> "1½"
export function numeroConMedio(n) {
    const entero = Math.floor(n);                         // la parte entera
    if (n - entero === 0.5) return (entero > 0 ? entero : '') + '½'; // si acaba en medio, lo escribimos con ½
    return formatoNumero(n, 1);                           // si no, número normal con hasta un decimal
}

// Reparto de calorías entre macros: proteína y carbohidratos 4 kcal/g, grasas 9 kcal/g
export function porcentajesMacros(receta) {
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

// ---------- FECHAS (como texto "2026-10-15", con la hora local, no la UTC) ----------

// Convierte una fecha de JavaScript en el texto "2026-10-15"
export function fechaATexto(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // getMonth() cuenta desde 0 (enero = 0), por eso +1; padStart rellena con un 0: "8" -> "08"
    const diaMes = String(fecha.getDate()).padStart(2, '0');   // día del mes, también con dos cifras
    return `${fecha.getFullYear()}-${mes}-${diaMes}`;      // monta el texto con comillas inversas: ${...} mete valores dentro
}

// Hace lo contrario: del texto "2026-10-15" a una fecha de JavaScript
export function textoAFecha(texto) {
    const [anio, mes, diaMes] = texto.split('-').map(Number); // separa por los guiones y convierte cada trozo en número
    return new Date(anio, mes - 1, diaMes);                // new Date(año, mes desde 0, día)
}

// La fecha de hoy en texto
export function fechaHoy() {
    return fechaATexto(new Date());                        // new Date() = ahora mismo
}

// Suma (o resta) días a una fecha en texto: sumarDias("2026-10-15", -1) -> "2026-10-14"
export function sumarDias(texto, dias) {
    const fecha = textoAFecha(texto);                      // pasamos a fecha
    fecha.setDate(fecha.getDate() + dias);                 // setDate entiende que el día 32 es el 1 del mes siguiente
    return fechaATexto(fecha);                             // y volvemos a texto
}

// El lunes de la semana de esa fecha (las semanas empiezan en lunes)
export function lunesDe(texto) {
    const diaSemana = textoAFecha(texto).getDay();         // getDay(): 0 = domingo, 1 = lunes... 6 = sábado
    const atras = (diaSemana + 6) % 7;                     // cuántos días hay que retroceder hasta el lunes (domingo = 6, lunes = 0)
    return sumarDias(texto, -atras);                       // retrocedemos
}

// Escribe una fecha bonita en español; "opciones" dice qué partes salen (día de la semana, mes...)
export function fechaLegible(texto, opciones = { weekday: 'long', day: 'numeric', month: 'long' }) {
    return textoAFecha(texto).toLocaleDateString('es-ES', opciones); // "jueves, 15 de octubre"
}

// ---------- AVISO ----------

// Enseña un mensaje que aparece abajo y desaparece solo (un "toast" de Bootstrap)
export function mostrarAviso(texto) {
    const toast = document.querySelector('#toastAviso');   // el recuadro del aviso
    toast.querySelector('.toast-body').textContent = texto; // escribe el mensaje dentro (textContent no interpreta HTML)
    bootstrap.Toast.getOrCreateInstance(toast).show();     // le pide a Bootstrap que lo muestre
}
