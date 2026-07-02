import type { Environment } from './prompts'

export const EXAMPLES: Record<Environment, string> = {
  staging: `PR #127 — Add user profile avatar upload feature
Branch: feature/avatar-upload → staging

Changes:
- New: AvatarUploadController.ts (180 lines)
- New: S3UploadService.ts (95 lines)
- Modified: UserProfileModel.ts (+45 lines — added avatarUrl field)
- Modified: UserController.ts (+12 lines)
- New: avatar-upload.spec.ts (8 unit tests, 2 integration tests)

Dependencies added:
- multer: ^1.4.5 (file upload middleware)
- sharp: ^0.33.0 (image resizing — new dependency)
- @aws-sdk/client-s3: ^3.400.0 (already used elsewhere in codebase)

Summary:
Users can now upload a profile picture (max 5MB, JPEG/PNG/WebP). Images are
resized to 200x200 and stored in S3 under /avatars/{userId}. No DB schema
migration needed — avatarUrl is a nullable column added in last sprint.
Old default avatar fallback still works if upload fails.

Test coverage: 10 new tests. Auth middleware unchanged. No payment flows touched.`,

  production: `PR #89 — Migrate authentication from JWT to OAuth2 + PKCE
Branch: auth-overhaul → main  [PRODUCTION DEPLOY]

Changes (high blast radius):
- Refactored: AuthService.ts — 420 lines changed (complete rewrite)
- Refactored: SessionMiddleware.ts — 180 lines changed
- Modified: UserModel.ts (+60 lines — new oauth_provider, oauth_id fields)
- New: OAuth2Controller.ts (210 lines — handles callback, token exchange)
- New: PkceHelper.ts (60 lines — code verifier/challenge generation)
- Deleted: LegacyJwtHelper.ts (no longer needed)
- DB migration: 0042_add_oauth_tokens.sql — adds oauth_tokens table, adds
  index on users.oauth_id, deprecates (but does NOT drop) sessions table

Tests: 24 new tests, 18 modified, 3 deleted
New dependencies: passport-oauth2 ^1.7.0, crypto-js ^4.2.0
Removed: jsonwebtoken, express-jwt

Impact:
- All existing sessions will be INVALIDATED on deploy — users must re-login
- Mobile app v3.x uses old JWT — will break until app update ships (ETA: 48h)
- SSO integrations with Okta and Google remain compatible (tested)
- Admin impersonation feature temporarily disabled pending OAuth2 port`,

  hotfix: `HOTFIX — Critical NullPointerException in checkout flow
Branch: hotfix/checkout-npe → main  [EMERGENCY PRODUCTION HOTFIX]

Incident: 8% of checkout attempts failing with 500 since v2.3.1 deploy (4 hours ago)
Error: NullPointerException at OrderController.processPayment():L147
Sentry issue: PROD-4821 | ~2,400 failed transactions/hour

Root cause:
discount_code field is null when user proceeds without a promo code.
Stripe API call at L147 does not handle null — previous code path always
defaulted to empty string via legacy helper that was removed in v2.3.1.

Fix (2 lines changed):
- Modified: OrderController.ts L145-147 — added null guard: if (!discountCode) discountCode = ''
- Modified: OrderController.spec.ts — added test case for null discount code (8 lines)

Scope: Extremely narrow — 2 lines in 1 file + 1 test file. No DB changes.
No dependency changes. No API contract changes. No auth changes.

Tested: 200 checkout attempts on staging with null discount_code → 0 errors.
Rollback plan: Revert to v2.3.0 tag (5-minute deploy, no DB rollback needed).`,
}
