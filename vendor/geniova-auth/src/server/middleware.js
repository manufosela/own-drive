/**
 * Middleware factories for popular frameworks.
 * Each factory creates framework-specific middleware from a GeniovaAuthServer instance.
 *
 * @module server/middleware
 */

/**
 * Extracts Bearer token from Authorization header.
 * @param {string|null|undefined} header
 * @returns {string|null}
 */
function extractBearerToken(header) {
  if (!header || typeof header !== 'string') return null
  const parts = header.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

/**
 * Creates an Astro SSR middleware.
 * Attaches `context.locals.user` with the verified session user (or null).
 *
 * Usage:
 *   // src/middleware.js
 *   import { GeniovaAuthServer } from '@geniova/auth/server'
 *   import { createAstroMiddleware } from '@geniova/auth/server'
 *
 *   const auth = GeniovaAuthServer.init({ appId: 'my-app', jwksUrl: '...' })
 *   export const onRequest = createAstroMiddleware(auth)
 *
 * @param {import('./GeniovaAuthServer.js').GeniovaAuthServer} auth
 * @param {object} [options]
 * @param {string[]} [options.publicPaths] - Paths that skip auth (e.g., ['/login', '/public'])
 * @returns {(context: any, next: Function) => Promise<Response>}
 */
export function createAstroMiddleware(auth, options = {}) {
  const { publicPaths = [] } = options

  return async (context, next) => {
    const pathname = new URL(context.request.url).pathname

    if (publicPaths.some((p) => pathname.startsWith(p))) {
      context.locals.user = null
      return next()
    }

    const token = extractBearerToken(context.request.headers.get('authorization'))
      ?? context.cookies?.get('geniova-session')?.value
      ?? null

    context.locals.user = token ? await auth.verifyToken(token) : null
    return next()
  }
}

/**
 * Creates a Next.js middleware function.
 * Returns a middleware compatible with Next.js middleware API.
 *
 * Usage:
 *   // middleware.js
 *   import { GeniovaAuthServer } from '@geniova/auth/server'
 *   import { createNextMiddleware } from '@geniova/auth/server'
 *
 *   const auth = GeniovaAuthServer.init({ appId: 'my-app', jwksUrl: '...' })
 *   export const middleware = createNextMiddleware(auth)
 *
 * @param {import('./GeniovaAuthServer.js').GeniovaAuthServer} auth
 * @param {object} [options]
 * @param {string[]} [options.publicPaths] - Paths that skip auth
 * @param {string} [options.loginPath] - Redirect path for unauthenticated users (default: '/login')
 * @returns {(request: any) => Promise<any>}
 */
export function createNextMiddleware(auth, options = {}) {
  const { publicPaths = [], loginPath = '/login' } = options

  return async (request) => {
    const { NextResponse } = await import('next/server')
    const pathname = request.nextUrl.pathname

    if (publicPaths.some((p) => pathname.startsWith(p))) {
      return NextResponse.next()
    }

    const token = extractBearerToken(request.headers.get('authorization'))
      ?? request.cookies.get('geniova-session')?.value
      ?? null

    if (!token) {
      return NextResponse.redirect(new URL(loginPath, request.url))
    }

    const user = await auth.verifyToken(token)

    if (!user) {
      return NextResponse.redirect(new URL(loginPath, request.url))
    }

    // Attach user info via headers for server components / API routes
    const response = NextResponse.next()
    response.headers.set('x-geniova-user', JSON.stringify(user))
    return response
  }
}

/**
 * Creates an Express/Connect middleware.
 * Attaches `req.user` with the verified session user.
 *
 * Usage:
 *   import { GeniovaAuthServer } from '@geniova/auth/server'
 *   import { createExpressMiddleware } from '@geniova/auth/server'
 *
 *   const auth = GeniovaAuthServer.init({ appId: 'my-app', jwksUrl: '...' })
 *   app.use(createExpressMiddleware(auth))
 *
 * @param {import('./GeniovaAuthServer.js').GeniovaAuthServer} auth
 * @param {object} [options]
 * @param {string[]} [options.publicPaths] - Paths that skip auth
 * @param {boolean} [options.required] - If true, returns 401 when no valid token (default: false)
 * @returns {(req: any, res: any, next: Function) => Promise<void>}
 */
export function createExpressMiddleware(auth, options = {}) {
  const { publicPaths = [], required = false } = options

  return async (req, res, next) => {
    const pathname = req.path || req.url

    if (publicPaths.some((p) => pathname.startsWith(p))) {
      req.user = null
      return next()
    }

    const token = extractBearerToken(req.headers.authorization)
      ?? req.cookies?.['geniova-session']
      ?? null

    const user = token ? await auth.verifyToken(token) : null

    if (required && !user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    req.user = user
    next()
  }
}
