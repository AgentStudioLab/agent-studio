# Paid Feature Auth Integration Note

Paid feature entry points are not present in the current desktop codebase. New paid features must call `ensurePaidFeatureAccess` before invoking the feature and must use a stable `idempotencyKey` for retryable operations.
