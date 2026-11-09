# DMD · Acceso (login / portal / admin) — proyecto aparte

Proyecto con las páginas de acceso de DMD, extraídas del sitio oficial
(repo DMD-BC/DMD) para mantenerlas en su propio proyecto, igual que el
creador de páginas con IA (dmd-paginas-web-ia).

- `/` e `/login.html` — Iniciar Sesión · Portal Corporativo (entrada principal)
- `/portal.html` — Portal Modular & Dashboard (clientes)
- `/admin.html` — Consola de Administración (solo administradores)

## Cómo funciona el login (real, de servidor)

La autenticación vive **en el servidor** (funciones serverless de Vercel en
`api/`), contra la **misma base de datos Postgres que el builder**
(Neon FREE dmd-builder-db, vía `DATABASE_URL` en Vercel). Es la misma lógica
del builder (`api/_db.js`, `api/_auth.js`): contraseñas con scrypt, sesiones
con token aleatorio (en la DB solo su hash SHA-256) en cookie httpOnly.

- **Correo + contraseña:** `POST /api/auth/register` (nombre, correo,
  contraseña) y `POST /api/auth/login`. `GET /api/auth/me` dice quién está
  en sesión y su cuota (3 anónimo / 25 registrado / 50 con código DMDMX).
  `POST /api/auth/logout` borra la sesión.
- **Google:** botón "Continuar con Google" (Google Identity Services).
  El JWT se verifica **en el servidor** (`POST /api/auth/google`) contra
  `oauth2.googleapis.com/tokeninfo` (aud, iss, exp, email_verified). Si el
  correo no tiene cuenta, se crea con contraseña no usable (solo entra con
  Google). ⚠️ El origen `https://login.dmdmx.dev` aún NO está autorizado en
  Google Cloud Console (solo dmd-login.vercel.app y otros): hasta añadirlo,
  Google rechaza el origen y el frontend muestra el error visible.
  Añadirlo requiere navegador.
- **SSO:** la cookie de sesión lleva `Domain=.dmdmx.dev` cuando el host es
  un subdominio de dmdmx.dev, así que la sesión vale en login.dmdmx.dev y
  en crear.dmdmx.dev a la vez. En local/dev (localhost, *.vercel.app) no se
  pone Domain y la cookie queda host-only.
- **Portal:** exige sesión de servidor (`/api/auth/me`); muestra nombre,
  correo, cuota y las páginas del usuario traídas de
  `https://crear.dmdmx.dev/api/projects` (la cookie SSO viaja con
  `credentials:include`). El botón a admin solo aparece si `is_admin`.
- **Admin:** exige sesión de servidor Y `is_admin=true` (columna
  `is_admin` en `users`, FALSE por defecto; se marca en la DB, ningún
  correo es admin por código). Sin sesión → al login; con sesión pero sin
  ser admin → mensaje de acceso denegado.
- **Proyectos:** `GET /api/projects` es solo lectura (los proyectos se
  crean en el builder). `GET /api/usage` devuelve la cuota.

## Lo que ya NO existe

- No hay OTP ni código `123456` (eliminado de index.html y login.html).
- No hay sesión en `localStorage` (`dmd_user`): `dmd-auth.js` borra las
  claves heredadas al cargar. El `script.js` oficial (www.dmdmx.dev) sigue
  cargándose por el CSS/estilo, pero sus funciones de login
  (`handleLogout`, `triggerGoogleSignIn`, `getClientProfile`) las
  sobrescribe `dmd-auth.js` con las versiones de servidor.

## Pendiente (requiere navegador)

- **Git-linking en Vercel:** conectar el repo GitHub DMD-BC/dmd-login al
  proyecto Vercel `dmd-login` para que los pushes a main desplieguen solos.
- **DATABASE_URL:** poner la misma URL de Neon del builder en el proyecto
  Vercel `dmd-login` (Production + Preview) y redesplegar. Sin ella, los
  endpoints responden `503 { db:false }` y el login no funciona.
- **Origen Google:** añadir `https://login.dmdmx.dev` a los orígenes
  autorizados de JavaScript del client ID en Google Cloud Console.

## Archivos

`index.html` (copia del login), `login.html`, `portal.html`, `admin.html`,
`dmd-auth.js` (cliente de auth de servidor), `dmd-ai-registry.js`,
`dmd-patch.js`, `assets/` (logo, tracker), `api/` (serverless),
`schema.sql`, `package.json`, `vercel.json`.
Los favicons (`favicon.ico`, `apple-touch-icon.png`, `favicon-16x16/32x32.png`)
se sirven desde `https://www.dmdmx.dev` para no duplicar binarios.

## Dependencia del sitio oficial

El CSS y el JS compartidos (`style.css`, 172 KB y `script.js`, 244 KB) se
cargan desde `https://www.dmdmx.dev`, NO están copiados en este proyecto.
Motivo: `script.js` es un solo bloque `DOMContentLoaded` que no se puede
partir en archivos menores sin romper su lógica, y el despliegue estático no
admite subir archivos de ese tamaño en una sola llamada. Cargarlos desde la
oficial mantiene el login con el mismo aspecto y la misma lógica de acceso
que tenía, y `dmd-patch.js` reescribe los enlaces del menú móvil y la barra
inferior (que el script oficial genera con rutas relativas) hacia
`www.dmdmx.dev`, salvo `login.html`, `portal.html` y `admin.html`, que
sí viven aquí. Si algún día se quiere un paquete 100% autocontenido, habría
que refactorizar `script.js` en módulos o servirlo desde este mismo proyecto.
