# Geniova Drive

Gestor de archivos web para NAS corporativo. Permite a los empleados navegar, buscar, subir y descargar archivos desde cualquier navegador, con permisos granulares por grupo y auditoría completa.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | [Astro](https://astro.build/) SSR + [Lit](https://lit.dev/) Web Components |
| Backend | Node.js 20 (Astro API routes) |
| Base de datos | PostgreSQL 16 |
| Autenticación | [Auth&Sign](https://github.com/Geniova-Technologies) (SSO con JWT RS256 via JWKS) |
| Búsqueda | PostgreSQL `pg_trgm` (índice trigram) |
| Contenedores | Docker Compose |
| Proxy inverso | nginx con SSL |

## Características

- **Explorador de archivos** con navegación por carpetas, ordenación, breadcrumbs y árbol expandible
- **Subida de archivos** por chunks con drag & drop compacto, progreso y reanudación
- **Descarga individual** y **descarga ZIP** en lote
- **Búsqueda local** (dentro de carpeta) y **global** (todos los alias del usuario)
- **Paginación avanzada**: controles arriba y abajo, selector de tamaño (25/50/100), sincronización con querystring (`?page=2&pageSize=100`)
- **Deep-linking** con `?path=` para compartir enlaces directos a carpetas
- **Accesos directos** descargables para escritorio (Windows .url, Linux .desktop, macOS .webloc)
- **Tema claro/oscuro** con detección automática de preferencia del sistema
- **Accesibilidad**: focus traps en formularios, `aria-labels`, `aria-live`, navegación completa por teclado
- **Presencia en tiempo real**: badges que muestran qué usuarios están navegando cada carpeta
- **Cuotas de disco** por usuario con control en subidas
- **Permisos en la API**: el endpoint de listado devuelve los permisos del usuario (`read`, `write`, `delete`, `move`) para que el frontend oculte acciones no permitidas
- **Pre-registro de usuarios**: los administradores pueden dar de alta usuarios con email y grupo asignado antes de su primer login; al logearse, se vinculan automáticamente con los permisos configurados
- **Anonimizador SQL/CSV**: parsea archivos `.sql` (MySQL/MariaDB) y `.csv`, permite elegir estrategias de anonimización por columna (fake con datos españoles, shuffle, mask, hash SHA256) y genera un archivo `_anonymized` en la misma ruta. Incluye [documentación completa](/docs/data-anonymizer)
- **Auditoría completa**: registro de accesos, descargas, subidas, movimientos, logins y logouts
- **Panel de administración**: usuarios, grupos, alias, volúmenes, permisos y log de auditoría

## Arquitectura

```
┌─────────────┐     HTTPS     ┌─────────┐     HTTP     ┌──────────────────┐
│  Navegador  │──────────────▶│  nginx  │────────────▶│  Astro SSR       │
│  (Lit WC)   │◀──────────────│  :443   │◀────────────│  (Node.js :3000) │
└─────────────┘               └─────────┘             └────────┬─────────┘
                                                               │
                                              ┌────────────────┼────────────────┐
                                              ▼                ▼                ▼
                                     ┌──────────────┐  ┌─────────────┐  ┌────────────┐
                                     │ PostgreSQL   │  │ NAS (SMB)   │  │ Auth&Sign  │
                                     │ :5432        │  │ /mnt/*      │  │ (JWKS)     │
                                     └──────────────┘  └─────────────┘  └────────────┘
```

### Estructura de carpetas

```
src/
  components/          # Componentes Lit (gd-app, gd-file-explorer, gd-file-upload, admin panels)
  lib/                 # Lógica de negocio (auth, permisos, audit, upload, indexer, config)
    anonymizer/        # Motor de anonimización (estrategias: fake, shuffle, mask, hash)
    parsers/           # Parsers SQL (MySQL) y CSV con detección de delimitador
    generators/        # Generadores de salida SQL y CSV
    pagination-url.js  # Sincronización paginación ↔ querystring
  pages/
    index.astro        # Página principal
    auth/callback.astro # Callback OAuth
    api/               # Endpoints REST
      files.js         # Listado y borrado (incluye permisos del usuario en respuesta)
      files/           # download, upload/*, search, mkdir, rename, move, download-zip
                       # parse-data, anonymize-data
      admin/           # users (+ pre-registro), groups, aliases, volumes, folder-permissions, audit, reindex
      aliases.js       # Alias accesibles por el usuario
      quota.js         # Cuota del usuario
      presence.js      # Presencia en tiempo real
    docs/
      data-anonymizer.astro  # Documentación del anonimizador
  db/
    migrations/        # SQL secuencial (001..007)
    migrate.js         # Runner de migraciones
  middleware.js        # Auth middleware (JWT verificación + JIT provisioning)
nginx/                 # Config de proxy inverso
docker-compose.yml
Dockerfile             # Multi-stage build (deps → build → runtime)
entrypoint.sh          # Migraciones + arranque
```

## Instalación

### Requisitos previos

- **Docker** y **Docker Compose** v2+
- Un **NAS** montado via SMB/NFS en el servidor (ej: `/mnt/datosnas`, `/mnt/nocomun`)
- Una instancia de **Auth&Sign** para autenticación SSO
- (Opcional) **nginx** para SSL y proxy inverso

### 1. Clonar el repositorio

```bash
git clone git@github.com:Geniova-Technologies/geniova-drive.git
cd geniova-drive
```

### 2. Configurar variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# === Auth&Sign ===
AUTH_SIGN_URL=https://auth.tudominio.com    # URL de tu instancia Auth&Sign
AUTH_APP_ID=geniova-drive                   # App ID registrada en Auth&Sign

# === PostgreSQL ===
POSTGRES_HOST=postgres                      # "postgres" si usas Docker Compose
POSTGRES_PORT=5432
POSTGRES_DB=geniova_drive
POSTGRES_USER=geniova
POSTGRES_PASSWORD=tu_password_seguro

# === App ===
APP_PORT=3000
PUBLIC_URL=https://drive.tudominio.com      # URL pública (para auth redirects y cookies)

# === NAS Mounts ===
NAS_DATOSNAS=/mnt/datosnas                  # Ruta del primer volumen NAS montado
NAS_NOCOMUN=/mnt/nocomun                    # Ruta del segundo volumen (opcional)

# === Opcional ===
REINDEX_CRON=0 2 * * *                     # Cron de reindexación (default: 02:00 UTC)
UPLOAD_TMP_DIR=/tmp/geniova-uploads         # Directorio temporal para chunks
DEV_BYPASS_AUTH=false                       # true solo para desarrollo local
```

### 3. Montar los volúmenes NAS

Los volúmenes NAS deben estar montados en el servidor host antes de arrancar Docker. Ejemplo con SMB en `/etc/fstab`:

```fstab
//nas-server/datosnas  /mnt/datosnas  cifs  credentials=/etc/samba/creds,uid=1000,gid=1000,file_mode=0775,dir_mode=0775  0  0
//nas-server/nocomun   /mnt/nocomun   cifs  credentials=/etc/samba/creds,uid=1000,gid=1000,file_mode=0775,dir_mode=0775  0  0
```

Verificar que están montados:

```bash
ls /mnt/datosnas
ls /mnt/nocomun
```

### 4. Arrancar con Docker Compose

```bash
docker compose up -d --build
```

Esto levanta:
- **geniova-drive**: app Node.js en puerto 3000
- **geniova-drive-db**: PostgreSQL 16 en puerto 5433 (expuesto para debug)

Las migraciones de base de datos se ejecutan automáticamente en cada arranque.

### 5. Configurar nginx (recomendado)

Copiar la configuración incluida:

```bash
sudo cp nginx/drive.geniova.es.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/drive.geniova.es.conf /etc/nginx/sites-enabled/
```

Editar el fichero para ajustar:
- `server_name` con tu dominio o IP
- Rutas de certificados SSL
- Puerto del backend si lo cambiaste

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Primer acceso

1. Abre `https://drive.tudominio.com` (o `http://servidor:3000` sin nginx)
2. Serás redirigido a Auth&Sign para login
3. El primer usuario que inicie sesión con rol admin en Auth&Sign será admin en Drive
4. Los usuarios se crean automáticamente (JIT provisioning) en el primer login

## Configuración inicial (panel admin)

Una vez dentro como admin, configura en este orden:

### 1. Volúmenes

En **Admin > Volúmenes**, registra los puntos de montaje NAS:

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| Nombre | `datosnas` | Identificador del volumen |
| Ruta de montaje | `/mnt/datosnas` | Ruta real en el servidor |
| Activo | `true` | Si el volumen es accesible |

### 2. Alias

En **Admin > Alias**, crea alias que mapean nombres amigables a rutas del NAS:

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| Nombre del alias | `Datos Comunes` | Nombre visible para usuarios |
| Ruta real | `/mnt/datosnas/DATOS/COMUN` | Ruta absoluta en el NAS |
| Visible | `true` | Si aparece como pestaña navegable |

Los alias son la unidad de acceso: los usuarios solo ven los alias a los que tienen permiso.

### 3. Grupos

En **Admin > Grupos**, crea grupos de usuarios (ej: `produccion`, `diseno`, `comercial`). Luego asigna usuarios a grupos desde la misma vista.

### 4. Permisos

En **Admin > Permisos de carpetas**, asigna permisos por grupo y alias:

| Permiso | Descripción |
|---------|-------------|
| `can_read` | Ver contenido del alias |
| `can_write` | Subir archivos y crear carpetas |
| `can_delete` | Mover archivos a la papelera |
| `can_move` | Mover y renombrar archivos |

Los permisos se combinan con OR entre los grupos del usuario. Los administradores tienen acceso total sin necesidad de permisos explícitos.

## Replicar en otro servidor

Para desplegar en un servidor nuevo con un NAS diferente:

1. **Preparar el servidor**:
   ```bash
   # Instalar Docker
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER

   # Montar NAS
   sudo mkdir -p /mnt/tu-nas
   sudo mount -t cifs //ip-nas/share /mnt/tu-nas -o credentials=/etc/samba/creds
   ```

2. **Copiar el proyecto** (rsync o git clone):
   ```bash
   git clone git@github.com:Geniova-Technologies/geniova-drive.git
   cd geniova-drive
   ```

3. **Crear `.env`** con las rutas de tu NAS y tu instancia Auth&Sign

4. **Editar `docker-compose.yml`** para mapear tus volúmenes NAS:
   ```yaml
   volumes:
     - /mnt/tu-nas:/mnt/tu-nas        # Ajustar a tus rutas
   ```

5. **Arrancar**:
   ```bash
   docker compose up -d --build
   ```

6. **Configurar** volúmenes, alias, grupos y permisos desde el panel admin

La base de datos se crea con las migraciones automáticas. El primer usuario admin de Auth&Sign obtiene permisos de admin automáticamente.

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Arrancar PostgreSQL local (o usar Docker)
docker compose up -d postgres

# Configurar .env con DEV_BYPASS_AUTH=true para saltar autenticación
cp .env.example .env
# Editar .env: POSTGRES_HOST=localhost, DEV_BYPASS_AUTH=true

# Ejecutar migraciones
npm run db:migrate

# Arrancar en modo desarrollo
npm run dev
```

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo con hot reload |
| `npm run build` | Build de producción |
| `npm run start` | Arrancar build de producción |
| `npm run test` | Ejecutar tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Tests con informe de cobertura |
| `npm run db:migrate` | Ejecutar migraciones pendientes |
| `npm run db:status` | Ver estado de migraciones |
| `npm run deploy` | Desplegar al servidor de producción |

## Autenticación: Auth&Sign

Geniova Drive delega toda la autenticación en **Auth&Sign**, el sistema SSO interno de Geniova Technologies. No gestiona contraseñas ni sesiones propias.

### Flujo de login

1. El usuario accede a Drive y es redirigido a Auth&Sign (`AUTH_SIGN_URL`)
2. Auth&Sign autentica (user/pass o Microsoft SSO) y emite un **JWT RS256**
3. Drive verifica el JWT contra el **JWKS** público de Auth&Sign (`AUTH_SIGN_URL/.well-known/jwks.json`)
4. Si el usuario no existe en la base de datos local, se crea automáticamente (**JIT provisioning**)
5. Si el usuario fue **pre-registrado** por un admin (con email y grupo), se vincula automáticamente al registro existente y hereda los permisos

### Tokens y sesión

- El JWT se almacena en una cookie `HttpOnly` segura
- El middleware de autenticación (`src/middleware.js`) verifica el JWT en cada petición
- Cuando el usuario cierra sesión en Auth&Sign, la cookie se invalida y Drive redirige al login
- El endpoint `logout_all` revoca sesiones en todos los dispositivos

### Pre-registro de usuarios

Los administradores pueden dar de alta usuarios antes de que se loguen por primera vez:

1. En **Admin > Usuarios**, pulsar "Pre-registrar usuario"
2. Indicar email y asignar uno o más grupos
3. Cuando el usuario se logue por primera vez via Auth&Sign, Drive lo reconoce por email, vincula su cuenta y aplica los permisos del grupo automáticamente

Esto evita que los nuevos usuarios entren sin permisos y necesiten intervención manual del admin.

## Anonimizador de datos (SQL/CSV)

Permite anonimizar archivos `.sql` (dumps MySQL/MariaDB) y `.csv` directamente desde el explorador de archivos, sin salir de la aplicación.

### Estrategias de anonimización

| Estrategia | Descripción | Reversible |
|------------|-------------|------------|
| **Fake** | Reemplaza con datos sintéticos realistas (nombres, emails, teléfonos, NIFs españoles) usando `@faker-js/faker` locale `es` | No |
| **Shuffle** | Redistribuye los valores entre filas aleatoriamente (Fisher-Yates) | No |
| **Mask** | Enmascara parcialmente: `Juan ***`, `j***@email.com`, `***4567X` | No |
| **Hash** | Reemplaza por SHA256 truncado, consistente (mismo valor → mismo hash) | No |
| **Preserve** | No modifica la columna | — |

### Cómo usar

1. Navegar a un archivo `.sql` o `.csv` en el explorador
2. Pulsar el botón **Anonimizar** en la barra de acciones
3. El sistema parsea el archivo y muestra las tablas/columnas con datos de muestra
4. Seleccionar una estrategia por columna
5. Pulsar **Generar archivo anonimizado**
6. Se crea `{nombre}_anonymized.{ext}` en la misma carpeta

### Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/files/parse-data` | POST | Parsea SQL/CSV y devuelve estructura + sample (max 500MB) |
| `/api/files/anonymize-data` | POST | Aplica estrategias y genera archivo anonimizado |

Documentación completa disponible en `/docs/data-anonymizer` dentro de la aplicación.

## Auditoría

Todas las acciones quedan registradas en la tabla `audit_log`:

| Acción | Cuándo se registra |
|--------|--------------------|
| `login` | Al completar el login via Auth&Sign |
| `logout` | Al cerrar sesión |
| `logout_all` | Al revocar todas las sesiones |
| `access` | Al navegar a una carpeta (deduplicado: 1 registro por usuario+carpeta cada 5 min) |
| `download` | Al descargar un archivo |
| `download_zip` | Al descargar un ZIP en lote |
| `upload` | Al subir un archivo |
| `delete` | Al mover un archivo a la papelera |
| `rename` | Al renombrar |
| `move` | Al mover a otra carpeta |
| `mkdir` | Al crear una carpeta |
| `user_linked` | Al vincular un usuario pre-registrado con su cuenta de Auth&Sign en el primer login |

El log es consultable en **Admin > Auditoría** con filtros por día, usuario y tipo de acción.

## Licencia

Software privado de [Geniova Technologies](https://geniova.com). Todos los derechos reservados.
