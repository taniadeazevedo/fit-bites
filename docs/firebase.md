# 🔐 Activar las cuentas (Firebase)

Unos 10 minutos. Es gratis (plan Spark) y no pide tarjeta.

## 1. Crear el proyecto
1. Entra en [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta de Google.
2. **Crear un proyecto**, con el nombre `fit-bites`. Google Analytics: **no** hace falta.

## 2. Registrar la web y copiar la configuración
1. En la página del proyecto, pulsa el icono **`</>`** (Web) y ponle de apodo `fit-bites`. *Firebase Hosting* no hace falta: la web ya está en GitHub Pages.
2. Te enseña un trozo de código con `const firebaseConfig = { ... }`. Copia **solo el objeto** `{ ... }`.
3. Pégalo en `js/firebase-config.js`, en lugar de `null`:
   ```js
   export const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
   ```

## 3. Activar las formas de entrar
**Compilación → Authentication → Comenzar → Sign-in method**:
- **Correo electrónico/contraseña** → Habilitar → Guardar.
- **Google** → Habilitar → elige tu email de asistencia → Guardar.

Después, en **Authentication → Configuración → Dominios autorizados → Agregar dominio**, añade `taniadeazevedo.github.io`. (`localhost` ya viene puesto.)

## 4. Crear la base de datos
**Compilación → Firestore Database → Crear base de datos**:
- Ubicación: `eur3 (Europa)`.
- Empieza en **modo de producción**.

Luego, en la pestaña **Reglas**, sustituye todo por esto y pulsa **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

👉 Estas reglas significan que **cada persona solo puede leer y escribir su propio documento**. Esto es lo que protege los datos. Los valores de `firebase-config.js` no son secretos: se ven en cualquier web que use Firebase.

## 5. Probar
Abre la web con Live Server. Arriba aparece **Entrar**: crea una cuenta, apunta algo y abre la web en el móvil con la misma cuenta. Tiene que salir lo mismo.

---

**Cómo funciona por dentro:** `almacen.js` guarda siempre en el navegador, y `nube.js` sube cada cambio a `usuarios/{tu-id}` en Firestore. La primera vez que entras se sube lo que tenías en ese navegador. Después manda la nube.
