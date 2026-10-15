/* =====================================================================
   FIT BITES · estado.js
   Lo que COMPARTEN varios archivos y cambia mientras usas la web.
   Va dentro de un objeto porque un "import" no se puede reasignar
   (recetas = ... daría error en otro archivo), pero sus propiedades sí:
   estado.recetas = ... funciona desde cualquier módulo.
   ===================================================================== */

export const estado = {
    recetas: [],        // la lista de recetas, una vez cargada
    modoLectura: true   // true = solo se pueden ver las recetas (no crear, editar ni borrar)
};

// Busca una receta por su id (comparando como texto para que 1 y "1" cuenten igual)
export function buscarReceta(id) {
    return estado.recetas.find(r => String(r.id) === String(id)); // find() devuelve la primera que cumpla, o undefined
}
