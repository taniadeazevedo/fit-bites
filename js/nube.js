/* =====================================================================
   FIT BITES · nube.js
   Cuentas y datos en la nube con Firebase:
   - Authentication: entrar con Google o con email y contraseña
   - Firestore: un documento por persona, usuarios/{uid}, con sus datos
   Firebase solo se descarga si firebase-config.js tiene tu configuración.

   Cómo se sincroniza:
   - Al entrar: si tu documento en la nube está vacío (primera vez), se sube
     lo que había en este navegador. Si no, la nube manda: se copia aquí.
   - Cada cambio que hagas se sube a los 0,8 s (si haces varios seguidos, va todo junto).
   - Si cambias algo en otro dispositivo, llega solo (onSnapshot) y se repinta.
   ===================================================================== */

import { firebaseConfig } from './firebase-config.js';  // tu configuración (o null)
import { todosLosDatos, reemplazarTodo, borrarTodoLocal, ponerSubida } from './almacen.js'; // el almacén de datos

const VERSION = '10.12.2';                                 // versión de Firebase que descargamos
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}/`; // de dónde (los archivos oficiales de Google)

export const nubeDisponible = Boolean(firebaseConfig);     // Boolean(null) = false: sin configuración no hay cuentas

let fb = {};                   // las funciones de Firebase que usamos (se rellenan al cargar)
let auth = null;               // el servicio de cuentas
let db = null;                 // la base de datos
let referencia = null;         // el documento de la persona que ha entrado: usuarios/{uid}
let dejarDeEscuchar = null;    // función para dejar de escuchar cambios de la nube
let pendiente = {};            // cambios que esperan a subirse: { historial: {...}, platos: [...] }
let temporizador = null;       // el "reloj" que sube los cambios a los 0,8 s

// Carga Firebase y avisa (con "alCambiarUsuario") cada vez que alguien entra o sale
export async function iniciarNube(alCambiarUsuario) {
    if (!nubeDisponible) return;                           // sin configuración, no hacemos nada

    // import(...) con paréntesis descarga un módulo cuando lo pedimos (y no antes). Promise.all espera a los tres a la vez
    const [app, autenticacion, firestore] = await Promise.all([
        import(BASE + 'firebase-app.js'),
        import(BASE + 'firebase-auth.js'),
        import(BASE + 'firebase-firestore.js')
    ]);

    fb = { ...autenticacion, ...firestore };               // juntamos todas sus funciones en un objeto
    const aplicacion = app.initializeApp(firebaseConfig);  // arranca Firebase con tu proyecto
    auth = fb.getAuth(aplicacion);                         // el servicio de cuentas
    auth.languageCode = 'es';                              // los correos y ventanas de Google, en español
    db = fb.getFirestore(aplicacion);                      // la base de datos

    // onAuthStateChanged avisa al cargar la página y cada vez que alguien entra o sale
    fb.onAuthStateChanged(auth, (usuario) => {
        if (usuario) {
            conectar(usuario);                             // ha entrado: empezamos a sincronizar
        } else {
            desconectar();                                 // no hay nadie: dejamos de sincronizar
        }
        alCambiarUsuario(usuario);                         // y avisamos (para cambiar el botón de la cuenta)
    });
}

// Empieza a sincronizar los datos de esta persona
function conectar(usuario) {
    referencia = fb.doc(db, 'usuarios', usuario.uid);      // su documento: usuarios/{su id}

    // onSnapshot "escucha" el documento: avisa ahora y cada vez que cambie (también desde otro dispositivo)
    dejarDeEscuchar = fb.onSnapshot(referencia, (foto) => {
        if (foto.metadata.hasPendingWrites) return;        // es un cambio nuestro que aún se está subiendo: no hace falta hacer nada

        if (!foto.exists()) {                              // la primera vez no hay documento...
            fb.setDoc(referencia, { ...todosLosDatos(), actualizado: fb.serverTimestamp() }) // ...subimos lo de este navegador
                .catch(error => console.error('No se pudieron subir tus datos:', error));
            return;
        }

        reemplazarTodo(foto.data(), Object.keys(pendiente)); // la nube manda (menos lo que aún estamos subiendo)
    }, (error) => console.error('Error escuchando la nube:', error));

    ponerSubida(programarSubida);                          // a partir de ahora, cada cambio se sube
}

// Deja de sincronizar
function desconectar() {
    if (dejarDeEscuchar) dejarDeEscuchar();                // dejamos de escuchar
    dejarDeEscuchar = null;
    referencia = null;
    ponerSubida(null);                                     // los cambios ya no se suben
}

// Apunta un cambio y pone el reloj: si en 0,8 s no hay más cambios, se sube todo junto
function programarSubida(clave, valor) {
    pendiente[clave] = valor;                              // apuntamos el cambio
    clearTimeout(temporizador);                            // paramos el reloj anterior (si lo había)...
    temporizador = setTimeout(subirPendiente, 800);        // ...y ponemos uno nuevo
}

// Sube los cambios apuntados
async function subirPendiente() {
    if (!referencia || Object.keys(pendiente).length === 0) return; // sin cuenta o sin cambios, nada
    const cambios = pendiente;                             // nos quedamos con los cambios...
    pendiente = {};                                        // ...y vaciamos la lista

    try {
        // merge: true = solo cambia esos campos y deja el resto del documento como estaba
        await fb.setDoc(referencia, { ...cambios, actualizado: fb.serverTimestamp() }, { merge: true });
    } catch (error) {
        console.error('No se pudieron subir los cambios:', error);
        pendiente = { ...cambios, ...pendiente };          // los volvemos a apuntar para el siguiente intento
    }
}

/* ---------- Entrar, crear cuenta y salir (los usa cuenta.js) ---------- */

export function entrarConGoogle() {
    return fb.signInWithPopup(auth, new fb.GoogleAuthProvider()); // abre la ventanita de Google
}

export function entrarConEmail(email, contrasena) {
    return fb.signInWithEmailAndPassword(auth, email, contrasena);
}

export async function crearCuenta(email, contrasena, nombre) {
    const credencial = await fb.createUserWithEmailAndPassword(auth, email, contrasena); // crea la cuenta (y entra)
    if (nombre) await fb.updateProfile(credencial.user, { displayName: nombre });         // le pone el nombre
    return credencial;
}

export function recuperarContrasena(email) {
    return fb.sendPasswordResetEmail(auth, email);         // Firebase envía un correo para cambiarla
}

export async function salir() {
    clearTimeout(temporizador);                            // paramos el reloj...
    await subirPendiente();                                // ...y subimos lo que faltara antes de salir
    await fb.signOut(auth);                                // cerramos la sesión
    borrarTodoLocal();                                     // y borramos tus datos de este navegador (siguen en tu cuenta)
}

// Traduce los errores de Firebase a un mensaje que se entienda
export function mensajeDeError(error) {
    const mensajes = {
        'auth/invalid-credential': 'El email o la contraseña no son correctos.',
        'auth/invalid-email': 'Ese email no parece válido.',
        'auth/user-not-found': 'No hay ninguna cuenta con ese email.',
        'auth/wrong-password': 'La contraseña no es correcta.',
        'auth/missing-password': 'Escribe la contraseña.',
        'auth/email-already-in-use': 'Ya hay una cuenta con ese email. Prueba a entrar.',
        'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiados intentos. Espera un poco y vuelve a probar.',
        'auth/network-request-failed': 'No hay conexión a internet.',
        'auth/popup-closed-by-user': 'Has cerrado la ventana de Google antes de terminar.',
        'auth/popup-blocked': 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes.',
        'auth/unauthorized-domain': 'Esta dirección no está autorizada en Firebase (mira docs/firebase.md, paso 3).'
    };
    if (String(error?.code).includes('api-key')) return 'La configuración de Firebase no es correcta: revisa js/firebase-config.js.'; // la clave copiada está mal
    return mensajes[error?.code] ?? 'Algo ha fallado. Vuelve a intentarlo.'; // "?." = si error es null, no falla; "??" = si no hay mensaje, el genérico
}
