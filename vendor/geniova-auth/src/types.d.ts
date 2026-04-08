import type { FirebaseOptions } from 'firebase/app'

/**
 * Configuracion para inicializar GeniovaAuth
 */
export interface GeniovaAuthConfig {
  /** ID de la aplicacion registrada en Geniova Auth */
  appId: string
  /** Configuracion de Firebase */
  firebaseConfig: FirebaseOptions
}

/**
 * Providers de autenticacion soportados
 */
export type AuthProvider = 'microsoft' | 'password' | 'google' | 'github'

/**
 * Usuario autenticado de Geniova
 */
export interface GeniovaUser {
  /** UID unico de Firebase Auth */
  uid: string
  /** Email del usuario */
  email: string
  /** Nombre para mostrar */
  displayName: string | null
  /** URL de la foto de perfil */
  photoURL: string | null
  /** Provider usado para autenticar */
  provider: AuthProvider
  /** Fecha de creacion de la cuenta */
  createdAt: Date
  /** Ultimo acceso */
  lastLogin: Date
  /** Roles del usuario en la app actual */
  roles: string[]
  /** Organizaciones a las que pertenece */
  organizations: UserOrganization[]
  /** Organizacion actual seleccionada */
  currentOrganization: string | null
}

/**
 * Organizacion a la que pertenece un usuario
 */
export interface UserOrganization {
  id: string
  name: string
  roles: string[]
}

/**
 * Configuracion de una aplicacion en Geniova Auth
 */
export interface AppConfig {
  id: string
  name: string
  availableRoles: string[]
  permissions: Record<string, string[]>
  settings: AppSettings
}

/**
 * Configuracion de la aplicacion
 */
export interface AppSettings {
  allowedProviders: AuthProvider[]
  /** Auto-enroll @geniova.com MS users with 'user' role on first login */
  autoEnroll: boolean
  allowSelfRegistration: boolean
  allowedDomains: string[]
  /** Login page theme colors */
  theme?: AppTheme
  /** @deprecated Usar allowedProviders en su lugar */
  requireMicrosoftAuth?: boolean
}

/**
 * Tema visual de la pagina de login de una app
 */
export interface AppTheme {
  /** Button and link color (hex) */
  primaryColor: string
  /** Background gradient start color (hex) */
  backgroundColor: string
  /** Background gradient end color (hex) */
  gradientEnd: string
}

/**
 * Callback para cambios de autenticacion
 */
export type AuthStateCallback = (user: GeniovaUser | null) => void

/**
 * Funcion para cancelar una suscripcion
 */
export type Unsubscribe = () => void

// --- Tipos de Email ---

/**
 * Opciones para enviar un email
 */
export interface SendEmailOptions {
  /** Destinatario(s) del email */
  to: string | string[]
  /** Destinatarios en copia (opcional) */
  cc?: string | string[]
  /** Destinatarios en copia oculta (opcional) */
  bcc?: string | string[]
  /** Asunto del email (requerido si no se usa template) */
  subject?: string
  /** Contenido HTML del email (requerido si no se usa template) */
  html?: string
  /** ID del template a usar (opcional) */
  template?: string
  /** Datos para reemplazar en el template */
  data?: Record<string, string>
}

/**
 * Resultado de enviar un email
 */
export interface SendEmailResult {
  /** Indica si el envio fue exitoso */
  success: boolean
  /** ID del log en Firestore */
  logId: string
}

/**
 * Template de email
 */
export interface EmailTemplate {
  /** ID del template */
  id: string
  /** Nombre descriptivo */
  name: string
  /** Asunto del email (con placeholders) */
  subject: string
  /** Variables que acepta el template */
  variables: string[]
  /** Descripcion del template */
  description?: string | null
}

/**
 * Resultado de obtener templates
 */
export interface GetEmailTemplatesResult {
  /** Lista de templates disponibles */
  templates: EmailTemplate[]
}
