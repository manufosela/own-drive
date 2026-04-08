# Changelog

Historial de cambios de Geniova Drive.

## v1.8.0 (2026-03-15)

### Mantenimiento

- bump version to v1.8.0 (6b219f4)

### Nuevas funcionalidades

- top pagination controls and page size selector (5c14711)
- sticky header/toolbar and redesigned selection bar (7716b0a)
- add global file sorting via PostgreSQL index (71a9d5c)
- GDR-TSK-0072: Botón para visualizar 2 STLs simultáneamente en el visor 3 (fb01f8c)
- replace dual STL button icon with eye/visibility icon (8d01f5f)
- dual STL viewer and improved PDF preview height (#40) (d189a7a)
- dual STL viewer and improved PDF preview height (453e63d)
- add Shift+click range selection for file checkboxes (2143cd2)
- add admin recycle bin panel with restore and permanent delete (1d9abae)
- add file management UI with selection, mkdir, delete and move dialogs (d8c9259)
- expose user permissions in file listing API response (62c5d75)
- add JPEG Lossless decoder for compressed DICOM/CBCT files (1c33440)
- add CBCT series viewer with scroll navigation between DICOM slices (47dbf15)
- add DICOM (.dcm) image viewer with windowing (533ee49)
- add STL 3D viewer and Markdown preview support (678eb03)
- add split-view preview panel for file explorer (1820613)
- open files in preview instead of downloading directly (50989d5)
- audit access navigation, login and logout (#31) (174ffc4)
- multi-platform desktop shortcuts (Windows, Linux, macOS) (c58f907)
- deep-linking con ?path= y botón copiar enlace (#30) (e75e447)

### Correcciones

- smart upper/lower jaw detection for dual STL viewer (74b8539)
- separate dual STL on Z axis for correct dental orientation (03110c3)
- separate dual STL meshes vertically instead of overlapping (59bfe2f)
- detect dual STL in nested tree items and make toolbar sticky (3931dc4)
- add deterministic tiebreaker to ORDER BY for consistent pagination (60ad7a3)
- use set comparison instead of count for index reconciliation (616da66)
- add missing mocks in files.test.js and remove dead _getSortedItems method (53c6542)
- use global sort order for size/modified columns instead of dirs-first (15e41f0)
- use global sort order for size/modified columns instead of dirs-first (433b853)
- show selection checkboxes on nested tree items (f40b038)
- correct domain from geniova.es to geniova.com in .env.example (8e3ebf5)
- truncate long filenames in file explorer table (#39) (ca27868)
- truncate long filenames with ellipsis in file table (02f7ed6)
- CSRF check, empty folder mkdir, action toolbar visibility (5d2bd1e)
- handle cross-device move with copy+delete fallback for NAS mounts (ff90f79)
- handle compressed DICOM files and add min-height to preview panel (579cc95)
- fix DICOM viewer import and pixel data alignment (871a31a)
- constrain preview panel to viewport height and use wider width (51cc779)
- derive cookie secure flag from request protocol, not hardcoded publicUrl (45b1181)
- derive auth redirect origin from Host header instead of context.url (05d370a)
- use request origin for auth redirect instead of hardcoded PUBLIC_URL (5a5760e)
- externalize next/server in rollup config for Docker build (f02fdd3)
- redirect to /logout on sign-out to close centralized session (582cddb)
- audit date filter excludes same-day entries (e2bd009)

### Tests

- add dual STL button visibility and _openDualStl tests (b0593ca)

### Documentacion

- add comprehensive README with install, config and architecture guide (9e8c130)

### Mejoras internas

- move copy-link and shortcut buttons to file explorer rows (dcf3839)

## v1.7.2 (2026-03-02)

### Mantenimiento

- bump version to v1.7.2 (a32d00b)

### Correcciones

- alias browser uses virtual paths from mount map to browse volumes (8684f08)

## v1.7.1 (2026-03-02)

### Mantenimiento

- bump version to v1.7.1 (e1d8269)

### Correcciones

- alias browser shows all active volumes instead of hardcoded /datosnas (4068fca)

## v1.7.0 (2026-03-02)

### Mantenimiento

- bump version to v1.7.0 (0dcd988)

### Nuevas funcionalidades

- add search mode selector (contains/starts/ends) to local search (92b4e94)

## v1.6.2 (2026-03-02)

### Mantenimiento

- bump version to v1.6.2 (675ee32)

### Correcciones

- remove justify-content from breadcrumb-bar (e32fc0d)

## v1.6.1 (2026-03-02)

### Mantenimiento

- bump version to v1.6.1 (a1ee5b8)

### Correcciones

- widen and center local search input in file explorer (55c4469)

## v1.6.0 (2026-03-02)

### Mantenimiento

- bump version to v1.6.0 (ab0de2c)

### Nuevas funcionalidades

- add local search bar in file explorer breadcrumbs (9c923f7)
- header search uses global search across all aliases (0ed99a8)
- add searchGlobal method to ApiClient (57e3436)
- add global search endpoint across all user aliases (7355b52)
- add node-cron for nightly reindex scheduling (01ac665)

## v1.5.7 (2026-03-01)

### Mantenimiento

- bump version to v1.5.7 (f8c6363)

## v1.5.6 (2026-02-28)

### Mantenimiento

- bump version to v1.5.6 (9bc3803)
- bump version to v1.5.5 (63f1ddf)
- bump version to v1.5.4 (63e4aa1)

### Correcciones

- remove Next.js middleware and test files from vendored SDK (fe9cf5a)
- vendor @geniova/auth SDK for Docker build compatibility (06def48)

### Mejoras internas

- replace jose with @geniova/auth/server for JWT verification (#28) (068ccc5)

## v1.5.3 (2026-02-21)

### Mantenimiento

- bump version to v1.5.3 (e748107)

### Correcciones

- use publicUrl to set secure cookie flag instead of PROD env (1d575aa)

## v1.5.2 (2026-02-21)

### Mantenimiento

- bump version to v1.5.2 (2d31952)

### Correcciones

- use publicUrl for auth redirect state to avoid Docker localhost (2cd936a)

## v1.5.1 (2026-02-21)

### Mantenimiento

- bump version to v1.5.1 (825a34a)

### Correcciones

- correct auth domain from .es to .com (abd58ca)

## v1.5.0 (2026-02-21)

### Mantenimiento

- bump version to v1.5.0 (3f6ba1c)

### Nuevas funcionalidades

- decouple geniova-drive from Firebase SDK (c606d7d)

## v1.4.2 (2026-02-21)

### Mantenimiento

- bump version to v1.4.2 (93ed560)

### Correcciones

- regenerate package-lock.json after SDK bundle rewrite (1eb5402)

## v1.4.1 (2026-02-21)

### Mantenimiento

- bump version to v1.4.1 (4e0857e)

### Correcciones

- bundle @geniova/auth SDK for Docker build (fc08387)

## v1.4.0 (2026-02-21)

### Mantenimiento

- bump version to v1.4.0 (3c859b6)

### Nuevas funcionalidades

- add remote session revocation UI with dropdown menu (1a7a31b)
- show user info and logout button in app header (#25) (37c50bc)

## v1.3.0 (2026-02-21)

### Mantenimiento

- bump version to v1.3.0 (9c45129)

### Nuevas funcionalidades

- integrate @geniova/auth client SDK for session detection (#24) (9030047)

## v1.2.0 (2026-02-21)

### Mantenimiento

- bump version to v1.2.0 (bfe6eff)
- update .env.example with AUTH_APP_ID, remove JWT secret (2a98d8a)

### Nuevas funcionalidades

- add read-only users tab with Auth&Sign link (a0bc6a9)
- sync is_admin from JWT roles on each login (1c09c80)
- add JIT user provisioning from Auth&Sign JWT (01a826c)
- integrate with geniova-auth RS256 JWT via JWKS (d008ce3)

## v1.1.2 (2026-02-20)

### Mantenimiento

- bump version to v1.1.2 (e7d0681)

### Correcciones

- include CHANGELOG.md in Docker build and fix version endpoint paths (8121365)

## v1.1.1 (2026-02-20)

### Mantenimiento

- bump version to v1.1.1 (000237b)

### Correcciones

- load version dynamically from API instead of hardcoded value (346619b)

## v1.1.0 (2026-02-20)

### Mantenimiento

- bump version to v1.1.0 (62c01a2)
- add nginx reverse proxy config for drive.geniova.es (bc1bfdc)

### Mejoras internas

- remove UNIX permission system, use alias/groups only (b50966e)
- convert TypeScript files to JavaScript with JSDoc (7b8b781)

### Correcciones

- reduce audit verbosity and improve audit UI (#18) (5633cbf)
- remove direct volume tabs, all users navigate via aliases (#16) (b3705d7)
- use correct table name user_groups instead of group_members (#12) (e99070e)
- improve alias info badge contrast in dark mode (#11) (e456ee6)
- replace Lit decorators with static properties for browser compatibility (4a1d544)
- add connection timeout to migration pool to prevent silent hangs (f09bc8c)
- use process.env instead of import.meta.env for server config (1ef8dbe)
- correct NAS mount paths and add Docker production setup (7632c07)

### Nuevas funcionalidades

- add volume management in admin panel (#17) (833bda5)
- add semantic versioning, changelog and version link in UI (#15) (d896f2d)
- add npm run deploy command (#14) (1b896a9)
- add group management CRUD in admin panel (#13) (9287577)
- add presence badges and heartbeat to file explorer (52ae596)
- add presence tracking system with heartbeat API (e939541)
- add audit log API endpoint and admin UI with filters (244cca7)
- add admin alias management panel with folder browser (254b507)
- add API client methods for admin aliases and folder permissions (49f4dc3)
- add alias-aware breadcrumbs and navigation guard (08e1178)
- add info badge showing real NAS path on alias tabs (4ee0d34)
- dynamic alias tabs replacing hardcoded volume tabs (9c956f3)
- add alias-based granular permission system (d8a2c3d)
- add expand/collapse all button to file explorer (#2) (0ab767d)
- add audit logging for all file operations (4e6a7bc)
- add granular folder permissions API per group (2de59ad)
- add CRUD API for folder aliases (2436bdf)
- add full CRUD for groups and member management (bf1d791)
- add migration 004 for folder_aliases and folder_permissions tables (473701b)
- add inline tree view for folder expansion in file explorer (e6396e9)
- replace filesystem search with PostgreSQL pg_trgm index (4459afd)
- add dark/light theme toggle with system preference detection (d9633f6)
- add volume selector tabs to switch between datosnas and no-comun (68826ff)
- add admin panel for permissions management (e71b38b)
- add disk quota system with upload integration (d4d51a9)
- add file search by name with search bar in header (ec0fc70)
- add file explorer component with breadcrumbs and sorting (bb1cac9)
- add upload component with drag & drop and progress tracking (c7609d3)
- add chunked upload API for large file uploads (a22db0d)
- add file download and multi-file ZIP download endpoints (16e6bfb)
- add CRUD file operations (rename, move, mkdir, delete) (e0ccd5f)
- add directory listing API endpoint with pagination (c6af903)
- add Auth&Sign JWT authentication middleware (a8fc537)
- add UNIX-style permission checker and middleware (2f9fa9a)
- add path sanitizer for traversal prevention (dd3a8f7)
- add PostgreSQL schema and migration runner (07fcfa2)
- scaffold Astro + Lit project with Docker Compose and PostgreSQL (98a1831)

### Documentacion

- add admin endpoints to Postman collection (921d0bf)
- add Postman collection and environment for API testing (2959d8d)

### Tests

- add Vitest setup and tests for path-sanitizer, db, config, migrate (c24c3e0)

