/**
 * White-label configuration schema for captain-auth instances.
 *
 * Defines, validates, and provides defaults for captain-auth.config.json.
 * Each deployment can customize branding, identity provider, access policies,
 * and feature flags without modifying source code.
 *
 * @module configSchema
 */

/**
 * @typedef {Object} BrandConfig
 * @property {string} name - Organization/product name
 * @property {string} [logo] - URL to logo image
 * @property {string} [favicon] - URL to favicon
 * @property {string} [primaryColor] - Primary brand color (hex)
 * @property {string} [accentColor] - Accent color (hex)
 * @property {string} [portalTitle] - Title for the auth portal
 */

/**
 * @typedef {Object} IdentityProviderConfig
 * @property {'descope'|'firebase'|'auth0'} provider - Identity provider type
 * @property {string} projectId - Provider project/tenant ID
 * @property {string} [baseUrl] - Override for provider API base URL
 */

/**
 * @typedef {Object} AccessPolicyConfig
 * @property {'auto'|'manual'|'invite'} defaultMode - Default access mode for new apps
 * @property {string[]} [defaultRoles] - Default roles for auto-enrolled users
 * @property {boolean} [requireEmailVerification] - Require email verification
 */

/**
 * @typedef {Object} FeaturesConfig
 * @property {boolean} [emailNotifications] - Enable email notifications
 * @property {boolean} [auditLog] - Enable audit logging
 * @property {boolean} [sessionEncryption] - Enable session encryption
 * @property {boolean} [multiOrg] - Enable multi-organization support
 */

/**
 * @typedef {Object} CaptainAuthConfig
 * @property {BrandConfig} brand - Branding configuration
 * @property {IdentityProviderConfig} identityProvider - Identity provider settings
 * @property {AccessPolicyConfig} [accessPolicy] - Access policy defaults
 * @property {FeaturesConfig} [features] - Feature flags
 * @property {string} [firebaseProjectId] - Firebase project ID for backend
 */

/** Default configuration values */
const DEFAULTS = {
  brand: {
    primaryColor: '#667eea',
    accentColor: '#764ba2',
    portalTitle: 'Authentication Portal',
  },
  accessPolicy: {
    defaultMode: 'manual',
    defaultRoles: ['user'],
    requireEmailVerification: false,
  },
  features: {
    emailNotifications: true,
    auditLog: true,
    sessionEncryption: false,
    multiOrg: false,
  },
}

/**
 * Validates a captain-auth configuration object.
 * Returns an array of validation errors (empty if valid).
 *
 * @param {Record<string, unknown>} config - Configuration to validate
 * @returns {string[]} Array of validation error messages
 */
export function validateConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return ['Config must be a non-null object']
  }

  // brand (required)
  if (!config.brand || typeof config.brand !== 'object') {
    errors.push('brand: required object with at least "name" field')
  } else {
    if (!config.brand.name || typeof config.brand.name !== 'string') {
      errors.push('brand.name: required string (organization/product name)')
    }
    if (config.brand.primaryColor && !/^#[0-9a-fA-F]{3,8}$/.test(config.brand.primaryColor)) {
      errors.push('brand.primaryColor: must be a valid hex color (e.g., "#667eea")')
    }
    if (config.brand.accentColor && !/^#[0-9a-fA-F]{3,8}$/.test(config.brand.accentColor)) {
      errors.push('brand.accentColor: must be a valid hex color (e.g., "#764ba2")')
    }
  }

  // identityProvider (required)
  if (!config.identityProvider || typeof config.identityProvider !== 'object') {
    errors.push('identityProvider: required object with "provider" and "projectId" fields')
  } else {
    const validProviders = ['descope', 'firebase', 'auth0']
    if (!validProviders.includes(config.identityProvider.provider)) {
      errors.push(`identityProvider.provider: must be one of ${validProviders.join(', ')}`)
    }
    if (!config.identityProvider.projectId || typeof config.identityProvider.projectId !== 'string') {
      errors.push('identityProvider.projectId: required string')
    }
  }

  // accessPolicy (optional, validate if present)
  if (config.accessPolicy) {
    const validModes = ['auto', 'manual', 'invite']
    if (config.accessPolicy.defaultMode && !validModes.includes(config.accessPolicy.defaultMode)) {
      errors.push(`accessPolicy.defaultMode: must be one of ${validModes.join(', ')}`)
    }
    if (config.accessPolicy.defaultRoles && !Array.isArray(config.accessPolicy.defaultRoles)) {
      errors.push('accessPolicy.defaultRoles: must be an array of strings')
    }
  }

  return errors
}

/**
 * Loads and validates a configuration, applying defaults for missing optional fields.
 *
 * @param {Record<string, unknown>} rawConfig - Raw configuration object
 * @returns {CaptainAuthConfig} Validated configuration with defaults applied
 * @throws {Error} If required fields are missing or invalid
 */
export function loadConfig(rawConfig) {
  const errors = validateConfig(rawConfig)
  if (errors.length > 0) {
    throw new Error(`Invalid captain-auth config:\n  - ${errors.join('\n  - ')}`)
  }

  return {
    brand: {
      ...DEFAULTS.brand,
      ...rawConfig.brand,
    },
    identityProvider: { ...rawConfig.identityProvider },
    accessPolicy: {
      ...DEFAULTS.accessPolicy,
      ...(rawConfig.accessPolicy ?? {}),
    },
    features: {
      ...DEFAULTS.features,
      ...(rawConfig.features ?? {}),
    },
    firebaseProjectId: rawConfig.firebaseProjectId ?? null,
  }
}
