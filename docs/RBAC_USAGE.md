# RBAC (Role-Based Access Control) System

This document explains how to use the RBAC system in the Aquix backend.

## Setup

### 1. Initialize Database Schema

The RBAC schema is included in the main schema. Run:

```bash
npm run db:init
```

### 2. Seed RBAC Data

Seed initial roles and permissions:

```bash
npm run db:seed:rbac
```

This creates:
- **superadmin**: Full system access (all permissions)
- **admin**: Management capabilities (can manage users, companies, queries, constants, but not roles)
- **seller**: Can create/read/update user inputs, read companies/queries/constants
- **investor**: Read-only access to companies, queries, constants, user inputs

## Environment Variables

Add to your `.env` file:

```env
JWT_SECRET=your-secret-key-change-in-production
```

**Important**: Change the JWT secret in production!

## API Endpoints

### Authentication

#### Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "fullName": "Ali Jone",
  "email": "alijone2333@gmail.com",
  "password": "123456789",
  "company": "alijone",
  "role": "seller"
}
```

Response:
```json
{
  "message": "User created successfully",
  "user": {
    "id": "uuid",
    "fullName": "Ali Jone",
    "email": "alijone2333@gmail.com",
    "company": "alijone",
    "role": "seller"
  },
  "token": "jwt-token"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "alijone2333@gmail.com",
  "password": "123456789"
}
```

Response:
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "fullName": "Ali Jone",
    "email": "alijone2333@gmail.com",
    "company": "alijone",
    "roles": [...],
    "permissions": [...]
  },
  "token": "jwt-token"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Assign Role (Superadmin/Admin only)
```http
POST /api/auth/assign-role
Authorization: Bearer <token>
Content-Type: application/json

{
  "userId": "user-uuid",
  "roleId": "role-uuid"
}
```

## Using Middleware

### Authentication Middleware

Protect routes that require authentication:

```javascript
const { authenticate } = require('./middleware/auth');

router.get('/protected', authenticate, (req, res) => {
  // req.user is available here
  res.json({ user: req.user });
});
```

### Authorization Middleware

#### Check Permissions

```javascript
const { authorize } = require('./middleware/authorize');

// Check if user can create users
router.post('/users', authenticate, authorize('create', 'user'), (req, res) => {
  // User has 'user:create' permission
});

// Check if user can read companies
router.get('/companies', authenticate, authorize('read', 'company'), (req, res) => {
  // User has 'company:read' permission
});
```

#### Check Roles

```javascript
const { requireRole } = require('./middleware/authorize');

// Require superadmin role
router.delete('/users/:id', authenticate, requireRole('superadmin'), (req, res) => {
  // Only superadmin can access
});

// Require one of multiple roles
router.get('/admin', authenticate, requireRole(['admin', 'superadmin']), (req, res) => {
  // Admin or superadmin can access
});
```

#### Convenience Middleware

Pre-built middleware for common checks:

```javascript
const { 
  canApproveSeller, 
  canCreateAdmin, 
  canManageRoles,
  canAssignRole 
} = require('./middleware/authorize');

// Approve seller
router.post('/sellers/:id/approve', 
  authenticate, 
  canApproveSeller, 
  (req, res) => {
    // User can approve sellers
  }
);

// Create admin (also check role)
router.post('/admins', 
  authenticate, 
  requireRole('superadmin'),
  canCreateAdmin,
  (req, res) => {
    // Superadmin can create admins
  }
);
```

## Example: Protecting Existing Routes

### Example 1: Protect Constants Route

```javascript
const { authenticate, authorize } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');

// Read - requires authentication and read permission
router.get('/', authenticate, authorize('read', 'constants'), async (req, res) => {
  // ... existing code
});

// Create - requires authentication and create permission
router.post('/', authenticate, authorize('create', 'constants'), async (req, res) => {
  // ... existing code
});
```

### Example 2: Protect User Input Route

```javascript
// Read - requires authentication and read permission
router.get('/', authenticate, authorize('read', 'user-input'), async (req, res) => {
  // ... existing code
});

// Create - requires authentication and create permission
router.post('/', authenticate, authorize('create', 'user-input'), async (req, res) => {
  // ... existing code
});
```

## Permission Format

Permissions follow the format: `resource:action`

Examples:
- `user:create` - Create users
- `user:read` - Read users
- `user:update` - Update users
- `user:delete` - Delete users
- `user:approve` - Approve users
- `user:assign-role` - Assign roles to users
- `company:create` - Create companies
- `company:read` - Read companies
- `seller:approve` - Approve sellers
- `role:create` - Create roles
- `role:assign-permission` - Assign permissions to roles

## Adding New Permissions

1. Add permission to `src/db/rbac_seed.sql`:
```sql
INSERT INTO permissions (id, name, resource, action, description) VALUES
  ('new-uuid', 'new-resource:new-action', 'new-resource', 'new-action', 'Description')
ON CONFLICT (name) DO NOTHING;
```

2. Assign to roles as needed in the seed file

3. Run seed script again (it's idempotent):
```bash
npm run db:seed:rbac
```

## Database Schema

### Tables

- **users**: User accounts
- **roles**: System and custom roles
- **permissions**: Available permissions
- **user_roles**: Many-to-many relationship between users and roles
- **role_permissions**: Many-to-many relationship between roles and permissions

### Key Features

- UUIDs for all primary keys
- Foreign key constraints with CASCADE deletes
- System roles cannot be deleted (`is_system_role = true`)
- Users can have multiple roles
- Roles can have multiple permissions
- Automatic timestamp tracking

## Best Practices

1. **Always use authentication middleware** for protected routes
2. **Use permission checks** for fine-grained access control
3. **Use role checks** for broad access control (e.g., admin-only areas)
4. **Combine both** when needed (e.g., `requireRole('superadmin')` + `authorize('assign-role', 'user')`)
5. **Keep permissions granular** - it's easier to combine permissions than to split them later

## Troubleshooting

### "No token provided"
- Make sure you're sending the token in the Authorization header: `Authorization: Bearer <token>`

### "Forbidden" errors
- Check if the user has the required permission or role
- Verify the permission name matches exactly (case-sensitive)
- Check if the user's account is active (`is_active = true`)

### "Role not found" during signup
- Make sure you've run `npm run db:seed:rbac` to create initial roles

