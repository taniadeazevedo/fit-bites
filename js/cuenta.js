/* =====================================================================
   FIT BITES · cuenta.js
   El botón "Entrar" del menú y la ventana de la cuenta:
   - sin sesión: entrar con Google, o con email y contraseña (o crear cuenta)
   - con sesión: quién eres y "Cerrar sesión"
   Lo que habla con Firebase está en nube.js; aquí solo va la pantalla.
   ===================================================================== */

import { nubeDisponible, iniciarNube, entrarConGoogle, entrarConEmail, crearCuenta, recuperarContrasena, salir, mensajeDeError } from './nube.js';
import { escaparHtml, mostrarAviso } from './utilidades.js';

let usuarioActual = null;      // la persona que ha entrado (o null)
let modoCrear = false;         // true = el formulario está en "Crear cuenta"; false = "Entrar"

const q = selector => document.querySelector(selector); // atajo

// Enseña un error en la ventana (o lo quita si texto es '')
function mostrarError(texto) {
    const caja = q('#errorCuenta');
    caja.textContent = texto;
    caja.classList.toggle('d-none', texto === '');
}

// Cambia el botón del menú y lo que se ve en la ventana según haya sesión o no
function pintarCuenta() {
    const boton = q('#btnCuenta');
    if (usuarioActual) {
        const nombre = usuarioActual.displayName || usuarioActual.email; // el nombre, o el email si no tiene
        boton.innerHTML = `<i class="bi bi-person-check-fill" aria-hidden="true"></i> <span class="d-lg-none d-xl-inline">${escaparHtml(nombre.split(' ')[0].split('@')[0])}</span>`; // solo el primer nombre (o lo de antes de la @)
        boton.setAttribute('aria-label', 'Tu cuenta: ' + nombre);
        q('#cuentaNombre').textContent = nombre;
    } else {
        boton.innerHTML = '<i class="bi bi-person" aria-hidden="true"></i> Entrar';
        boton.setAttribute('aria-label', 'Entrar o crear una cuenta');
    }
    q('#cuentaFuera').classList.toggle('d-none', Boolean(usuarioActual)); // formulario de entrar: solo sin sesión
    q('#cuentaDentro').classList.toggle('d-none', !usuarioActual);       // datos de la cuenta: solo con sesión
}

// Cambia el formulario entre "Entrar" y "Crear cuenta"
function pintarModo() {
    q('#tituloCuenta').textContent = modoCrear ? 'Crear cuenta' : 'Entrar';
    q('#campoNombreCuenta').classList.toggle('d-none', !modoCrear);      // el nombre solo hace falta al crear
    q('#btnEnviarCuenta').textContent = modoCrear ? 'Crear cuenta' : 'Entrar';
    q('#btnCambiarModo').textContent = modoCrear ? '¿Ya tienes cuenta? Entra' : '¿No tienes cuenta? Créala';
    q('#formCuenta').contrasena.autocomplete = modoCrear ? 'new-password' : 'current-password'; // así el gestor de contraseñas sabe qué hacer
    q('#btnOlvido').classList.toggle('d-none', modoCrear);
    mostrarError('');
}

// Cierra la ventana de la cuenta
function cerrarVentana() {
    bootstrap.Modal.getInstance(q('#modalCuenta'))?.hide();
}

export function iniciarCuenta() {
    if (!nubeDisponible) return;                           // sin Firebase configurado, el botón "Entrar" no sale

    q('#itemCuenta').classList.remove('d-none');           // enseñamos el botón del menú
    pintarCuenta();
    pintarModo();

    // arranca Firebase; cada vez que alguien entra o sale, se repinta
    iniciarNube((usuario) => {
        const acabaDeEntrar = usuario && !usuarioActual;   // ¿antes no había nadie y ahora sí?
        usuarioActual = usuario;
        pintarCuenta();
        if (acabaDeEntrar && q('#modalCuenta').classList.contains('show')) { // si entra desde la ventana...
            cerrarVentana();                               // ...la cerramos
            mostrarAviso('¡Hola! Tus datos se guardan en tu cuenta ✓');
        }
    }).catch(error => {                                    // si no se pudo cargar Firebase (sin internet, por ejemplo)
        console.error('No se pudo cargar Firebase:', error);
        q('#itemCuenta').classList.add('d-none');
    });

    q('#btnGoogle').addEventListener('click', async () => {
        mostrarError('');
        try { await entrarConGoogle(); }
        catch (error) { mostrarError(mensajeDeError(error)); }
    });

    q('#btnCambiarModo').addEventListener('click', () => { modoCrear = !modoCrear; pintarModo(); });

    q('#formCuenta').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const boton = q('#btnEnviarCuenta');
        mostrarError('');
        boton.disabled = true;                             // mientras espera, el botón se apaga (para no pulsar dos veces)
        try {
            if (modoCrear) await crearCuenta(f.email.value.trim(), f.contrasena.value, f.nombre.value.trim());
            else await entrarConEmail(f.email.value.trim(), f.contrasena.value);
            f.reset();
        } catch (error) {
            mostrarError(mensajeDeError(error));
        } finally {                                        // "finally" se ejecuta siempre, haya ido bien o mal
            boton.disabled = false;
        }
    });

    q('#btnOlvido').addEventListener('click', async () => {
        const email = q('#formCuenta').email.value.trim();
        if (!email) { mostrarError('Escribe tu email arriba y vuelve a pulsar.'); return; }
        try {
            await recuperarContrasena(email);
            mostrarError('');
            mostrarAviso('Te hemos enviado un correo para cambiar la contraseña ✓');
        } catch (error) {
            mostrarError(mensajeDeError(error));
        }
    });

    q('#btnSalir').addEventListener('click', async () => {
        await salir();
        cerrarVentana();
        mostrarAviso('Has cerrado la sesión');
    });
}
