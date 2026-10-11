Account data isolation

Browser collections and settings are scoped by authenticated user and authorized organization. Cloud collections no longer fall back to unowned local rows while organization loading is disabled. Organization settings default to the selected database organization rather than the historical company defaults. Legacy unowned browser values are retained but neither rendered nor offered for automatic import.

Auth identity changes clear query caches and remount organization state. Collection query keys include user identity. Organization loading clears previous membership data, gates children until ready, and remounts document forms on organization changes. Disabled cloud/local mutations reject writes.

Validation: TypeScript, production build, scoped storage regression harness covering A/B account and organization transitions, unavailable-cloud fallback, disabled writes, and legacy preservation. A live Supabase test used three temporary users and two temporary organizations: own customers readable, foreign customers hidden and unmodifiable, invited member sees only the authorized organization. All synthetic records/users were removed. This is not an exhaustive authorization audit; the reported account membership awaits its email/organization details.

Existing unowned local-only preferences are intentionally not assigned to whichever user logs in next. No original customer/invoice records were deleted or reassigned.
