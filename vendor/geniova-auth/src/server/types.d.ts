export interface ServerConfig {
  /** Application ID (used as JWT audience) */
  appId: string
  /** URL to fetch JWKS (default: https://auth.geniova.com/.well-known/jwks.json) */
  jwksUrl?: string
  /** PEM-encoded public key (alternative to jwksUrl) */
  publicKey?: string
  /** Expected JWT issuer (default: 'geniova-auth') */
  issuer?: string
}

export interface SessionUser {
  /** User ID */
  uid: string
  /** User email */
  email: string
  /** Display name */
  displayName: string | null
  /** Photo URL */
  photoURL: string | null
  /** Auth provider */
  provider: string | null
  /** User roles for this app */
  roles: string[]
  /** Application ID */
  appId: string
  /** Token ID */
  jti: string
  /** Issued at timestamp */
  iat: number
  /** Expiration timestamp */
  exp: number
}

export declare class GeniovaAuthServer {
  constructor(config: ServerConfig)
  static init(config: ServerConfig): GeniovaAuthServer
  verifyToken(token: string): Promise<SessionUser | null>
  clearCache(): void
  readonly appId: string
}

export interface AstroMiddlewareOptions {
  publicPaths?: string[]
}

export interface NextMiddlewareOptions {
  publicPaths?: string[]
  loginPath?: string
}

export interface ExpressMiddlewareOptions {
  publicPaths?: string[]
  required?: boolean
}

export declare function createAstroMiddleware(
  auth: GeniovaAuthServer,
  options?: AstroMiddlewareOptions
): (context: any, next: () => Promise<Response>) => Promise<Response>

export declare function createNextMiddleware(
  auth: GeniovaAuthServer,
  options?: NextMiddlewareOptions
): (request: any) => Promise<any>

export declare function createExpressMiddleware(
  auth: GeniovaAuthServer,
  options?: ExpressMiddlewareOptions
): (req: any, res: any, next: () => void) => Promise<void>
