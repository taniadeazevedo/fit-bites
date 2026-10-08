/* =====================================================================
   FIT BITES · sw.js  (service worker)
   Un service worker es un "ayudante" que el navegador ejecuta aparte de la página.
   Aquí hace dos cosas:
   1) Guarda una copia de la web en el móvil, para que se abra aunque no haya internet.
   2) Hace posible instalar la web como una app (junto con manifest.webmanifest).
   Estrategia "primero la red": si hay internet, se pide lo más nuevo (y se actualiza
   la copia); si no hay, se usa la copia guardada. Así nunca te quedas con una versión vieja.
   ===================================================================== */

const CACHE = 'fitbites-v1';                       // nombre de la "caja" donde guardamos las copias (si algún día cambias la estructura, súbelo a v2)

// Lo mínimo para que la web arranque sin internet (rutas relativas a esta carpeta)
const ARCHIVOS = [
    './',
    'index.html',
    'css/estilos.css',
    'js/app.js',
    'json/recetas.json',
    'json/ingredientes.json',
    'favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

// "install": ocurre la primera vez que se registra el service worker. Guardamos los archivos básicos
self.addEventListener('install', (evento) => {
    evento.waitUntil(                              // waitUntil = "no des por terminada la instalación hasta que acabe esto"
        caches.open(CACHE).then(caja => caja.addAll(ARCHIVOS)) // abre la caja y guarda todos los archivos
    );
    self.skipWaiting();                            // se activa ya, sin esperar a que se cierren las pestañas antiguas
});

// "activate": ocurre cuando empieza a mandar. Borramos las cajas de versiones antiguas
self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then(nombres =>              // la lista de cajas que hay
            Promise.all(nombres.filter(n => n !== CACHE).map(n => caches.delete(n))) // borra todas menos la actual
        ).then(() => self.clients.claim())         // y empieza a controlar las pestañas abiertas
    );
});

// "fetch": ocurre cada vez que la página pide algo (un archivo, una foto, una fuente...)
self.addEventListener('fetch', (evento) => {
    const peticion = evento.request;               // lo que se está pidiendo
    if (peticion.method !== 'GET') return;         // solo manejamos lecturas (los POST, PUT... van directos a la red)
    if (!peticion.url.startsWith('http')) return;  // ignoramos cosas raras (extensiones del navegador)

    evento.respondWith(                            // respondWith = "yo contesto a esta petición"
        fetch(peticion)                            // 1) probamos primero con internet...
            .then(respuesta => {
                if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) { // si llegó bien...
                    const copia = respuesta.clone();                              // ...hacemos una copia (una respuesta solo se puede leer una vez)...
                    caches.open(CACHE).then(caja => caja.put(peticion, copia));  // ...y la guardamos para otro día
                }
                return respuesta;                  // devolvemos lo que llegó
            })
            .catch(() =>                           // 2) si falla (sin internet)...
                caches.match(peticion).then(guardada =>   // ...buscamos la copia guardada
                    guardada || caches.match('index.html')   // ...y si no hay, al menos la página principal
                )
            )
    );
});
