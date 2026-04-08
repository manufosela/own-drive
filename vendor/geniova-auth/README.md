# @geniova/auth

SDK de autenticación centralizado para aplicaciones Geniova.

## Tabla de contenidos

- [Instalación](#instalación)
- [Configuración de Firebase](#configuración-de-firebase)
- [Inicio rápido](#inicio-rápido)
- [API Reference](#api-reference)
- [Organizaciones](#organizaciones)
- [Encriptación](#encriptación)
- [Ejemplos](#ejemplos)
- [Guía de migración](#guía-de-migración)
- [Troubleshooting](#troubleshooting)
- [Tipos TypeScript](#tipos-typescript)

## Instalación

```bash
npm install @geniova/auth firebase
```

**Requisitos:**
- Node.js >= 18
- Firebase >= 10.0.0

[↑ Volver al índice](#tabla-de-contenidos)

## Configuración de Firebase

### 1. Obtener credenciales

Contacta al equipo de Auth&Sign para obtener las credenciales de Firebase para tu aplicación.

### 2. Variables de entorno (recomendado)

```bash
# .env
FIREBASE_API_KEY=tu-api-key
FIREBASE_AUTH_DOMAIN=geniova-auth.firebaseapp.com
FIREBASE_PROJECT_ID=geniova-auth
FIREBASE_STORAGE_BUCKET=geniova-auth.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123
```

### 3. Configuración en código

```javascript
import { GeniovaAuth } from '@geniova/auth'

const auth = GeniovaAuth.init({
  appId: 'tu-app-id', // ID registrado en Geniova Auth
  firebaseConfig: {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  },
})
```

[↑ Volver al índice](#tabla-de-contenidos)

## Inicio rápido

```javascript
import { GeniovaAuth } from '@geniova/auth'

// 1. Inicializar (una sola vez al arrancar la app)
const auth = GeniovaAuth.init({
  appId: 'mi-app',
  firebaseConfig: { /* ... */ },
})

// 2. Escuchar cambios de autenticación
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('Usuario:', user.email)
    console.log('Roles:', user.roles)
  } else {
    console.log('No autenticado')
  }
})

// 3. Login con Microsoft (empleados @geniova.com)
await auth.loginWithMicrosoft()

// 4. O login con email/password (usuarios externos)
await auth.loginWithEmail('user@example.com', 'password123')

// 5. Verificar permisos
if (await auth.hasPermission('edit')) {
  // Mostrar botón de edición
}

// 6. Logout
await auth.logout()
```

[↑ Volver al índice](#tabla-de-contenidos)

## API Reference

### `GeniovaAuth.init(config)`

Inicializa el SDK. **Debe llamarse una sola vez** al inicio de la aplicación.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `config.appId` | `string` | ID de la aplicación registrada en Geniova Auth |
| `config.firebaseConfig` | `FirebaseOptions` | Configuración de Firebase |

**Retorna:** `GeniovaAuth` - Instancia del SDK

**Ejemplo:**
```javascript
const auth = GeniovaAuth.init({
  appId: 'intranet',
  firebaseConfig: { apiKey: '...', projectId: '...' },
})
```

---

### `GeniovaAuth.getInstance()`

Obtiene la instancia actual del SDK (después de `init()`).

**Retorna:** `GeniovaAuth`

**Lanza:** `Error` si no se ha llamado a `init()`

**Ejemplo:**
```javascript
// En cualquier parte de tu app
const auth = GeniovaAuth.getInstance()
const user = auth.getUser()
```

---

### `loginWithMicrosoft()`

Inicia sesión con cuenta Microsoft (Azure AD). Solo permite cuentas del dominio `@geniova.com`.

**Retorna:** `Promise<GeniovaUser>` - Usuario autenticado

**Lanza:**
- `Error('Solo se permiten cuentas del dominio @geniova.com')` - Si el dominio no es válido
- `Error('Login cancelado por el usuario')` - Si se cierra el popup

**Ejemplo:**
```javascript
try {
  const user = await auth.loginWithMicrosoft()
  console.log('Bienvenido', user.displayName)
} catch (error) {
  console.error('Error de login:', error.message)
}
```

---

### `loginWithEmail(email, password)`

Inicia sesión con email y contraseña.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `email` | `string` | Email del usuario |
| `password` | `string` | Contraseña |

**Retorna:** `Promise<GeniovaUser>` - Usuario autenticado

**Lanza:**
- `Error('Email y password son requeridos')` - Si faltan parámetros
- `Error('Credenciales incorrectas')` - Si email/password son inválidos
- `Error('Formato de email invalido')` - Si el email no es válido

**Ejemplo:**
```javascript
try {
  const user = await auth.loginWithEmail('user@example.com', 'pass123')
} catch (error) {
  if (error.message === 'Credenciales incorrectas') {
    showError('Email o contraseña incorrectos')
  }
}
```

---

### `logout()`

Cierra la sesión actual y limpia datos sensibles de memoria (incluyendo claves de encriptación).

**Retorna:** `Promise<void>`

**Ejemplo:**
```javascript
await auth.logout()
// El callback de onAuthStateChanged recibirá null
```

---

### `getUser()`

Obtiene el usuario actualmente autenticado.

**Retorna:** `GeniovaUser | null` - Usuario actual o `null` si no hay sesión

**Ejemplo:**
```javascript
const user = auth.getUser()
if (user) {
  console.log(`Hola ${user.displayName} (${user.email})`)
  console.log('Roles:', user.roles.join(', '))
}
```

---

### `getRoles(appId?)`

Obtiene los roles del usuario en una aplicación específica.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `appId` | `string` (opcional) | ID de la app. Si no se especifica, usa la app actual |

**Retorna:** `Promise<string[]>` - Array de nombres de roles

**Lanza:** `Error('No hay sesion activa')` - Si no hay usuario autenticado

**Ejemplo:**
```javascript
// Roles en la app actual
const roles = await auth.getRoles()

// Roles en otra app
const rolesIntranet = await auth.getRoles('intranet')
```

---

### `hasPermission(permission)`

Verifica si el usuario tiene un permiso específico según sus roles.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `permission` | `string` | Nombre del permiso a verificar |

**Retorna:** `Promise<boolean>` - `true` si tiene el permiso

**Nota:** Los usuarios con rol `admin` siempre retornan `true`.

**Ejemplo:**
```javascript
if (await auth.hasPermission('users.delete')) {
  showDeleteButton()
}

// Los permisos se configuran por app en Firestore:
// apps/{appId}/permissions: { admin: ['*'], editor: ['read', 'write'] }
```

---

### `onAuthStateChanged(callback)`

Suscribe a cambios en el estado de autenticación. Se ejecuta inmediatamente con el estado actual y luego cada vez que cambie.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `callback` | `(user: GeniovaUser \| null) => void` | Función a ejecutar |

**Retorna:** `() => void` - Función para cancelar la suscripción

**Ejemplo:**
```javascript
// Suscribirse
const unsubscribe = auth.onAuthStateChanged((user) => {
  if (user) {
    showDashboard(user)
  } else {
    showLogin()
  }
})

// Cancelar suscripción (ej: al desmontar componente)
unsubscribe()
```

---

### `getOrganizations()`

Obtiene las organizaciones a las que pertenece el usuario.

**Retorna:** `UserOrganization[]` - Array de organizaciones

**Ejemplo:**
```javascript
const orgs = auth.getOrganizations()
orgs.forEach(org => {
  console.log(`${org.name} - Roles: ${org.roles.join(', ')}`)
})
```

---

### `setCurrentOrganization(orgId)`

Cambia la organización activa del usuario, actualizando sus roles.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `orgId` | `string` | ID de la organización |

**Retorna:** `Promise<void>`

**Lanza:**
- `Error('No hay sesion activa')` - Si no hay usuario autenticado
- `Error('No perteneces a esta organizacion')` - Si el usuario no pertenece a la org

**Ejemplo:**
```javascript
await auth.setCurrentOrganization('org-ventas')
// Los roles del usuario ahora reflejan los de 'org-ventas'
console.log(auth.getUser().roles) // ['manager', 'viewer']
```

[↑ Volver al índice](#tabla-de-contenidos)

## Organizaciones

Un usuario puede pertenecer a múltiples organizaciones, cada una con roles diferentes.

```javascript
// Obtener organizaciones del usuario
const orgs = auth.getOrganizations()
// [{ id: 'org-ventas', name: 'Ventas', roles: ['manager'] },
//  { id: 'org-tech', name: 'Tecnología', roles: ['developer'] }]

// Cambiar organización activa
await auth.setCurrentOrganization('org-tech')

// Ahora user.roles = ['developer']
const user = auth.getUser()
console.log(user.currentOrganization) // 'org-tech'
console.log(user.roles) // ['developer']
```

La organización seleccionada se persiste en `localStorage` y se restaura automáticamente.

[↑ Volver al índice](#tabla-de-contenidos)

## Encriptación

El SDK incluye funciones de encriptación para datos sensibles usando AES-256-GCM.

### `encrypt(data, appId?)`

Encripta datos. Soporta strings y objetos (se serializan a JSON).

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `data` | `string \| object` | Datos a encriptar |
| `appId` | `string` (opcional) | App para derivar la clave |

**Retorna:** `Promise<string>` - Datos encriptados en base64

**Ejemplo:**
```javascript
// Encriptar string
const encrypted = await auth.encrypt('datos secretos')

// Encriptar objeto
const encrypted = await auth.encrypt({
  cardNumber: '4111111111111111',
  cvv: '123',
})

// Guardar en base de datos
await db.collection('payments').add({ encrypted })
```

---

### `decrypt(encryptedData, appId?)`

Desencripta datos previamente encriptados.

**Parámetros:**

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `encryptedData` | `string` | Datos encriptados en base64 |
| `appId` | `string` (opcional) | App usada para encriptar |

**Retorna:** `Promise<string | object>` - Datos originales (parsea JSON automáticamente)

**Ejemplo:**
```javascript
const decrypted = await auth.decrypt(encrypted)
console.log(decrypted) // { cardNumber: '4111...', cvv: '123' }
```

### Notas de seguridad

- **Aislamiento**: Cada usuario y app tiene una clave única derivada
- **Authenticated encryption**: AES-256-GCM incluye verificación de integridad
- **IV aleatorio**: Cada encriptación usa un IV diferente
- **Limpieza automática**: Las claves se eliminan de memoria en logout

[↑ Volver al índice](#tabla-de-contenidos)

## Ejemplos

### React

```jsx
import { useEffect, useState } from 'react'
import { GeniovaAuth } from '@geniova/auth'

// Inicializar fuera del componente
const auth = GeniovaAuth.init({ appId: 'mi-app', firebaseConfig: {...} })

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  if (loading) return <div>Cargando...</div>
  if (!user) return <LoginPage />
  return <Dashboard user={user} />
}
```

### Vue 3

```javascript
// composables/useAuth.js
import { ref, onMounted, onUnmounted } from 'vue'
import { GeniovaAuth } from '@geniova/auth'

const auth = GeniovaAuth.init({ appId: 'mi-app', firebaseConfig: {...} })

export function useAuth() {
  const user = ref(null)
  const loading = ref(true)
  let unsubscribe = null

  onMounted(() => {
    unsubscribe = auth.onAuthStateChanged((u) => {
      user.value = u
      loading.value = false
    })
  })

  onUnmounted(() => unsubscribe?.())

  return {
    user,
    loading,
    login: () => auth.loginWithMicrosoft(),
    logout: () => auth.logout(),
  }
}
```

### Vanilla JavaScript

```javascript
import { GeniovaAuth } from '@geniova/auth'

const auth = GeniovaAuth.init({ appId: 'mi-app', firebaseConfig: {...} })

// Elementos del DOM
const loginBtn = document.getElementById('login')
const logoutBtn = document.getElementById('logout')
const userInfo = document.getElementById('user-info')

auth.onAuthStateChanged((user) => {
  if (user) {
    loginBtn.style.display = 'none'
    logoutBtn.style.display = 'block'
    userInfo.textContent = `Hola, ${user.displayName}`
  } else {
    loginBtn.style.display = 'block'
    logoutBtn.style.display = 'none'
    userInfo.textContent = ''
  }
})

loginBtn.addEventListener('click', () => auth.loginWithMicrosoft())
logoutBtn.addEventListener('click', () => auth.logout())
```

### Proteger rutas (React Router)

```jsx
import { Navigate } from 'react-router-dom'
import { GeniovaAuth } from '@geniova/auth'

function ProtectedRoute({ children, requiredPermission }) {
  const auth = GeniovaAuth.getInstance()
  const user = auth.getUser()

  if (!user) {
    return <Navigate to="/login" />
  }

  // Verificar permiso si se requiere
  const [hasAccess, setHasAccess] = useState(null)

  useEffect(() => {
    if (requiredPermission) {
      auth.hasPermission(requiredPermission).then(setHasAccess)
    } else {
      setHasAccess(true)
    }
  }, [requiredPermission])

  if (hasAccess === null) return <Loading />
  if (!hasAccess) return <Navigate to="/unauthorized" />

  return children
}

// Uso
<Route path="/admin" element={
  <ProtectedRoute requiredPermission="admin.access">
    <AdminPanel />
  </ProtectedRoute>
} />
```

[↑ Volver al índice](#tabla-de-contenidos)

## Guía de migración

### Desde Firebase Auth directo

Si tu aplicación usa Firebase Auth directamente:

**Antes:**
```javascript
import { getAuth, signInWithPopup, OAuthProvider } from 'firebase/auth'

const auth = getAuth()
const provider = new OAuthProvider('microsoft.com')
await signInWithPopup(auth, provider)
```

**Después:**
```javascript
import { GeniovaAuth } from '@geniova/auth'

const auth = GeniovaAuth.init({ appId: 'mi-app', firebaseConfig })
await auth.loginWithMicrosoft()
```

### Cambios principales

| Antes | Después |
|-------|---------|
| `getAuth()` | `GeniovaAuth.init(config)` |
| `signInWithPopup(auth, provider)` | `auth.loginWithMicrosoft()` |
| `signInWithEmailAndPassword()` | `auth.loginWithEmail(email, pass)` |
| `signOut(auth)` | `auth.logout()` |
| `onAuthStateChanged(auth, cb)` | `auth.onAuthStateChanged(cb)` |
| `auth.currentUser` | `auth.getUser()` |
| Custom claims para roles | `user.roles` / `auth.getRoles()` |
| Manual permission check | `auth.hasPermission(perm)` |

### Beneficios de migrar

- Gestión centralizada de roles y permisos
- Soporte multi-organización
- Encriptación de datos integrada
- Validación automática de dominios
- Actualizaciones de roles en tiempo real

[↑ Volver al índice](#tabla-de-contenidos)

## Troubleshooting

### "GeniovaAuth: Debes llamar a init() primero"

**Causa:** Se llamó a `getInstance()` antes de `init()`.

**Solución:** Asegúrate de llamar a `init()` al inicio de tu aplicación:
```javascript
// main.js o index.js
GeniovaAuth.init({ appId: '...', firebaseConfig: {...} })
```

---

### "Solo se permiten cuentas del dominio @geniova.com"

**Causa:** Se intentó login con Microsoft usando una cuenta que no es del dominio corporativo.

**Solución:** Usa una cuenta `@geniova.com` o login con email/password.

---

### "No hay sesion activa"

**Causa:** Se llamó a un método que requiere autenticación sin usuario logueado.

**Solución:** Verifica que el usuario esté autenticado:
```javascript
const user = auth.getUser()
if (user) {
  // Ahora es seguro llamar a getRoles(), encrypt(), etc.
}
```

---

### "No tienes acceso a la aplicación X"

**Causa:** El usuario no tiene permisos en esa aplicación.

**Solución:** Un administrador debe asignar roles al usuario en el Portal de Auth.

---

### El popup de Microsoft no abre

**Causas posibles:**
1. Bloqueador de popups activo
2. CORS no configurado

**Soluciones:**
1. Desactiva el bloqueador de popups para tu dominio
2. Verifica que tu dominio está autorizado en Firebase Console

---

### Los roles no se actualizan

**Causa:** Los roles se obtienen del caché.

**Solución:** Los roles se actualizan automáticamente en tiempo real via Firestore. Si necesitas forzar actualización:
```javascript
// Los cambios se reflejan automáticamente via onAuthStateChanged
auth.onAuthStateChanged((user) => {
  // user.roles siempre tiene el valor actualizado
})
```

[↑ Volver al índice](#tabla-de-contenidos)

## Tipos TypeScript

El SDK incluye definiciones de tipos. Los principales tipos son:

```typescript
interface GeniovaAuthConfig {
  appId: string
  firebaseConfig: FirebaseOptions
}

interface GeniovaUser {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  provider: 'microsoft' | 'password'
  createdAt: Date
  lastLogin: Date
  roles: string[]
  organizations: UserOrganization[]
  currentOrganization: string | null
}

interface UserOrganization {
  id: string
  name: string
  roles: string[]
}
```

Ver `src/types.d.ts` para la lista completa de tipos.

[↑ Volver al índice](#tabla-de-contenidos)

## Soporte

- **Documentación:** [docs.geniova.com/auth](https://docs.geniova.com/auth)
- **Issues:** [GitHub Issues](https://github.com/geniova/auth/issues)
- **Slack:** #geniova-auth
- **Email:** auth@geniova.com

[↑ Volver al índice](#tabla-de-contenidos)
