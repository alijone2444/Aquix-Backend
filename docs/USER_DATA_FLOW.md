# User Data Flow & Database Architecture

## Overview

This document explains how user registration, authentication, and related data flows through the system, including all database tables and their relationships.

---

## Database Tables Overview

### Core Tables

1. **users** - Main user accounts table
2. **roles** - System roles (superadmin, admin, seller, investor)
3. **permissions** - Available permissions (e.g., user:create, company:read)
4. **user_roles** - Many-to-many relationship between users and roles
5. **role_permissions** - Many-to-many relationship between roles and permissions
6. **otps** - Email verification OTP codes
7. **company_profiles** - Company profile information for investors/sellers

---

## Complete User Registration & Onboarding Flow

### Step 1: User Signup

**Endpoint:** `POST /api/auth/signup`

**Process:**
1. User submits signup form with:
   - `fullName` (e.g., "Ali Jone")
   - `email` (e.g., "alijone2333@gmail.com")
   - `password` (hashed with bcrypt)
   - `company` (e.g., "alijone")
   - `userType` (e.g., "seller", "investor", "admin", "superadmin")

2. **Database Operations:**
   ```
   INSERT INTO users (
     id (UUID, auto-generated),
     full_name,
     email,
     password_hash (bcrypt hashed),
     company,
     is_active = FALSE  ← Account starts as INACTIVE
   )
   ```

3. **Role Assignment:**
   ```
   INSERT INTO user_roles (
     user_id (references users.id),
     role_id (references roles.id based on userType)
   )
   ```
   - System looks up role by name (seller, investor, etc.)
   - Links user to appropriate role

4. **OTP Generation & Email:**
   ```
   INSERT INTO otps (
     user_id (references users.id),
     email,
     otp_code (6-digit random number),
     expires_at (10 minutes from now),
     is_verified = FALSE
   )
   ```
   - 6-digit OTP generated
   - OTP sent to user's email via nodemailer
   - OTP expires in 10 minutes

**Result:**
- User account created but **INACTIVE** (`is_active = false`)
- User cannot login yet
- OTP email sent to user

---

### Step 2: Email Verification (OTP)

**Endpoint:** `POST /api/auth/verify-otp`

**Process:**
1. User submits:
   - `email`
   - `otp` (6-digit code from email)

2. **Database Operations:**
   ```
   SELECT FROM otps WHERE 
     email = user_email AND
     otp_code = submitted_otp AND
     is_verified = FALSE AND
     expires_at > NOW()
   ```

3. **If OTP Valid:**
   ```
   UPDATE otps SET 
     is_verified = TRUE,
     verified_at = NOW()
   WHERE id = otp_id

   UPDATE users SET 
     is_active = TRUE  ← Account ACTIVATED
   WHERE id = user_id
   ```

4. **JWT Token Generated:**
   - Token includes: `userId`, `email`
   - Expires in 7 days
   - Returned to frontend

**Result:**
- User account **ACTIVATED** (`is_active = true`)
- User can now login
- JWT token provided for authenticated requests

---

### Step 3: Login

**Endpoint:** `POST /api/auth/login`

**Process:**
1. User submits `email` and `password`

2. **Database Query:**
   ```
   SELECT users.*, 
          roles (aggregated),
          permissions (aggregated)
   FROM users
   LEFT JOIN user_roles ON users.id = user_roles.user_id
   LEFT JOIN roles ON user_roles.role_id = roles.id
   LEFT JOIN role_permissions ON roles.id = role_permissions.role_id
   LEFT JOIN permissions ON role_permissions.permission_id = permissions.id
   WHERE users.email = submitted_email
   ```

3. **Validation:**
   - Check if user exists
   - Verify password (bcrypt compare)
   - Check `is_active = true` (must be verified)

4. **Response:**
   - User data with roles and permissions
   - JWT token

**Result:**
- User authenticated
- Token for subsequent requests

---

### Step 4: Company Profile Creation (Investor/Seller Only)

**Endpoint:** `POST /api/auth/company-profile`

**Prerequisites:**
- User must be authenticated (JWT token)
- User must have role: `investor` OR `seller`

**Process:**
1. User submits company profile form with all fields:
   - Personal & Contact Information
   - Company Information
   - Financial Overview
   - Ownership & Readiness
   - Compliance & Consent

2. **Database Operations:**
   ```
   INSERT INTO company_profiles (
     user_id (references users.id),
     
     -- Step 1: Personal & Contact
     full_name,
     position,
     founder_managing_director,
     business_email,
     company_name,
     country,
     phone,
     city,
     
     -- Step 2: Company Info
     year_founded,
     legal_form,
     industry_sector,
     number_of_employees,
     
     -- Step 3: Financial
     annual_revenue,
     ebit,
     current_year_estimate,
     currency,
     customer_concentration_percent,
     growth_trend,
     
     -- Step 4: Ownership
     ownership_structure,
     founder_shares_percent,
     succession_planned,
     current_advisors,
     interested_in_sale,
     
     -- Step 5: Compliance
     data_upload_url,
     nda_consent,
     gdpr_consent,
     
     is_verified = FALSE  ← Profile starts as UNVERIFIED
   )
   ```

3. **If Profile Already Exists:**
   - Updates existing profile
   - Resets `is_verified = false` (requires re-verification)

**Result:**
- Company profile created/updated
- Profile status: **UNVERIFIED** (`is_verified = false`)
- User can view but profile not yet approved

---

### Step 5: Superadmin Verification

**Endpoint:** `PUT /api/auth/company-profile/verify/:id`

**Prerequisites:**
- User must be authenticated
- User must have role: `superadmin`

**Process:**
1. Superadmin reviews company profile
2. Superadmin submits verification request:
   ```json
   {
     "verified": true
   }
   ```

3. **Database Operations:**
   ```
   UPDATE company_profiles SET 
     is_verified = TRUE,
     verified_by = superadmin_user_id,
     verified_at = NOW()
   WHERE id = profile_id
   ```

**Result:**
- Company profile **VERIFIED**
- Profile visible/usable in system
- Verification tracked with admin ID and timestamp

---

## Data Relationships Diagram

```
┌─────────────┐
│   users     │
│─────────────│
│ id (UUID)   │◄─────┐
│ full_name   │      │
│ email       │      │
│ password    │      │
│ company     │      │
│ is_active   │      │
└─────────────┘      │
                     │
        ┌────────────┴────────────┐
        │                         │
        │                         │
┌───────▼────────┐      ┌─────────▼──────────┐
│  user_roles   │      │      otps         │
│───────────────│      │────────────────────│
│ user_id (FK)  │      │ user_id (FK)       │
│ role_id (FK)  │      │ email              │
└───────┬────────┘      │ otp_code          │
        │               │ expires_at        │
        │               │ is_verified       │
        │               └────────────────────┘
        │
┌───────▼────────┐
│    roles       │
│───────────────│
│ id (UUID)      │◄─────┐
│ name           │      │
│ description    │      │
│ is_system_role │      │
└───────┬────────┘      │
        │               │
        │      ┌────────┴──────────┐
        │      │                   │
┌───────▼───────▼──┐    ┌───────────▼──────────┐
│ role_permissions│    │  company_profiles    │
│─────────────────│    │──────────────────────│
│ role_id (FK)    │    │ user_id (FK)         │
│ permission_id   │    │ company_name         │
└───────┬──────────┘    │ (all profile fields) │
        │               │ is_verified          │
        │               │ verified_by (FK)     │
┌───────▼────────┐      │ verified_at          │
│  permissions   │      └──────────────────────┘
│────────────────│
│ id (UUID)      │
│ name           │
│ resource       │
│ action         │
└────────────────┘
```

---

## User States & Status Flow

### User Account States

```
┌──────────────┐
│  SIGNUP      │ → User registers → Account created
│  (INACTIVE)  │   is_active = FALSE
└──────┬───────┘
       │
       │ OTP Verification
       ▼
┌──────────────┐
│  VERIFIED    │ → OTP verified → Account activated
│  (ACTIVE)    │   is_active = TRUE
└──────┬───────┘
       │
       │ Login
       ▼
┌──────────────┐
│  AUTHENTICATED│ → JWT token issued
│  (LOGGED IN) │
└──────┬───────┘
       │
       │ Create Profile (Investor/Seller)
       ▼
┌──────────────┐
│ PROFILE CREATED│ → Company profile created
│ (UNVERIFIED) │   is_verified = FALSE
└──────┬───────┘
       │
       │ Superadmin Verification
       ▼
┌──────────────┐
│ PROFILE      │ → Profile verified
│ VERIFIED     │   is_verified = TRUE
└──────────────┘
```

---

## Permission System Flow

### How Permissions Work

1. **Roles have Permissions:**
   ```
   roles → role_permissions → permissions
   ```

2. **Users have Roles:**
   ```
   users → user_roles → roles
   ```

3. **User's Effective Permissions:**
   ```
   User → All Roles → All Permissions from those Roles
   ```

### Example: Seller User

```
User: "Ali Jone"
  └─ Role: "seller"
      └─ Permissions:
          - company:read
          - query:read
          - constants:read
          - user-input:create
          - user-input:read
          - user-input:update
```

### Example: Superadmin User

```
User: "Admin User"
  └─ Role: "superadmin"
      └─ Permissions: ALL (every permission in system)
```

---

## Complete Data Flow Example

### Scenario: New Seller Registration

**Step 1: Signup**
```
Frontend → POST /api/auth/signup
  {
    fullName: "Ali Jone",
    email: "alijone2333@gmail.com",
    password: "123456789",
    company: "alijone",
    userType: "seller"
  }

Backend:
  1. Create user in `users` table (is_active = false)
  2. Assign "seller" role in `user_roles` table
  3. Generate OTP, save in `otps` table
  4. Send OTP email

Response:
  {
    message: "User created. Please verify email.",
    user: { id, email, isActive: false },
    requiresVerification: true
  }
```

**Step 2: Verify OTP**
```
Frontend → POST /api/auth/verify-otp
  {
    email: "alijone2333@gmail.com",
    otp: "123456"
  }

Backend:
  1. Validate OTP in `otps` table
  2. Mark OTP as verified
  3. Update user: is_active = true
  4. Generate JWT token

Response:
  {
    message: "Email verified. Account activated.",
    user: { id, email, isActive: true, roles, permissions },
    token: "jwt-token-here"
  }
```

**Step 3: Login**
```
Frontend → POST /api/auth/login
  {
    email: "alijone2333@gmail.com",
    password: "123456789"
  }

Backend:
  1. Verify credentials
  2. Check is_active = true
  3. Load user with roles and permissions

Response:
  {
    user: { id, email, roles, permissions },
    token: "jwt-token-here"
  }
```

**Step 4: Create Company Profile**
```
Frontend → POST /api/auth/company-profile
  Authorization: Bearer <token>
  {
    companyName: "Bauer Maschinenbau GmbH",
    fullName: "Michael Bauer",
    country: "Germany",
    // ... all other fields
  }

Backend:
  1. Verify authentication
  2. Check user role (seller/investor)
  3. Create/update in `company_profiles` table
  4. Set is_verified = false

Response:
  {
    message: "Company profile created. Awaiting verification.",
    profile: { ...all fields, isVerified: false }
  }
```

**Step 5: Superadmin Verifies Profile**
```
Frontend → PUT /api/auth/company-profile/verify/:profile_id
  Authorization: Bearer <superadmin-token>
  {
    verified: true
  }

Backend:
  1. Verify superadmin role
  2. Update company_profiles: is_verified = true
  3. Record verified_by and verified_at

Response:
  {
    message: "Company profile verified successfully",
    profile: { ...all fields, isVerified: true }
  }
```

---

## Key Database Constraints

### Foreign Keys
- `user_roles.user_id` → `users.id` (CASCADE DELETE)
- `user_roles.role_id` → `roles.id` (CASCADE DELETE)
- `role_permissions.role_id` → `roles.id` (CASCADE DELETE)
- `role_permissions.permission_id` → `permissions.id` (CASCADE DELETE)
- `otps.user_id` → `users.id` (CASCADE DELETE)
- `company_profiles.user_id` → `users.id` (CASCADE DELETE)
- `company_profiles.verified_by` → `users.id` (NULL allowed)

### Unique Constraints
- `users.email` - Unique (one account per email)
- `roles.name` - Unique (one role per name)
- `permissions.name` - Unique (one permission per name)
- `user_roles(user_id, role_id)` - Unique (user can't have same role twice)
- `role_permissions(role_id, permission_id)` - Unique (role can't have same permission twice)

### Default Values
- `users.is_active` = `false` (must verify email)
- `company_profiles.is_verified` = `false` (must be verified by superadmin)
- `otps.is_verified` = `false` (OTP not yet used)
- `otps.expires_at` = NOW() + 10 minutes

---

## Security Features

1. **Password Security:**
   - Passwords hashed with bcrypt (10 salt rounds)
   - Never stored in plain text

2. **Email Verification:**
   - OTP required before account activation
   - OTP expires in 10 minutes
   - One-time use (marked as verified after use)

3. **Role-Based Access:**
   - Users can only access routes based on their roles
   - Permissions checked via CASL middleware

4. **Profile Verification:**
   - Company profiles require superadmin approval
   - Verification tracked with admin ID and timestamp

5. **JWT Authentication:**
   - Tokens expire in 7 days
   - User data loaded from database on each request
   - Permissions refreshed on each authentication

---

## Summary

**User Journey:**
1. Signup → Account created (inactive)
2. Verify OTP → Account activated
3. Login → Get JWT token
4. Create Profile → Profile saved (unverified)
5. Superadmin Verifies → Profile approved

**Data Storage:**
- User account → `users` table
- Role assignment → `user_roles` table
- Permissions → Inherited from roles via `role_permissions`
- OTP codes → `otps` table (temporary, expires)
- Company data → `company_profiles` table

**Status Tracking:**
- Account status: `users.is_active`
- Profile status: `company_profiles.is_verified`
- OTP status: `otps.is_verified`

This architecture ensures secure, traceable, and scalable user management with proper role-based access control and verification workflows.

