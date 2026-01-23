# Quick Reference: User Data Flow

## 🎯 User Registration Flow (5 Steps)

```
1. SIGNUP
   ↓
   User submits: fullName, email, password, company, userType
   ↓
   Database: users table (is_active = FALSE)
   Database: user_roles table (assigns role)
   Database: otps table (generates 6-digit code)
   ↓
   Email: OTP sent to user

2. VERIFY OTP
   ↓
   User submits: email, otp
   ↓
   Database: otps table (mark as verified)
   Database: users table (is_active = TRUE)
   ↓
   Response: JWT token issued

3. LOGIN
   ↓
   User submits: email, password
   ↓
   Database: Load user + roles + permissions
   ↓
   Response: JWT token + user data

4. CREATE COMPANY PROFILE (Investor/Seller only)
   ↓
   User submits: All company profile fields
   ↓
   Database: company_profiles table (is_verified = FALSE)
   ↓
   Response: Profile created, awaiting verification

5. SUPERADMIN VERIFIES
   ↓
   Superadmin submits: verified = true
   ↓
   Database: company_profiles table (is_verified = TRUE)
   ↓
   Response: Profile verified
```

---

## 📊 Database Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **users** | User accounts | id, email, password_hash, is_active |
| **roles** | System roles | id, name (superadmin, admin, seller, investor) |
| **permissions** | Available permissions | id, name, resource, action |
| **user_roles** | User ↔ Role mapping | user_id, role_id |
| **role_permissions** | Role ↔ Permission mapping | role_id, permission_id |
| **otps** | Email verification codes | user_id, otp_code, expires_at, is_verified |
| **company_profiles** | Company information | user_id, company_name, is_verified, verified_by |

---

## 🔐 Status Flags

| Flag | Table | Default | When Changed |
|------|-------|---------|--------------|
| `is_active` | users | `false` | Set to `true` after OTP verification |
| `is_verified` | otps | `false` | Set to `true` when OTP is used |
| `is_verified` | company_profiles | `false` | Set to `true` by superadmin |

---

## 🛣️ API Endpoints

| Endpoint | Method | Auth | Role | Purpose |
|----------|--------|------|------|---------|
| `/api/auth/signup` | POST | ❌ | - | Create user account |
| `/api/auth/verify-otp` | POST | ❌ | - | Verify email & activate account |
| `/api/auth/resend-otp` | POST | ❌ | - | Resend OTP email |
| `/api/auth/login` | POST | ❌ | - | Login & get token |
| `/api/auth/me` | GET | ✅ | - | Get current user |
| `/api/auth/company-profile` | POST | ✅ | investor/seller | Create/update profile |
| `/api/auth/company-profile` | GET | ✅ | investor/seller | Get own profile |
| `/api/auth/company-profile/verify/:id` | PUT | ✅ | superadmin | Verify profile |

---

## 🔄 Data Relationships

```
users (1) ──→ (many) user_roles ──→ (1) roles
                                              │
                                              ↓
                                    role_permissions
                                              │
                                              ↓
                                         permissions

users (1) ──→ (many) otps
users (1) ──→ (1) company_profiles ──→ (1) users (verified_by)
```

---

## ✅ User States

| State | is_active | Can Login? | Can Create Profile? |
|-------|-----------|------------|---------------------|
| **Signed Up** | `false` | ❌ | ❌ |
| **Email Verified** | `true` | ✅ | ✅ |
| **Profile Created** | `true` | ✅ | ✅ (update) |
| **Profile Verified** | `true` | ✅ | ✅ |

---

## 🎭 Role Permissions Summary

| Role | Key Permissions |
|------|----------------|
| **superadmin** | ALL permissions (full access) |
| **admin** | Manage users, companies, queries, constants (no role management) |
| **seller** | Create/read/update user-inputs, read companies/queries/constants |
| **investor** | Read-only access to companies, queries, constants, user-inputs |

---

## 📝 Key Points for Team

1. **Account Activation:** Users must verify email (OTP) before they can login
2. **Profile Verification:** Company profiles require superadmin approval
3. **Role-Based Access:** All routes protected by roles and permissions
4. **Data Security:** Passwords hashed, OTPs expire, verification tracked
5. **One Profile Per User:** Each user can have only one company profile (updates if exists)

---

## 🚀 Quick Start Flow

```
New User → Signup → Verify OTP → Login → Create Profile → Superadmin Verifies → Done!
```

