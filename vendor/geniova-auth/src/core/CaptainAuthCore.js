import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  OAuthProvider,
  GoogleAuthProvider,
  GithubAuthProvider,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

/**
 * @typedef {import('../types.d.ts').GeniovaAuthConfig} GeniovaAuthConfig
 * @typedef {import('../types.d.ts').GeniovaUser} GeniovaUser
 * @typedef {import('../types.d.ts').UserOrganization} UserOrganization
 * @typedef {import('../types.d.ts').AuthStateCallback} AuthStateCallback
 * @typedef {import('../types.d.ts').Unsubscribe} Unsubscribe
 * @typedef {import('../types.d.ts').AppConfig} AppConfig
 * @typedef {import('../types.d.ts').SendEmailOptions} SendEmailOptions
 * @typedef {import('../types.d.ts').SendEmailResult} SendEmailResult
 * @typedef {import('../types.d.ts').EmailTemplate} EmailTemplate
 * @typedef {import('../types.d.ts').GetEmailTemplatesResult} GetEmailTemplatesResult
 */

/**
 * Core authentication SDK - brand-neutral base class.
 * This class contains all authentication logic independent of any brand.
 * Brand-specific wrappers (e.g. GeniovaAuth) should extend this class.
 */
export class CaptainAuthCore {
  /** @type {CaptainAuthCore | null} */
  static #instance = null

  /** @type {import('firebase/app').FirebaseApp} */
  #app
  /** @type {import('firebase/auth').Auth} */
  #auth
  /** @type {import('firebase/firestore').Firestore} */
  #db
  /** @type {import('firebase/functions').Functions} */
  #functions
  /** @type {string} */
  #appId
  /** @type {AppConfig | null} */
  #appConfig = null
  /** @type {GeniovaUser | null} */
  #currentUser = null
  /** @type {import('firebase/firestore').Unsubscribe | null} */
  #userUnsubscribe = null
  /** @type {Set<AuthStateCallback>} */
  #authStateListeners = new Set()
  /** @type {Map<string, CryptoKey>} Cache de claves de encriptación por appId */
  #encryptionKeys = new Map()

  /**
   * @param {GeniovaAuthConfig} config
   */
  constructor(config) {
    this.#appId = config.appId

    // Inicializar Firebase (reusar si ya existe)
    const existingApp = getApps().find((app) => app.name === '[DEFAULT]')
    this.#app = existingApp ?? initializeApp(config.firebaseConfig)

    this.#auth = getAuth(this.#app)
    this.#db = getFirestore(this.#app)
    this.#functions = getFunctions(this.#app, 'europe-west1')

    // Escuchar cambios de autenticacion de Firebase
    onAuthStateChanged(this.#auth, (user) => this.#handleAuthStateChange(user))
  }

  /**
   * Inicializa el SDK de GeniovaAuth
   * @param {GeniovaAuthConfig} config - Configuracion de la aplicacion
   * @returns {GeniovaAuth} Instancia de GeniovaAuth
   */
  static init(config) {
    if (!config.appId) {
      throw new Error('CaptainAuth: appId is required')
    }
    if (!config.firebaseConfig) {
      throw new Error('CaptainAuth: firebaseConfig is required')
    }

    if (!CaptainAuthCore.#instance) {
      CaptainAuthCore.#instance = new this(config)
    }

    return CaptainAuthCore.#instance
  }

  /**
   * Obtiene la instancia actual de GeniovaAuth
   * @returns {GeniovaAuth}
   * @throws Error si no se ha inicializado
   */
  static getInstance() {
    if (!CaptainAuthCore.#instance) {
      throw new Error('CaptainAuth: call init() first')
    }
    return CaptainAuthCore.#instance
  }

  /**
   * Reset instance (testing only)
   * @internal
   */
  static _resetInstance() {
    CaptainAuthCore.#instance = null
  }

  /**
   * Inicia sesion con Microsoft (Azure AD)
   * @returns {Promise<GeniovaUser>} Usuario autenticado
   */
  async loginWithMicrosoft() {
    const provider = new OAuthProvider('microsoft.com')
    provider.setCustomParameters({
      tenant: 'common',
      prompt: 'select_account',
    })

    try {
      const result = await signInWithPopup(this.#auth, provider)

      // Validar dominio @geniova.com
      const email = result.user.email
      if (!email?.endsWith('@geniova.com')) {
        await this.logout()
        throw new Error('Solo se permiten cuentas del dominio @geniova.com')
      }

      return this.#currentUser
    } catch (error) {
      if (error?.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelado por el usuario')
      }

      // Detectar redirect de UID determinista
      if (error?.message?.includes('GENIOVA_UID_REDIRECT')) {
        const credential = OAuthProvider.credentialFromError(error)
        if (credential) {
          await signInWithCredential(this.#auth, credential)
          await this.#waitForUser()
          return this.#currentUser
        }
      }

      throw error
    }
  }

  /**
   * Espera a que onSnapshot popule #currentUser (max 5s)
   * @returns {Promise<void>}
   */
  async #waitForUser() {
    if (this.#currentUser) return

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub()
        reject(new Error('Timeout esperando datos del usuario'))
      }, 5000)

      const unsub = this.onAuthStateChanged((user) => {
        if (user) {
          clearTimeout(timeout)
          unsub()
          resolve()
        }
      })
    })
  }

  /**
   * Inicia sesion con email y password
   * @param {string} email - Email del usuario
   * @param {string} password - Contrasena
   * @returns {Promise<GeniovaUser>} Usuario autenticado
   */
  async loginWithEmail(email, password) {
    if (!email || !password) {
      throw new Error('Email y password son requeridos')
    }

    try {
      await signInWithEmailAndPassword(this.#auth, email, password)
      return this.#currentUser
    } catch (error) {
      const code = error?.code
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        throw new Error('Credenciales incorrectas')
      }
      if (code === 'auth/invalid-email') {
        throw new Error('Formato de email invalido')
      }
      throw error
    }
  }

  /**
   * Inicia sesion con Google
   * @returns {Promise<GeniovaUser>} Usuario autenticado
   */
  async loginWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope('email')
    provider.addScope('profile')

    try {
      await signInWithPopup(this.#auth, provider)

      // Detectar redirect de UID determinista
      if (!this.#currentUser) {
        await this.#waitForUser()
      }

      return this.#currentUser
    } catch (error) {
      if (error?.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelado por el usuario')
      }

      // Detectar redirect de UID determinista
      if (error?.message?.includes('GENIOVA_UID_REDIRECT')) {
        const credential = GoogleAuthProvider.credentialFromError(error)
        if (credential) {
          await signInWithCredential(this.#auth, credential)
          await this.#waitForUser()
          return this.#currentUser
        }
      }

      throw error
    }
  }

  /**
   * Inicia sesion con GitHub
   * @returns {Promise<GeniovaUser>} Usuario autenticado
   */
  async loginWithGitHub() {
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')

    try {
      await signInWithPopup(this.#auth, provider)

      // Detectar redirect de UID determinista
      if (!this.#currentUser) {
        await this.#waitForUser()
      }

      return this.#currentUser
    } catch (error) {
      if (error?.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelado por el usuario')
      }

      // Detectar redirect de UID determinista
      if (error?.message?.includes('GENIOVA_UID_REDIRECT')) {
        const credential = GithubAuthProvider.credentialFromError(error)
        if (credential) {
          await signInWithCredential(this.#auth, credential)
          await this.#waitForUser()
          return this.#currentUser
        }
      }

      throw error
    }
  }

  /**
   * Cierra la sesion actual
   * @returns {Promise<void>}
   */
  async logout() {
    // Limpiar claves de encriptación y sesión de memoria
    this.#encryptionKeys.clear()
    this.#sessionToken = null
    this.#sessionExpiresAt = null
    await signOut(this.#auth)
  }

  /**
   * Obtiene el usuario actual
   * @returns {GeniovaUser | null} Usuario actual o null si no hay sesion
   */
  getUser() {
    return this.#currentUser
  }

  /**
   * Obtiene los roles del usuario en la app actual o en otra app
   * @param {string} [appId] - ID de la app (opcional, usa la actual por defecto)
   * @returns {Promise<string[]>} Array de roles
   */
  async getRoles(appId) {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    if (appId && appId !== this.#appId) {
      const userDoc = await getDoc(doc(this.#db, 'users', this.#currentUser.uid))
      const userData = userDoc.data()
      return userData?.apps?.[appId]?.roles ?? []
    }

    return this.#currentUser.roles
  }

  /**
   * Verifica si el usuario tiene un permiso especifico
   * @param {string} permission - Nombre del permiso a verificar
   * @returns {Promise<boolean>} true si tiene el permiso
   */
  async hasPermission(permission) {
    if (!this.#currentUser) {
      return false
    }

    // Cargar config de la app si no existe
    if (!this.#appConfig) {
      await this.#loadAppConfig()
    }

    if (!this.#appConfig) {
      return false
    }

    // Verificar si alguno de los roles del usuario tiene el permiso
    for (const role of this.#currentUser.roles) {
      const rolePermissions = this.#appConfig.permissions[role] ?? []

      // Admin tiene todos los permisos
      if (role === 'admin') {
        return true
      }

      if (rolePermissions.includes(permission)) {
        return true
      }
    }

    return false
  }

  /**
   * Suscribirse a cambios de autenticacion
   * @param {AuthStateCallback} callback - Funcion a ejecutar cuando cambie el estado
   * @returns {Unsubscribe} Funcion para cancelar la suscripcion
   */
  onAuthStateChanged(callback) {
    this.#authStateListeners.add(callback)

    // Notificar estado actual inmediatamente
    callback(this.#currentUser)

    return () => {
      this.#authStateListeners.delete(callback)
    }
  }

  /**
   * Obtiene las organizaciones del usuario
   * @returns {UserOrganization[]}
   */
  getOrganizations() {
    return this.#currentUser?.organizations ?? []
  }

  // --- Metodos de Email ---

  /**
   * Envia un email usando el servicio centralizado de Geniova
   * @param {SendEmailOptions} options - Opciones del email
   * @returns {Promise<SendEmailResult>} Resultado del envio
   */
  async sendEmail(options) {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    if (!options.to) {
      throw new Error('El destinatario (to) es requerido')
    }

    if (!options.template && !options.subject) {
      throw new Error('Se requiere un asunto (subject) o un template')
    }

    if (!options.template && !options.html) {
      throw new Error('Se requiere contenido (html) o un template')
    }

    const sendEmailFn = httpsCallable(this.#functions, 'sendEmail')
    const result = await sendEmailFn(options)

    return /** @type {SendEmailResult} */ (result.data)
  }

  /**
   * Obtiene los templates de email disponibles
   * @returns {Promise<EmailTemplate[]>} Lista de templates
   */
  async getEmailTemplates() {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    const getTemplatesFn = httpsCallable(this.#functions, 'getEmailTemplates')
    const result = await getTemplatesFn()

    /** @type {GetEmailTemplatesResult} */
    const data = /** @type {any} */ (result.data)

    return data.templates
  }

  /**
   * Cambia la organizacion actual
   * @param {string} orgId - ID de la organizacion
   * @returns {Promise<void>}
   */
  async setCurrentOrganization(orgId) {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    const org = this.#currentUser.organizations.find((o) => o.id === orgId)
    if (!org) {
      throw new Error('No perteneces a esta organizacion')
    }

    this.#currentUser = {
      ...this.#currentUser,
      currentOrganization: orgId,
      roles: org.roles,
    }

    // Notificar cambio
    this.#notifyAuthStateChange()

    // Persistir seleccion
    localStorage.setItem(`geniova-auth-org-${this.#appId}`, orgId)
  }

  /**
   * Encripta datos usando AES-256-GCM
   * @param {string | object} data - Datos a encriptar (string u objeto serializable)
   * @param {string} [appId] - ID de la app para derivar la clave (opcional, usa la actual)
   * @returns {Promise<string>} Datos encriptados en formato base64 (iv:ciphertext:tag)
   */
  async encrypt(data, appId) {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    const targetAppId = appId ?? this.#appId
    const key = await this.#getEncryptionKey(targetAppId)

    // Serializar datos si es objeto
    const plaintext =
      typeof data === 'string' ? data : JSON.stringify(data)
    const encoder = new TextEncoder()
    const plaintextBytes = encoder.encode(plaintext)

    // Generar IV aleatorio (12 bytes recomendado para GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encriptar con AES-256-GCM
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintextBytes
    )

    // El resultado incluye el tag de autenticación al final (16 bytes)
    const ciphertext = new Uint8Array(ciphertextBuffer)

    // Combinar: iv + ciphertext (incluye tag)
    const combined = new Uint8Array(iv.length + ciphertext.length)
    combined.set(iv, 0)
    combined.set(ciphertext, iv.length)

    // Codificar en base64
    return btoa(String.fromCharCode(...combined))
  }

  /**
   * Desencripta datos usando AES-256-GCM
   * @param {string} encryptedData - Datos encriptados en base64
   * @param {string} [appId] - ID de la app para derivar la clave (opcional, usa la actual)
   * @returns {Promise<string | object>} Datos desencriptados (intenta parsear como JSON)
   */
  async decrypt(encryptedData, appId) {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    const targetAppId = appId ?? this.#appId
    const key = await this.#getEncryptionKey(targetAppId)

    // Decodificar base64
    const combined = Uint8Array.from(atob(encryptedData), (c) =>
      c.charCodeAt(0)
    )

    // Extraer IV (primeros 12 bytes) y ciphertext+tag (resto)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    // Desencriptar
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )

    const decoder = new TextDecoder()
    const plaintext = decoder.decode(plaintextBuffer)

    // Intentar parsear como JSON
    try {
      return JSON.parse(plaintext)
    } catch {
      return plaintext
    }
  }

  // --- Metodos de Session JWT ---

  /** @type {string | null} */
  #sessionToken = null
  /** @type {number | null} */
  #sessionExpiresAt = null

  /**
   * Obtiene un JWT de sesión firmado con RS256 para verificación server-side.
   * Llama a la Cloud Function createSession intercambiando el Firebase ID Token.
   * Cachea el token en memoria y lo renueva automáticamente si está próximo a expirar.
   *
   * @returns {Promise<string>} JWT de sesión
   */
  async getSessionToken() {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    // Si hay token cacheado y le quedan más de 5 minutos, reutilizar
    if (this.#sessionToken && this.#sessionExpiresAt) {
      const fiveMinutes = 5 * 60
      const now = Math.floor(Date.now() / 1000)
      if (this.#sessionExpiresAt - now > fiveMinutes) {
        return this.#sessionToken
      }
    }

    const createSessionFn = httpsCallable(this.#functions, 'createSession')
    const result = await createSessionFn({ appId: this.#appId })

    /** @type {{ token: string, expiresAt: number }} */
    const data = /** @type {any} */ (result.data)

    this.#sessionToken = data.token
    this.#sessionExpiresAt = data.expiresAt

    return data.token
  }

  /**
   * Renueva el JWT de sesión obteniendo datos frescos de Firestore.
   * @returns {Promise<string>} Nuevo JWT de sesión
   */
  async refreshSessionToken() {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    if (!this.#sessionToken) {
      return this.getSessionToken()
    }

    const refreshSessionFn = httpsCallable(this.#functions, 'refreshSession')
    const result = await refreshSessionFn({ token: this.#sessionToken })

    /** @type {{ token: string, expiresAt: number }} */
    const data = /** @type {any} */ (result.data)

    this.#sessionToken = data.token
    this.#sessionExpiresAt = data.expiresAt

    return data.token
  }

  /**
   * Revoca el JWT de sesión actual.
   * @returns {Promise<void>}
   */
  async revokeSession() {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    if (this.#sessionToken) {
      const revokeSessionFn = httpsCallable(this.#functions, 'revokeSession')
      // Decodificar JTI del token sin verificar (solo para extraer el jti)
      try {
        const payload = JSON.parse(atob(this.#sessionToken.split('.')[1]))
        await revokeSessionFn({ jti: payload.jti })
      } catch {
        // Si falla el decode, revocar por uid
        await revokeSessionFn({ targetUid: this.#currentUser.uid })
      }
    }

    this.#sessionToken = null
    this.#sessionExpiresAt = null
  }

  /**
   * Revoca todas las sesiones del usuario en todos los dispositivos.
   * Tras esta llamada, cualquier JWT emitido antes de este momento
   * sera rechazado al intentar renovarse.
   *
   * @returns {Promise<void>}
   */
  async revokeAllSessions() {
    if (!this.#currentUser) {
      throw new Error('No hay sesion activa')
    }

    const revokeSessionFn = httpsCallable(this.#functions, 'revokeSession')
    await revokeSessionFn({ targetUid: this.#currentUser.uid })

    this.#sessionToken = null
    this.#sessionExpiresAt = null
  }

  // --- Metodos privados ---

  /**
   * Obtiene la clave de encriptación para una app (con caché)
   * @param {string} appId
   * @returns {Promise<CryptoKey>}
   */
  async #getEncryptionKey(appId) {
    // Verificar caché
    if (this.#encryptionKeys.has(appId)) {
      return this.#encryptionKeys.get(appId)
    }

    // Llamar a Cloud Function para obtener la clave
    const getKeyFn = httpsCallable(this.#functions, 'getEncryptionKey')
    const result = await getKeyFn({ appId })

    /** @type {{ key: string }} */
    const data = /** @type {any} */ (result.data)

    // Importar clave en Web Crypto API
    const keyBytes = Uint8Array.from(atob(data.key), (c) => c.charCodeAt(0))
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM', length: 256 },
      false, // no exportable
      ['encrypt', 'decrypt']
    )

    // Cachear
    this.#encryptionKeys.set(appId, cryptoKey)

    return cryptoKey
  }

  /**
   * @param {import('firebase/auth').User | null} firebaseUser
   */
  async #handleAuthStateChange(firebaseUser) {
    // Limpiar suscripcion anterior
    if (this.#userUnsubscribe) {
      this.#userUnsubscribe()
      this.#userUnsubscribe = null
    }

    if (!firebaseUser) {
      this.#currentUser = null
      this.#notifyAuthStateChange()
      return
    }

    // Suscribirse a cambios del documento del usuario en Firestore
    const userRef = doc(this.#db, 'users', firebaseUser.uid)
    this.#userUnsubscribe = onSnapshot(userRef, (snapshot) => {
      const userData = snapshot.data()

      if (!userData) {
        this.#currentUser = null
        this.#notifyAuthStateChange()
        return
      }

      const appData = userData.apps?.[this.#appId]
      const organizations = this.#extractOrganizations(userData)
      const storedOrgId = this.#getStoredOrganization()

      // Determinar roles: de la org actual o globales de la app
      /** @type {string[]} */
      let roles = appData?.roles ?? []
      /** @type {string | null} */
      let currentOrganization = null

      if (storedOrgId && organizations.length > 0) {
        const org = organizations.find((o) => o.id === storedOrgId)
        if (org) {
          roles = org.roles
          currentOrganization = storedOrgId
        } else if (organizations.length > 0) {
          // La org guardada ya no existe, usar la primera disponible
          roles = organizations[0].roles
          currentOrganization = organizations[0].id
          localStorage.setItem(
            `geniova-auth-org-${this.#appId}`,
            currentOrganization
          )
        }
      } else if (organizations.length > 0) {
        // No hay org guardada pero hay disponibles, usar la primera
        roles = organizations[0].roles
        currentOrganization = organizations[0].id
        localStorage.setItem(
          `geniova-auth-org-${this.#appId}`,
          currentOrganization
        )
      }

      // Detectar revocacion remota de sesiones
      if (this.#sessionToken && userData.sessionsRevokedAt) {
        const revokedAt = userData.sessionsRevokedAt.toDate
          ? userData.sessionsRevokedAt.toDate().getTime() / 1000
          : userData.sessionsRevokedAt / 1000
        try {
          const payload = JSON.parse(atob(this.#sessionToken.split('.')[1]))
          if (payload.iat <= revokedAt) {
            this.#sessionToken = null
            this.#sessionExpiresAt = null
            // Forzar logout - sesiones revocadas remotamente
            signOut(this.#auth)
            return
          }
        } catch {
          // Si falla el decode, invalidar por seguridad
          this.#sessionToken = null
          this.#sessionExpiresAt = null
        }
      }

      this.#currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        provider: userData.provider ?? 'password',
        createdAt: userData.createdAt?.toDate() ?? new Date(),
        lastLogin: userData.updatedAt?.toDate() ?? new Date(),
        roles,
        organizations,
        currentOrganization,
      }

      this.#notifyAuthStateChange()
    })
  }

  /**
   * @param {Record<string, unknown>} userData
   * @returns {UserOrganization[]}
   */
  #extractOrganizations(userData) {
    const orgs = /** @type {Record<string, {name: string, apps?: Record<string, {roles?: string[]}>}>} */ (
      userData.organizations
    )

    if (!orgs || typeof orgs !== 'object') {
      return []
    }

    return Object.entries(orgs).map(([id, org]) => ({
      id,
      name: org.name ?? id,
      roles: org.apps?.[this.#appId]?.roles ?? [],
    }))
  }

  /**
   * @returns {string | null}
   */
  #getStoredOrganization() {
    return localStorage.getItem(`geniova-auth-org-${this.#appId}`)
  }

  #notifyAuthStateChange() {
    for (const listener of this.#authStateListeners) {
      listener(this.#currentUser)
    }
  }

  async #loadAppConfig() {
    const appRef = doc(this.#db, 'apps', this.#appId)
    const appDoc = await getDoc(appRef)

    if (appDoc.exists()) {
      this.#appConfig = /** @type {AppConfig} */ (appDoc.data())
    }
  }
}
