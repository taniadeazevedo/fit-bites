/* =====================================================================
   FIT BITES · config.js
   Los "ajustes" de la app: valores que no cambian nunca (const).
   Si quieres cambiar algo (un objetivo, una comida, una categoría...), es aquí.
   "export" = este valor se puede usar desde otros archivos con "import"
   ===================================================================== */

// ---------- Dónde están los datos ----------
export const URL_RECETAS = 'http://localhost:3001/recetas/';      // dirección de la "ventanilla" de json-server (solo existe en tu ordenador)
export const ARCHIVO_RECETAS = 'json/recetas.json';               // el mismo contenido como archivo normal: lo usa la web publicada
export const ARCHIVO_ALIMENTOS = 'json/alimentos.json';           // la tabla de alimentos (valores por cada 100 g en crudo)

// location.hostname es el nombre de la dirección donde estás (por ejemplo "localhost" o "taniadeazevedo.github.io")
// .includes(...) comprueba si ese nombre está en la lista; el resultado es true o false
export const EN_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname); // true = abierto desde tu ordenador; false = desde GitHub Pages

// ---------- El diario ----------
// Las comidas del día, en orden. "id" es como se guarda; "nombre" es lo que se ve; "hasta" = hasta qué hora se propone esa comida al añadir
export const COMIDAS = [
    { id: 'desayuno', nombre: 'Desayuno', icono: 'bi-cup-hot', hasta: 11 },
    { id: 'comida', nombre: 'Comida', icono: 'bi-sun', hasta: 16 },
    { id: 'merienda', nombre: 'Merienda', icono: 'bi-apple', hasta: 19 },
    { id: 'cena', nombre: 'Cena', icono: 'bi-moon', hasta: 24 }
];

// Las categorías de alimentos, en el orden en que salen en las píldoras
export const CATEGORIAS_ALIMENTO = ['Proteínas', 'Lácteos', 'Cereales y legumbres', 'Verduras', 'Frutas', 'Frutos secos y grasas', 'Salsas y otros'];

// Los 4 nutrientes que se siguen: con qué nombre salen, su unidad y el color de su barra
export const NUTRIENTES = [
    { clave: 'kcal', nombre: 'Kcal', unidad: 'kcal', clase: 'barra-kcal' },
    { clave: 'proteina', nombre: 'Proteína', unidad: 'g', clase: 'macro-p' },
    { clave: 'carbohidratos', nombre: 'Carbohidratos', unidad: 'g', clase: 'macro-c' },
    { clave: 'grasas', nombre: 'Grasas', unidad: 'g', clase: 'macro-g' }
];

// Objetivo orientativo para ganar masa muscular (la persona lo puede cambiar en la web)
export const OBJETIVO_DEFECTO = { kcal: 2100, proteina: 100, carbohidratos: 290, grasas: 60 }; // un objeto: cada dato tiene un nombre y un valor

export const DIAS_GUARDADOS = 120;          // cuántos días como máximo se guardan en el historial (los más antiguos se borran)

// ---------- Recetas ----------
// Tipos de plato: salen en el formulario Y en el filtro. Para añadir uno nuevo, escríbelo aquí y listo
export const TIPOS_PLATO = ['Bowl', 'Pasta', 'Ensalada', 'Hamburguesa', 'Fajita', 'Wrap', 'Sándwich', 'Arroz', 'Tortilla', 'Postre', 'Otro'];

// Una receta se considera "alta en proteína" si tiene al menos estos gramos (cámbialo si quieres ser más o menos exigente)
export const PROTEINA_ALTA = 35;

export const MAX_CARACTERES_FOTO = 80000;   // tamaño máximo de la foto en texto (json-server solo admite ~100 KB por petición)

// ---------- Lo que se guarda de cada persona ----------
// Nombre con el que se guarda cada dato en el navegador (localStorage). Con cuenta, además se copia en la nube (Firebase)
export const CLAVES_USUARIO = {
    historial: 'fitbites-historial',              // lo comido cada día
    objetivo: 'fitbites-objetivo',                // tu objetivo diario
    favoritas: 'fitbites-favoritas',              // tus recetas favoritas
    compra: 'fitbites-compra',                    // las recetas de la lista de la compra
    compraOk: 'fitbites-compra-ok',               // los ingredientes ya tachados
    compraManual: 'fitbites-compra-manual',       // lo que apuntas a mano en la lista de la compra
    alimentosPropios: 'fitbites-alimentos-propios' // los alimentos que creas tú (tu yogur, tu marca de batido...)
};

export const CLAVE_TEMA = 'fitbites-tema';            // si prefieres tema claro u oscuro (esto se queda solo en el navegador)
export const CLAVE_DIA_ANTIGUO = 'fitbites-dia';      // formato MUY antiguo de "Mi día" (solo hoy): se lee una vez para pasarlo al historial
