# Security Specification: HONEY TOP UP Firestore Rules

## 1. Data Invariants
1. **Default Deny**: Any unmatched path is strictly denied (`allow read, write: if false;`).
2. **PII Isolation**: User profiles (`/users/{userId}`) contain phone numbers and wallet balances; reads and writes are restricted strictly to the authenticated owner (`resource.data.ownerUid == request.auth.uid`) or verified Admin (`isAdmin()`).
3. **Immutable Ownership & Timestamps**: `createdAt`, `ownerUid`, and `userId` cannot be altered after creation; `updatedAt` must equal `request.time`.
4. **Terminal State Locking**: Once a deposit is `approved` or `rejected`, or an order is `completed` or `cancelled`, non-admin users cannot mutate it.
5. **Privilege Escalation Prevention**: Users cannot self-assign `walletBalance`, `rank`, `totalSpend`, or write to `/admins/{uid}` or `/site_config/{configId}`.
6. **Admin Bootstrapping**: Admin access checks `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified admin email (`request.auth.token.email == 'sadmann.muzaahid@gmail.com' && request.auth.token.email_verified == true`).

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Write to `/site_config/main`**: `request.auth == null` attempting to change `themeMode` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on `/users/{userId}`**: Adding `isAdmin: true` in `create` -> `PERMISSION_DENIED` (`hasOnly` rejection).
3. **Wallet Balance Tampering**: Non-admin user updating `walletBalance: 999999` -> `PERMISSION_DENIED`.
4. **PII Scraping**: Signed-in non-owner listing `/users` without `ownerUid == request.auth.uid` -> `PERMISSION_DENIED`.
5. **Unverified Email Spoof**: User with `email: 'sadmann.muzaahid@gmail.com'` and `email_verified: false` -> `PERMISSION_DENIED`.
6. **ID Poisoning**: Document ID > 128 chars or containing invalid symbols `../hack` -> `PERMISSION_DENIED` (`isValidId`).
7. **Self-Approving Deposit**: User updating `/deposits/{id}` `status` from `pending` to `approved` -> `PERMISSION_DENIED`.
8. **Mutating Terminal Deposit**: Non-admin modifying an already `approved` deposit -> `PERMISSION_DENIED`.
9. **Orphan Order**: Creating an order with `ownerUid != request.auth.uid` -> `PERMISSION_DENIED`.
10. **Negative Amount Deposit**: Deposit payload with `amount: -500` -> `PERMISSION_DENIED`.
11. **Oversized String Denial-of-Wallet**: Package title > 100 chars -> `PERMISSION_DENIED`.
12. **Mutating Immortal `createdAt`**: Update changing `createdAt` -> `PERMISSION_DENIED`.
