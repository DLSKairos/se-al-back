# Graph Report - señal-back  (2026-08-19)

## Corpus Check
- 278 files · ~99,671 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2170 nodes · 4618 edges · 180 communities (116 shown, 64 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 256 edges (avg confidence: 0.81)
- Token cost: 0 input · 268,593 output

## Community Hubs (Navigation)
- AI Prompts & Extraction
- Master Item DTOs
- Org Admin Creation DTO
- App Bootstrap & Exception Filter
- Slug Utils & Form Field DTO
- SSRF Guard & Webhook DTO
- Organization DTOs
- OAuth Module Docs
- Attendance & Inventarios Controllers
- Module Map Overview
- Electronic Signature Design Docs
- JWT Auth Guard & Decorators
- Departments Controller
- Electronic Signature Service Tests
- Signature/Magic-Link/Master Data Tables
- Plan Limits Guard
- Period Key & Form Submissions Service
- Create User DTO & Tests
- Electronic Signature Service
- Form Notifications Service
- Signature Creation & Form Signatures Controller
- TypeScript Config
- External Signer DTO
- Reading Log Entry DTO
- Admin Management Design Doc
- Signature Endpoints & Priority Notes
- Electronic Signature Controller
- Form Approval Controller
- Public Signature Controller
- Push Subscription DTO
- Admin Management Controller
- Attendance Config & Cron Services
- Attendance/Departments Controller Actions
- NestJS Controller Decorators
- Auth Controller & PIN DTOs
- Work Location DTO & Validator
- Form Category DTO
- Form Notification DTO
- Work Locations Controller
- Feature Flags & OAuth Constructors
- Form Exports Controller/Module
- Magic Link Service Tests
- Jest Test Dependencies
- NPM Scripts
- Attendance Reporting Endpoints
- Auth Controller WebAuthn Endpoints
- Auth OAuth Service
- Form Categories Controller
- Form Templates Controller
- Attendance & Entry DTOs
- Form Submissions Controller
- Magic Link & Mail Service
- Notifications Controller
- Notifications Service Tests
- NestJS Module Wiring
- Attendance Cron & Config
- Attendance Config DTO & Tests
- Signature/Approval Module Wiring
- Form Blueprint DTO
- Form Blueprints Controller
- Form Fields Controller
- Form Notifications Controller
- Sesion DTO (Inventarios)
- Inventarios Service
- Notifications Gateway (WebSocket)
- Auth Service & PIN Rate Limiter
- WebAuthn Service
- Create Form Template DTO
- Auth Controller PIN Endpoints
- Auth/PIN Service Constructors
- Auth OAuth Controller
- File Upload Validation Utils
- Magic Link Service
- Magic Link Controllers
- Bulk Notification DTOs
- Seed Data
- Admin Management & Magic Link Modules
- Feature Flags Controller
- Form Approval Service Tests
- Form Templates Service
- Status Controller
- Package Dependencies (AI/Upload)
- Notifications Design Doc
- OAuth PKCE & Crypto Utils
- Submission Query DTO
- Feature Flags Design Doc
- Jest Test Config
- Attendance Controller Actions
- Redis Service
- Canonical Hash Utils
- External Signature DTO
- Signature File Storage Service
- Form Submissions Stats Service
- Create Item DTO (Inventarios)
- Notifications Service
- Push Notification Cron Service
- Admin Management Service & DTO
- Feature Flags Service & Tests
- Create Submission DTO & Tests
- Query Notifications DTO
- Auth Service Login Methods
- JWT Strategy
- Form Submissions Service Tests
- Bulk Notification DTO
- Query Sent Notifications DTO
- Nest CLI Config
- Accesorio/Item DTOs (Inventarios)
- Package Metadata
- Notifications Module Wiring
- Change Status DTO
- File Storage Service
- PIN Rate Limiter Tests
- Reject Suggestion DTO
- Jest Config
- Public Decorator & Guard Tests
- Roles Guard Tests
- Form Keys Utils
- Feature Flag Update DTO
- Reject Submission DTO
- Form Blueprints findAll
- Batch Excel Export DTO
- First Admin Link DTO
- Invite Link DTO
- Redis Module
- First Admin Link DTO (alt)
- Form Templates Module
- Prisma Module
- Dependency: bcrypt
- Dependency: class-validator
- Dependency: cloudinary
- Dependency: helmet
- Dependency: ioredis
- Dependency: ipaddr.js
- Dependency: jest-mock-extended
- Dependency: luxon
- Dependency: mammoth
- Dependency: @nestjs/cli
- Dependency: @nestjs/common
- Dependency: @nestjs/config
- Dependency: @nestjs/core
- Dependency: @nestjs/jwt
- Dependency: @nestjs/mapped-types
- Dependency: @nestjs/passport
- Dependency: @nestjs/platform-express
- Dependency: @nestjs/platform-socket.io
- Dependency: @nestjs/schedule
- Dependency: @nestjs/schematics
- Dependency: @nestjs/testing
- Dependency: @nestjs/throttler
- Dependency: @nestjs/websockets
- Dependency: exceljs
- Dependency: openid-client
- Dependency: passport
- Dependency: passport-google-oauth20
- Dependency: passport-jwt
- Dependency: pdfmake
- Dependency: @prisma/client
- Dependency: reflect-metadata
- Dependency: resend
- Dependency: rxjs
- Dependency: @simplewebauthn/server
- Dependency: web-push
- Dependency: xlsx
- Dependency: prisma (dev)
- Dependency: tsconfig-paths
- Dependency: @types/bcrypt
- Dependency: @types/express
- Dependency: @types/luxon
- Dependency: @types/multer
- Dependency: @types/node
- Dependency: @types/passport-jwt
- Dependency: @types/pdf-parse
- Dependency: @types/pdfmake
- Dependency: @types/supertest

## God Nodes (most connected - your core abstractions)
1. `JwtPayload` - 159 edges
2. `CurrentUser` - 155 edges
3. `Roles()` - 99 edges
4. `PrismaService` - 87 edges
5. `RedisService` - 45 edges
6. `Mapa de módulos del backend` - 38 edges
7. `ElectronicSignatureService` - 35 edges
8. `JwtAuthGuard` - 33 edges
9. `RolesGuard` - 32 edges
10. `Módulo electronic-signature` - 25 edges

## Surprising Connections (you probably didn't know these)
- `setTestActivationCode()` --calls--> `hashToken()`  [EXTRACTED]
  test/helpers/factories.ts → src/common/utils/token.util.ts
- `SEÑAL Platform (README)` --conceptually_related_to--> `Módulo electronic-signature`  [INFERRED]
  /Users/david/dev/señal/señal-back/README.md → /Users/david/dev/señal/señal-back/docs/architecture/contracts/electronic-signature.md
- `Módulo auth-oauth` --semantically_similar_to--> `Tabla firma_tokens`  [INFERRED] [semantically similar]
  /Users/david/dev/señal/señal-back/docs/architecture/contracts/auth-oauth.md → /Users/david/dev/señal/señal-back/docs/architecture/contracts/electronic-signature.md
- `PlanLimitsGuard` --semantically_similar_to--> `RolesGuard`  [INFERRED] [semantically similar]
  /Users/david/dev/señal/señal-back/docs/architecture/contracts/plan-limits.md → /Users/david/dev/señal/señal-back/docs/architecture/contracts/admin-management.md
- `Decisión 2: firma externa solo por link de WhatsApp, sin email` --semantically_similar_to--> `Propósito EXTERNAL_SIGNER eliminado — firmantes externos usan firma_tokens`  [INFERRED] [semantically similar]
  /Users/david/dev/señal/señal-back/docs/sprint/DECISIONES.md → /Users/david/dev/señal/señal-back/docs/architecture/contracts/magic-link.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo de invitación y activación OAuth de administradores** — docs_architecture_contracts_admin_management_admin_management, docs_architecture_contracts_magic_link_magic_link, docs_architecture_contracts_auth_oauth_auth_oauth, docs_architecture_contracts_notifications_notifications, docs_architecture_contracts_superadmin_superadmin [INFERRED 0.85]
- **Pipeline de firma electrónica, auto-aprobación y feedback UI** — docs_architecture_contracts_electronic_signature_electronic_signature, docs_architecture_contracts_form_approval_flow_form_approval_flow, docs_architecture_contracts_notifications_notifications, docs_architecture_contracts_loading_feedback_loading_feedback, concept_form_submissions_module [INFERRED 0.85]
- **Módulos que dependen del módulo users** — docs_architecture_contracts_admin_management_admin_management, docs_architecture_contracts_admin_notifications_admin_notifications, docs_architecture_contracts_auth_oauth_auth_oauth, docs_architecture_contracts_master_lists_master_lists, docs_architecture_contracts_loading_feedback_loading_feedback, docs_architecture_contracts_plan_limits_plan_limits, docs_architecture_contracts_superadmin_superadmin, docs_architecture_contracts_notifications_notifications [INFERRED 0.80]
- **Cadena de prioridad documental del sprint: DECISIONES.md > FIRMA_ELECTRONICA.md > SPRINT_TAREAS.md** — docs_sprint_decisiones_decisiones, docs_sprint_firma_electronica_firma_electronica, docs_sprint_sprint_tareas_sprint_tareas [EXTRACTED 1.00]
- **Cluster de despliegue gradual: diseño y guía operativa de feature flags coordinan la activación de OAuth Google/Microsoft, SMTP y firma electrónica sin nuevo deploy** — docs_architecture_feature_flags_feature_flags, docs_setup_feature_flags_feature_flags, docs_setup_oauth_google_oauth_google, docs_setup_oauth_microsoft_oauth_microsoft, docs_setup_smtp_smtp [INFERRED 0.85]
- **Cluster de diseño del módulo de firma electrónica: fuente de verdad funcional, modelo de datos Prisma y contrato de módulo** — docs_sprint_firma_electronica_firma_electronica, docs_architecture_data_design_data_design, docs_architecture_contracts_electronic_signature_electronic_signature [INFERRED 0.85]

## Communities (180 total, 64 thin omitted)

### Community 0 - "AI Prompts & Extraction"
Cohesion: 0.05
Nodes (40): ArrayMaxSize, ASSIST_SYSTEM_PROMPT, EXTRACT_SYSTEM_PROMPT, EXTRACT_USER_PROMPT, GENERATE_SYSTEM_PROMPT, GENERATE_USER_PROMPT, AdminChatDto, ChatMessageDto (+32 more)

### Community 1 - "Master Item DTOs"
Cohesion: 0.08
Nodes (25): CreateMasterItemDto, IsNotEmpty, IsString, MaxLength, MinLength, CreateSuggestionDto, IsEnum, IsNotEmpty (+17 more)

### Community 2 - "Org Admin Creation DTO"
Cohesion: 0.07
Nodes (27): IsHexColor, IsPositive, CreateOrgAdminDto, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength (+19 more)

### Community 3 - "App Bootstrap & Exception Filter"
Cohesion: 0.10
Nodes (24): Catch, AppModule, Module, HttpExceptionFilter, ApiResponse, isReadableStream(), ResponseTransformInterceptor, Injectable (+16 more)

### Community 4 - "Slug Utils & Form Field DTO"
Cohesion: 0.08
Nodes (29): labelToSlug(), toSnakeCase(), CreateFormFieldDto, FieldOptionItem, IsArray, IsBoolean, IsEnum, IsInt (+21 more)

### Community 5 - "SSRF Guard & Webhook DTO"
Cohesion: 0.08
Nodes (26): RFC-1918, assertIpAllowed(), assertPublicHttpUrl(), isBlockedRange(), CreateWebhookDto, IsArray, IsOptional, IsString (+18 more)

### Community 6 - "Organization DTOs"
Cohesion: 0.09
Nodes (20): CreateOrganizationDto, IsNotEmpty, IsString, MaxLength, IsOptional, IsString, MaxLength, UpdateOrganizationDto (+12 more)

### Community 7 - "OAuth Module Docs"
Cohesion: 0.09
Nodes (32): Módulo auth (existente, JWT), JwtAuthGuard, nodemailer (existente), Módulo auth-oauth, feature:oauth_google, feature:oauth_microsoft, GET /auth/google/callback, GET /auth/microsoft/callback (+24 more)

### Community 8 - "Attendance & Inventarios Controllers"
Cohesion: 0.14
Nodes (14): Roles(), InventariosController, Body, Controller, Delete, Get, HttpCode, Param (+6 more)

### Community 9 - "Module Map Overview"
Cohesion: 0.09
Nodes (30): Módulo attendance (existente), authStore (Zustand, frontend), Módulo departments (existente), Módulo form-ai (existente), Módulo form-blueprints (existente), Módulo form-categories (existente), Módulo form-exports (existente), Módulo form-fields (existente) (+22 more)

### Community 10 - "Electronic Signature Design Docs"
Cohesion: 0.09
Nodes (30): Cloudinary (storage existente), Módulo form-submissions (existente), Decreto 2364/2012 (Colombia), Módulo electronic-signature, docs/sprint/FIRMA_ELECTRONICA.md (fuente de verdad), Tabla firmantes_externos, Tabla form_signatures (legado, no modificada), Hash de integridad SHA-256 sobre objeto canónico (+22 more)

### Community 11 - "JWT Auth Guard & Decorators"
Cohesion: 0.27
Nodes (5): JwtAuthGuard, Injectable, RolesGuard, Injectable, ALLOWED_MIMETYPES

### Community 12 - "Departments Controller"
Cohesion: 0.10
Nodes (17): DepartmentsController, Body, Controller, Get, HttpCode, Post, UseGuards, DepartmentsModule (+9 more)

### Community 13 - "Electronic Signature Service Tests"
Cohesion: 0.08
Nodes (27): baseSignExternalDto, baseSignInternalDto, buildSubmission(), buildToken(), config, fileStorage, formApproval, futureDate() (+19 more)

### Community 14 - "Signature/Magic-Link/Master Data Tables"
Cohesion: 0.09
Nodes (27): Tabla firma_tokens, Campo signature_mode (Estricto/Flexible) en FormTemplate, Tabla magic_link_tokens, Tabla master_positions, Tabla master_roles, Diseño de datos (Prisma) — sprint OAuth/Firma/SuperAdmin, Extensión de Department (org_id/email nullable, active), Riesgo: org_id nullable en Department (auditoría) (+19 more)

### Community 15 - "Plan Limits Guard"
Cohesion: 0.11
Nodes (15): PLAN_LIMIT_RESOURCE_KEY, PlanLimitResource, PlanLimitsGuard, mockOrgConfigFindUnique, mockRedisGet, mockRedisSet, mockUserCount, mockWorkLocationCount (+7 more)

### Community 16 - "Period Key & Form Submissions Service"
Cohesion: 0.11
Nodes (14): computePeriodKey(), Frequency, FormSubmissionsService, Inject, Injectable, FieldWithState, FormValidityService, mockSignatureFindFirst (+6 more)

### Community 17 - "Create User DTO & Tests"
Cohesion: 0.13
Nodes (11): ASSIGNABLE_ROLES, CreateUserDto, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength (+3 more)

### Community 19 - "Form Notifications Service"
Cohesion: 0.12
Nodes (9): FormNotificationsService, NotificationPayload, NotificationRecipients, Injectable, PrismaService, Injectable, PUSH_MESSAGES, PushNotificationsService (+1 more)

### Community 20 - "Signature Creation & Form Signatures Controller"
Cohesion: 0.11
Nodes (16): CreateSignatureDto, IsNotEmpty, IsOptional, IsString, FormSignaturesController, Body, Controller, Get (+8 more)

### Community 21 - "TypeScript Config"
Cohesion: 0.08
Nodes (23): src/common/*, src/prisma/prisma.service, compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators (+15 more)

### Community 22 - "External Signer DTO"
Cohesion: 0.10
Nodes (19): CreateExternalSignerDto, IsNotEmpty, IsString, Matches, MaxLength, MinLength, CreateSignatureTokenDto, IsNotEmpty (+11 more)

### Community 23 - "Reading Log Entry DTO"
Cohesion: 0.11
Nodes (20): ReadingLogEntryDto, IsInt, IsNotEmpty, IsString, Min, Type, SignInternalDto, ArrayMinSize (+12 more)

### Community 24 - "Admin Management Design Doc"
Cohesion: 0.13
Nodes (21): Módulo common (existente, guards), RolesGuard, Módulo users (existente), Módulo work-locations (existente), Módulo admin-management, POST /admin/administrators, GET /auth/magic-link, Módulo magic-link (+13 more)

### Community 25 - "Signature Endpoints & Priority Notes"
Cohesion: 0.13
Nodes (23): Módulo form-templates (existente), POST /firma/:token/sign, POST /signature/sign/internal, <VerifyingOverlay /> componente, Propósito EXTERNAL_SIGNER eliminado — firmantes externos usan firma_tokens, Nota de prioridad: DECISIONES.md > FIRMA_ELECTRONICA.md > SPRINT_TAREAS.md, Confirmaciones de la realidad del código base (dos repos, Organization, snake_case, Cloudinary, nodemailer, etc.), DECISIONES.md — decisiones del product owner (+15 more)

### Community 26 - "Electronic Signature Controller"
Cohesion: 0.20
Nodes (11): Put, ElectronicSignatureController, Body, Controller, Get, HttpCode, Param, Post (+3 more)

### Community 27 - "Form Approval Controller"
Cohesion: 0.10
Nodes (12): FormApprovalController, Body, Controller, Get, HttpCode, Param, Patch, Query (+4 more)

### Community 28 - "Public Signature Controller"
Cohesion: 0.13
Nodes (16): JPEG_MAGIC, PNG_MAGIC, PublicSignatureController, Body, Controller, Get, HttpCode, Param (+8 more)

### Community 29 - "Push Subscription DTO"
Cohesion: 0.11
Nodes (15): PushSubscriptionDto, PushSubscriptionKeysDto, IsString, IsUrl, Type, ValidateNested, PushNotificationsController, Body (+7 more)

### Community 30 - "Admin Management Controller"
Cohesion: 0.14
Nodes (11): AdminManagementController, Body, Controller, Get, HttpCode, Param, Patch, Post (+3 more)

### Community 31 - "Attendance Config & Cron Services"
Cohesion: 0.18
Nodes (7): AttendanceConfigService, Injectable, AttendanceOvertimeService, OvertimeResult, Injectable, createTestAttendanceConfig(), redisServiceMock

### Community 32 - "Attendance/Departments Controller Actions"
Cohesion: 0.14
Nodes (10): Patch, CurrentUser, Delete, Param, Patch, Get, Param, Query (+2 more)

### Community 33 - "NestJS Controller Decorators"
Cohesion: 0.19
Nodes (9): Body, Controller, Delete, Get, Param, Patch, Post, UseGuards (+1 more)

### Community 34 - "Auth Controller & PIN DTOs"
Cohesion: 0.13
Nodes (13): PinInitDto, IsNotEmpty, IsString, PinSetDto, IsNotEmpty, IsString, Matches, PinStatusDto (+5 more)

### Community 35 - "Work Location DTO & Validator"
Cohesion: 0.15
Nodes (13): CreateWorkLocationDto, LatLngOrAddressConstraint, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength (+5 more)

### Community 36 - "Form Category DTO"
Cohesion: 0.16
Nodes (10): CreateFormCategoryDto, IsNotEmpty, IsOptional, IsString, MaxLength, UpdateFormCategoryDto, FormCategoriesModule, Module (+2 more)

### Community 37 - "Form Notification DTO"
Cohesion: 0.13
Nodes (17): CreateFormNotificationDto, NotificationRecipientDto, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString (+9 more)

### Community 38 - "Work Locations Controller"
Cohesion: 0.15
Nodes (8): Body, Controller, Get, Post, UseGuards, WorkLocationsController, Injectable, WorkLocationsService

### Community 39 - "Feature Flags & OAuth Constructors"
Cohesion: 0.16
Nodes (5): Get, Res, FeatureFlagsService, createService(), Injectable

### Community 40 - "Form Exports Controller/Module"
Cohesion: 0.16
Nodes (9): FormExportsController, Controller, UseGuards, FormExportsModule, Module, FormExportsService, PDF_FONTS, PdfPrinter (+1 more)

### Community 41 - "Magic Link Service Tests"
Cohesion: 0.11
Nodes (16): adminUser, config, featureFlags, FUTURE_72H, MagicLinkTokenFixture, mail, mockMagicLinkTokenCreate, mockMagicLinkTokenFindUnique (+8 more)

### Community 42 - "Jest Test Dependencies"
Cohesion: 0.12
Nodes (17): jest, devDependencies, jest, supertest, ts-jest, ts-node, @types/jest, @types/passport-google-oauth20 (+9 more)

### Community 43 - "NPM Scripts"
Cohesion: 0.12
Nodes (17): scripts, build, lint, prisma:generate, prisma:migrate, prisma:seed, seed, start (+9 more)

### Community 44 - "Attendance Reporting Endpoints"
Cohesion: 0.15
Nodes (11): Get, Query, Res, AttendanceReportQueryDto, IsDateString, IsInt, IsOptional, IsString (+3 more)

### Community 45 - "Auth Controller WebAuthn Endpoints"
Cohesion: 0.18
Nodes (9): Get, Post, UseGuards, JwtPayload, Body, Param, Post, Param (+1 more)

### Community 47 - "Form Categories Controller"
Cohesion: 0.15
Nodes (10): FormCategoriesController, Body, Controller, Delete, Get, HttpCode, Param, Patch (+2 more)

### Community 48 - "Form Templates Controller"
Cohesion: 0.18
Nodes (10): FormTemplatesController, Body, Controller, Delete, Get, HttpCode, Param, Patch (+2 more)

### Community 49 - "Attendance & Entry DTOs"
Cohesion: 0.15
Nodes (11): CloseDayDto, IsDateString, IsOptional, EntryAttendanceDto, IsOptional, IsString, ExitAttendanceDto, IsInt (+3 more)

### Community 50 - "Form Submissions Controller"
Cohesion: 0.18
Nodes (10): FormSubmissionsController, Body, Controller, Get, HttpCode, Param, Patch, Post (+2 more)

### Community 51 - "Magic Link & Mail Service"
Cohesion: 0.20
Nodes (9): Inject, baseLayout(), buildFirstAccessTemplate(), buildInviteTemplate(), escapeHtml(), MagicLinkFirstAccessContext, MagicLinkInviteContext, MailService (+1 more)

### Community 52 - "Notifications Controller"
Cohesion: 0.17
Nodes (10): NotificationsController, Body, Controller, Get, HttpCode, Param, Patch, Post (+2 more)

### Community 53 - "Notifications Service Tests"
Cohesion: 0.12
Nodes (14): mockNotificationCount, mockNotificationCreate, mockNotificationFindMany, mockNotificationFindUnique, mockNotificationUpdate, mockNotificationUpdateMany, mockPublish, mockTransactionFn (+6 more)

### Community 54 - "NestJS Module Wiring"
Cohesion: 0.17
Nodes (12): AttendanceModule, Module, AuthModule, Module, AuthOAuthModule, Module, StatusModule, Module (+4 more)

### Community 55 - "Attendance Cron & Config"
Cohesion: 0.19
Nodes (5): AttendanceCronService, Cron, Injectable, AttendanceService, Injectable

### Community 56 - "Attendance Config DTO & Tests"
Cohesion: 0.15
Nodes (11): AttendanceConfigDto, SetHolidaysDto, IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString (+3 more)

### Community 57 - "Signature/Approval Module Wiring"
Cohesion: 0.19
Nodes (10): ElectronicSignatureModule, Module, FormApprovalModule, Module, FormSubmissionsModule, Module, MasterListsModule, Module (+2 more)

### Community 58 - "Form Blueprint DTO"
Cohesion: 0.20
Nodes (10): CreateFormBlueprintDto, IsArray, IsOptional, IsString, MinLength, QueryFormBlueprintsDto, IsOptional, IsString (+2 more)

### Community 59 - "Form Blueprints Controller"
Cohesion: 0.18
Nodes (9): FormBlueprintsController, Body, Controller, HttpCode, Param, Post, UseGuards, FormBlueprintsService (+1 more)

### Community 60 - "Form Fields Controller"
Cohesion: 0.21
Nodes (10): FormFieldsController, Body, Controller, Delete, Get, HttpCode, Param, Patch (+2 more)

### Community 61 - "Form Notifications Controller"
Cohesion: 0.16
Nodes (10): FormNotificationsController, Body, Controller, Delete, Get, HttpCode, Param, Patch (+2 more)

### Community 62 - "Sesion DTO (Inventarios)"
Cohesion: 0.18
Nodes (11): CreateSesionDto, IsDateString, IsNumber, IsOptional, IsString, Min, IsIn, IsOptional (+3 more)

### Community 64 - "Notifications Gateway (WebSocket)"
Cohesion: 0.15
Nodes (6): ConnectedSocket, MessageBody, NotificationsGateway, SubscribeMessage, WebSocketGateway, WebSocketServer

### Community 65 - "Auth Service & PIN Rate Limiter"
Cohesion: 0.21
Nodes (5): UserPublic, PinRateLimiterService, Injectable, Controller, WebAuthnController

### Community 66 - "WebAuthn Service"
Cohesion: 0.23
Nodes (5): Injectable, WebAuthnService, hashToken(), isActivationCodeValid(), safeCompareHex()

### Community 67 - "Create Form Template DTO"
Cohesion: 0.19
Nodes (11): CreateFormTemplateDto, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional (+3 more)

### Community 68 - "Auth Controller PIN Endpoints"
Cohesion: 0.36
Nodes (5): AuthController, Body, Controller, Req, Public()

### Community 70 - "Auth OAuth Controller"
Cohesion: 0.31
Nodes (6): AuthOAuthController, Controller, Get, Query, Req, Res

### Community 71 - "File Upload Validation Utils"
Cohesion: 0.18
Nodes (7): validateMagicBytes(), ALLOWED_IMAGE_TYPES, AllowedImageType, InventariosIaService, Injectable, InventariosModule, Module

### Community 72 - "Magic Link Service"
Cohesion: 0.33
Nodes (5): randomToken(), INotificationsService, MagicLinkService, MagicLinkValidateResult, Injectable

### Community 73 - "Magic Link Controllers"
Cohesion: 0.18
Nodes (7): MagicLinkController, MagicLinkPublicController, Controller, Get, Query, Throttle, UseGuards

### Community 74 - "Bulk Notification DTOs"
Cohesion: 0.19
Nodes (9): BulkNotificationTarget, CreateNotificationInput, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, NotificationCreatedPayload (+1 more)

### Community 75 - "Seed Data"
Cohesion: 0.24
Nodes (9): BLUEPRINT_IDS, BlueprintField, COLOMBIA_HOLIDAYS_2026, main(), seedMasterLists(), seedOrgConfigs(), prisma, seedBlueprints() (+1 more)

### Community 76 - "Admin Management & Magic Link Modules"
Cohesion: 0.21
Nodes (8): AdminManagementModule, Module, MagicLinkModule, Module, MailModule, Module, SuperadminModule, Module

### Community 77 - "Feature Flags Controller"
Cohesion: 0.17
Nodes (9): FeatureFlagsController, Body, Controller, Param, Patch, UseGuards, FeatureFlagsModule, Global (+1 more)

### Community 78 - "Form Approval Service Tests"
Cohesion: 0.18
Nodes (11): buildSubmission(), filledValue(), mockSubmissionFindFirst, mockSubmissionFindUnique, mockSubmissionUpdate, mockTransactionFn, mockUserFindMany, notifications (+3 more)

### Community 80 - "Status Controller"
Cohesion: 0.21
Nodes (6): StatusController, Controller, Get, UseGuards, StatusService, Injectable

### Community 81 - "Package Dependencies (AI/Upload)"
Cohesion: 0.18
Nodes (11): @anthropic-ai/sdk, class-transformer, multer, dependencies, @anthropic-ai/sdk, class-transformer, multer, pdf-parse (+3 more)

### Community 82 - "Notifications Design Doc"
Cohesion: 0.24
Nodes (11): Módulo form-notifications (existente), Módulo push-notifications (existente), Módulo admin-notifications, POST /admin/notifications, NotificationType.CUSTOM_ADMIN, Evento Redis notification.created, Módulo notifications, Tabla notifications (+3 more)

### Community 83 - "OAuth PKCE & Crypto Utils"
Cohesion: 0.27
Nodes (8): RFC-7636, DiscoveredConfig, loadOpenIdClient, OAuthStatePayload, decrypt(), encrypt(), randomHex(), TEST_KEY_HEX

### Community 84 - "Submission Query DTO"
Cohesion: 0.18
Nodes (9): SubmissionQueryDto, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min (+1 more)

### Community 85 - "Feature Flags Design Doc"
Cohesion: 0.22
Nodes (10): Módulo feature-flags, Módulo redis (existente), Diseño del sistema de feature flags, FeatureFlagsService (isEnabled/isEnabledSync/refreshCache), Caché local en memoria con TTL 30s, GET /feature-flags (endpoint público, diseño), Estructura de claves Redis feature:<nombre>, GET /api/feature-flags (endpoint público, guía operativa) (+2 more)

### Community 86 - "Jest Test Config"
Cohesion: 0.20
Nodes (9): src/**/*.ts, test/**/*.ts, ./tsconfig.json, compilerOptions, inlineSources, outDir, sourceMap, extends (+1 more)

### Community 87 - "Attendance Controller Actions"
Cohesion: 0.29
Nodes (5): AttendanceController, Body, Controller, Post, UseGuards

### Community 89 - "Canonical Hash Utils"
Cohesion: 0.44
Nodes (6): calculateCanonicalHash(), CanonicalDocument, CanonicalQuestion, CanonicalSigner, HASH_VERSION, stableStringify()

### Community 90 - "External Signature DTO"
Cohesion: 0.20
Nodes (10): SignExternalDto, ArrayMinSize, IsArray, IsBase64, IsNotEmpty, IsNumber, IsOptional, IsString (+2 more)

### Community 92 - "Form Submissions Stats Service"
Cohesion: 0.24
Nodes (4): FormSubmissionsStatsService, SubmissionStats, TrendRow, Injectable

### Community 93 - "Create Item DTO (Inventarios)"
Cohesion: 0.20
Nodes (10): CreateItemDto, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min (+2 more)

### Community 95 - "Push Notification Cron Service"
Cohesion: 0.44
Nodes (3): PushCronService, Cron, Injectable

### Community 96 - "Admin Management Service & DTO"
Cohesion: 0.25
Nodes (7): CreateAdminDto, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength

### Community 97 - "Feature Flags Service & Tests"
Cohesion: 0.25
Nodes (7): CacheEntry, KNOWN_FLAGS, KnownFlag, mockMget, mockRedisGet, mockRedisSet, redis

### Community 98 - "Create Submission DTO & Tests"
Cohesion: 0.25
Nodes (6): CreateSubmissionDto, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString

### Community 99 - "Query Notifications DTO"
Cohesion: 0.22
Nodes (7): QueryNotificationsDto, IsBoolean, IsInt, IsOptional, Max, Min, Transform

### Community 101 - "JWT Strategy"
Cohesion: 0.32
Nodes (4): AuthState, authStateKey(), JwtStrategy, Injectable

### Community 102 - "Form Submissions Service Tests"
Cohesion: 0.25
Nodes (7): formApproval, formNotifications, formValidity, mockFindFirst, mockFindUnique, mockUpdate, prisma

### Community 103 - "Bulk Notification DTO"
Cohesion: 0.25
Nodes (8): CreateBulkNotificationDto, IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf

### Community 104 - "Query Sent Notifications DTO"
Cohesion: 0.25
Nodes (6): QuerySentNotificationsDto, IsInt, IsOptional, Max, Min, Transform

### Community 105 - "Nest CLI Config"
Cohesion: 0.29
Nodes (6): collection, compilerOptions, deleteOutDir, plugins, $schema, sourceRoot

### Community 106 - "Accesorio/Item DTOs (Inventarios)"
Cohesion: 0.43
Nodes (4): CreateAccesorioDto, IsOptional, IsString, UpdateItemDto

### Community 107 - "Package Metadata"
Cohesion: 0.33
Nodes (5): description, name, prisma, seed, version

### Community 108 - "Notifications Module Wiring"
Cohesion: 0.40
Nodes (4): FormNotificationsModule, Module, PushNotificationsModule, Module

### Community 109 - "Change Status DTO"
Cohesion: 0.33
Nodes (5): ChangeStatusDto, IsEnum, IsOptional, IsString, MaxLength

### Community 112 - "Reject Suggestion DTO"
Cohesion: 0.40
Nodes (4): RejectSuggestionDto, IsOptional, IsString, MaxLength

### Community 113 - "Jest Config"
Cohesion: 0.50
Nodes (3): config, moduleNameMapper, tsJestConfig

### Community 119 - "Reject Submission DTO"
Cohesion: 0.50
Nodes (3): RejectSubmissionDto, IsString, MinLength

### Community 121 - "Batch Excel Export DTO"
Cohesion: 0.50
Nodes (4): BatchExcelQueryDto, IsDateString, IsNotEmpty, IsString

### Community 122 - "First Admin Link DTO"
Cohesion: 0.50
Nodes (3): GenerateFirstAdminLinkDto, IsNotEmpty, IsString

### Community 123 - "Invite Link DTO"
Cohesion: 0.50
Nodes (3): GenerateInviteLinkDto, IsNotEmpty, IsString

### Community 124 - "Redis Module"
Cohesion: 0.50
Nodes (3): RedisModule, Global, Module

### Community 125 - "First Admin Link DTO (alt)"
Cohesion: 0.50
Nodes (3): FirstAdminLinkDto, IsNotEmpty, IsString

### Community 127 - "Prisma Module"
Cohesion: 0.67
Nodes (3): PrismaModule, Global, Module

## Knowledge Gaps
- **297 isolated node(s):** `moduleNameMapper`, `tsJestConfig`, `config`, `$schema`, `collection` (+292 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **64 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `JwtPayload` connect `Auth Controller WebAuthn Endpoints` to `AI Prompts & Extraction`, `Master Item DTOs`, `Org Admin Creation DTO`, `Slug Utils & Form Field DTO`, `SSRF Guard & Webhook DTO`, `Organization DTOs`, `Attendance & Inventarios Controllers`, `JWT Auth Guard & Decorators`, `Departments Controller`, `Plan Limits Guard`, `Signature Creation & Form Signatures Controller`, `External Signer DTO`, `Electronic Signature Controller`, `Form Approval Controller`, `Push Subscription DTO`, `Admin Management Controller`, `Attendance/Departments Controller Actions`, `NestJS Controller Decorators`, `Auth Controller & PIN DTOs`, `Work Location DTO & Validator`, `Work Locations Controller`, `Attendance Reporting Endpoints`, `Form Categories Controller`, `Form Templates Controller`, `Attendance & Entry DTOs`, `Form Submissions Controller`, `Notifications Controller`, `Attendance Cron & Config`, `Form Blueprint DTO`, `Form Blueprints Controller`, `Form Fields Controller`, `Form Notifications Controller`, `Status Controller`, `Attendance Controller Actions`, `JWT Strategy`, `Form Blueprints findAll`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `Attendance/Departments Controller Actions` to `AI Prompts & Extraction`, `Master Item DTOs`, `Org Admin Creation DTO`, `Slug Utils & Form Field DTO`, `SSRF Guard & Webhook DTO`, `Organization DTOs`, `Attendance & Inventarios Controllers`, `JWT Auth Guard & Decorators`, `Departments Controller`, `Plan Limits Guard`, `Signature Creation & Form Signatures Controller`, `External Signer DTO`, `Electronic Signature Controller`, `Form Approval Controller`, `Push Subscription DTO`, `Admin Management Controller`, `NestJS Controller Decorators`, `Auth Controller & PIN DTOs`, `Work Location DTO & Validator`, `Work Locations Controller`, `Attendance Reporting Endpoints`, `Auth Controller WebAuthn Endpoints`, `Form Categories Controller`, `Form Templates Controller`, `Attendance & Entry DTOs`, `Form Submissions Controller`, `Notifications Controller`, `Attendance Cron & Config`, `Form Blueprint DTO`, `Form Blueprints Controller`, `Form Fields Controller`, `Form Notifications Controller`, `Status Controller`, `Attendance Controller Actions`, `Form Blueprints findAll`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `Form Notifications Service` to `AI Prompts & Extraction`, `Master Item DTOs`, `Org Admin Creation DTO`, `App Bootstrap & Exception Filter`, `Slug Utils & Form Field DTO`, `SSRF Guard & Webhook DTO`, `Organization DTOs`, `JWT Auth Guard & Decorators`, `Departments Controller`, `Plan Limits Guard`, `Period Key & Form Submissions Service`, `Create User DTO & Tests`, `Signature Creation & Form Signatures Controller`, `Form Approval Controller`, `Admin Management Controller`, `Attendance Config & Cron Services`, `Work Location DTO & Validator`, `Form Category DTO`, `Work Locations Controller`, `Feature Flags & OAuth Constructors`, `Form Exports Controller/Module`, `Magic Link & Mail Service`, `Attendance Cron & Config`, `Form Blueprint DTO`, `Form Blueprints Controller`, `Form Notifications Controller`, `Sesion DTO (Inventarios)`, `Auth Service & PIN Rate Limiter`, `WebAuthn Service`, `Create Form Template DTO`, `Auth/PIN Service Constructors`, `Magic Link Service`, `Bulk Notification DTOs`, `Form Templates Service`, `Status Controller`, `OAuth PKCE & Crypto Utils`, `Redis Service`, `Canonical Hash Utils`, `Signature File Storage Service`, `Form Submissions Stats Service`, `Notifications Service`, `Admin Management Service & DTO`, `JWT Strategy`, `File Storage Service`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **What connects `moduleNameMapper`, `tsJestConfig`, `config` to the rest of the system?**
  _297 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI Prompts & Extraction` be split into smaller, more focused modules?**
  _Cohesion score 0.05076679005817028 - nodes in this community are weakly interconnected._
- **Should `Master Item DTOs` be split into smaller, more focused modules?**
  _Cohesion score 0.07878787878787878 - nodes in this community are weakly interconnected._
- **Should `Org Admin Creation DTO` be split into smaller, more focused modules?**
  _Cohesion score 0.06859903381642513 - nodes in this community are weakly interconnected._