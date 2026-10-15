/* =====================================================================
   FIT BITES · app.js  (el punto de entrada)
   Idea general (el restaurante):
   - json/ y json-server = la despensa (alimentos y recetas)
   - almacen.js = la libreta de cada cliente (su diario, objetivo, compra...),
     con copia en la nube si tiene cuenta (nube.js + cuenta.js)
   - los demás archivos de js/ = los camareros: cada uno atiende una zona
       dia.js         -> el diario por comidas y la semana (con gráficos)
       anadir.js      -> la ventana para añadir alimentos y recetas
       alimentos.js   -> la tabla de alimentos y los que creas tú
       recetas.js     -> las tarjetas de recetas, filtros y favoritas
       detalle.js     -> la ventana de una receta (con raciones)
       formulario.js  -> crear y editar recetas (con json-server)
       compra.js      -> la lista de la compra
       interfaz.js    -> tema y barra de pestañas del móvil
       config.js, estado.js, utilidades.js, datos.js, fotos.js -> herramientas compartidas
   - este archivo = el jefe de sala: abre el restaurante y pone a
     cada camarero en su sitio (llama a sus funciones iniciar...)

   Son "módulos": cada archivo dice qué comparte (export) y qué usa
   de otros (import). En index.html se carga con <script type="module">.
   ===================================================================== */

import { EN_LOCAL } from './config.js';                 // ¿estamos en tu ordenador?
import { estado } from './estado.js';                   // donde se guardan las recetas cargadas
import { cargarRecetas } from './datos.js';             // pedir las recetas
import { iniciarInterfaz, iniciarPestanas, marcarPestana } from './interfaz.js'; // tema y barra de pestañas del móvil
import { iniciarAlimentos } from './alimentos.js';      // la tabla de alimentos
import { iniciarDia, cambiarVista } from './dia.js';   // el diario
import { iniciarAnadir, abrirAnadir } from './anadir.js'; // la ventana de añadir
import { iniciarRecetas, mostrarRecetas, aplicarModo } from './recetas.js'; // la lista de recetas
import { iniciarDetalle } from './detalle.js';          // la ventana de detalle
import { iniciarFormulario } from './formulario.js';    // el formulario de recetas
import { iniciarCompra } from './compra.js';            // la lista de la compra
import { iniciarCuenta } from './cuenta.js';            // cuentas (Firebase)

// Carga las recetas; si falla, enseña un aviso en su sección (el diario sigue funcionando)
async function cargarRecetasConAviso() {
    try {
        estado.recetas = await cargarRecetas();            // las pide (a json-server o al archivo)
    } catch (error) {
        console.error('No se pudieron cargar las recetas:', error);
        document.querySelector('#listaRecetas').innerHTML = `
      <div class="col-12">
        <div class="alert alert-warning mb-0">
          No se pudieron cargar las recetas.
          ${EN_LOCAL ? '<br>Comprueba que existe <code>json/recetas.json</code>.' : ''}
        </div>
      </div>`;
    }
}

async function iniciar() {
    document.documentElement.classList.add('js');         // avisa al CSS de que JavaScript funciona (para las animaciones)

    // ---- App instalable: el service worker guarda una copia para usarla sin internet ----
    // Solo se registra en la web publicada (no en tu ordenador): así, mientras programas, nunca ves archivos viejos guardados
    if ('serviceWorker' in navigator && !EN_LOCAL) {
        navigator.serviceWorker.register('sw.js').catch(error => console.error('No se pudo registrar el service worker:', error));
    }

    iniciarInterfaz();                                     // tema claro/oscuro

    // las recetas y la tabla de alimentos se piden A LA VEZ (Promise.all espera a las dos)
    try {
        await Promise.all([cargarRecetasConAviso(), iniciarAlimentos()]);
    } catch (error) {                                      // si falla la tabla de alimentos...
        console.error('No se pudo cargar la tabla de alimentos:', error);
        document.querySelector('#avisoAlimentos').classList.remove('d-none'); // ...aviso en la página
    }

    iniciarDia();                                          // el diario (después de las recetas: así puede pasar al formato nuevo lo que tenías apuntado)
    iniciarAnadir();                                       // la ventana de añadir
    iniciarCompra();                                       // lista de la compra
    iniciarRecetas();                                      // filtros, favoritas y tarjetas
    iniciarDetalle();                                      // ventana de detalle
    iniciarFormulario();                                   // formulario de receta

    mostrarRecetas();                                      // dibuja las tarjetas
    aplicarModo();                                         // muestra u oculta los botones de editar según haya json-server

    // la barra de pestañas del móvil: qué hace cada botón
    iniciarPestanas({
        verDia: () => cambiarVista('dia'),
        verSemana: () => cambiarVista('semana'),
        anadir: () => abrirAnadir()                        // sin comida: propone la que toca por la hora
    });
    // los botones Día / Semana de arriba también encienden su pestaña de abajo
    document.querySelector('#btnVistaDia').addEventListener('click', () => marcarPestana('tabDiario'));
    document.querySelector('#btnVistaSemana').addEventListener('click', () => marcarPestana('tabSemana'));

    iniciarCuenta();                                       // por último, las cuentas (si llegan datos de la nube, todo se repinta solo)
}

// Los módulos se ejecutan cuando el HTML ya está leído, así que podemos arrancar directamente
iniciar();
