/**
 * @typedef {import('../adapters/types.d.ts').CanonicalUser} CanonicalUser
 * @typedef {import('../types.d.ts').GeniovaUser} GeniovaUser
 */

/**
 * Maps a CanonicalUser (adapter output) to a GeniovaUser (SDK public type).
 * This is the single point of conversion between provider-agnostic identity
 * and the user model consumed by applications.
 *
 * @param {CanonicalUser} canonical - Provider-agnostic user from adapter
 * @param {object} context - Additional data from Firestore
 * @param {string[]} context.roles - Roles in the current app
 * @param {import('../types.d.ts').UserOrganization[]} context.organizations - User organizations
 * @param {string | null} context.currentOrganization - Current org ID
 * @param {Date} [context.createdAt] - Account creation date
 * @param {Date} [context.lastLogin] - Last login date
 * @returns {GeniovaUser}
 */
export function mapCanonicalToGeniovaUser(canonical, context) {
  if (!canonical.userId) {
    throw new Error('CanonicalUser.userId is required')
  }
  if (!canonical.email) {
    throw new Error('CanonicalUser.email is required')
  }

  return {
    uid: canonical.userId,
    email: canonical.email,
    displayName: canonical.displayName,
    photoURL: canonical.avatarUrl,
    provider: /** @type {import('../types.d.ts').AuthProvider} */ (canonical.provider),
    createdAt: context.createdAt ?? new Date(),
    lastLogin: context.lastLogin ?? new Date(),
    roles: context.roles,
    organizations: context.organizations,
    currentOrganization: context.currentOrganization,
  }
}

/**
 * Maps a Firebase Auth user + Firestore data to a CanonicalUser.
 * Used by the firebaseAdapter during the transition period.
 *
 * @param {object} firebaseUser - Firebase Auth user object
 * @param {string} firebaseUser.uid - Firebase UID
 * @param {string | null} firebaseUser.email - Email
 * @param {string | null} firebaseUser.displayName - Display name
 * @param {string | null} firebaseUser.photoURL - Photo URL
 * @param {object} [firestoreData] - User document data from Firestore
 * @param {string} [firestoreData.provider] - Auth provider
 * @param {boolean} [firestoreData.emailVerified] - Email verified
 * @returns {CanonicalUser}
 */
export function mapFirebaseToCanonical(firebaseUser, firestoreData = {}) {
  if (!firebaseUser.uid) {
    throw new Error('Firebase user UID is required')
  }

  return {
    userId: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    emailVerified: firestoreData.emailVerified ?? !!firebaseUser.email,
    displayName: firebaseUser.displayName,
    avatarUrl: firebaseUser.photoURL,
    provider: firestoreData.provider ?? 'password',
    externalId: firebaseUser.uid,
    raw: { source: 'firebase', firestoreData },
  }
}

/**
 * Validates a CanonicalUser has all required fields.
 * Logs warnings for missing optional fields.
 *
 * @param {Record<string, unknown>} data - Raw data to validate
 * @returns {{ valid: boolean, user: CanonicalUser | null, warnings: string[] }}
 */
export function validateCanonicalUser(data) {
  /** @type {string[]} */
  const warnings = []

  if (!data.userId || typeof data.userId !== 'string') {
    return { valid: false, user: null, warnings: ['userId is required'] }
  }
  if (!data.email || typeof data.email !== 'string') {
    return { valid: false, user: null, warnings: ['email is required'] }
  }
  if (!data.externalId || typeof data.externalId !== 'string') {
    return { valid: false, user: null, warnings: ['externalId is required'] }
  }
  if (!data.provider || typeof data.provider !== 'string') {
    return { valid: false, user: null, warnings: ['provider is required'] }
  }

  if (data.displayName === undefined) {
    warnings.push('displayName is missing, defaulting to null')
  }
  if (data.avatarUrl === undefined) {
    warnings.push('avatarUrl is missing, defaulting to null')
  }
  if (data.emailVerified === undefined) {
    warnings.push('emailVerified is missing, defaulting to false')
  }

  return {
    valid: true,
    user: {
      userId: /** @type {string} */ (data.userId),
      email: /** @type {string} */ (data.email),
      emailVerified: typeof data.emailVerified === 'boolean' ? data.emailVerified : false,
      displayName: typeof data.displayName === 'string' ? data.displayName : null,
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
      provider: /** @type {string} */ (data.provider),
      externalId: /** @type {string} */ (data.externalId),
      raw: typeof data.raw === 'object' ? /** @type {Record<string, unknown>} */ (data.raw) : undefined,
    },
    warnings,
  }
}
