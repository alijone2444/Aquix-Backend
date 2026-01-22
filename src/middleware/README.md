# Middleware Examples

## Authentication

### Basic Authentication
```javascript
const { authenticate } = require('../middleware/auth');

router.get('/protected', authenticate, (req, res) => {
  // req.user is available
  res.json({ user: req.user });
});
```

## Authorization

### Permission-Based Authorization
```javascript
const { authorize } = require('../middleware/authorize');

// User must have 'create' permission on 'user' resource
router.post('/users', authenticate, authorize('create', 'user'), handler);

// User must have 'read' permission on 'company' resource
router.get('/companies', authenticate, authorize('read', 'company'), handler);
```

### Role-Based Authorization
```javascript
const { requireRole } = require('../middleware/authorize');

// Only superadmin
router.delete('/users/:id', authenticate, requireRole('superadmin'), handler);

// Admin or superadmin
router.get('/admin', authenticate, requireRole(['admin', 'superadmin']), handler);
```

### Combined Authorization
```javascript
// Must be superadmin AND have assign-role permission
router.post('/assign-role', 
  authenticate, 
  requireRole('superadmin'),
  authorize('assign-role', 'user'),
  handler
);
```

### Convenience Middleware
```javascript
const { canApproveSeller, canCreateAdmin } = require('../middleware/authorize');

// Approve seller
router.post('/sellers/:id/approve', authenticate, canApproveSeller, handler);

// Create admin (also check role)
router.post('/admins', 
  authenticate, 
  requireRole('superadmin'),
  canCreateAdmin,
  handler
);
```

## Available Permissions

- `user:create`, `user:read`, `user:update`, `user:delete`, `user:approve`, `user:assign-role`
- `company:create`, `company:read`, `company:update`, `company:delete`
- `query:create`, `query:read`, `query:update`, `query:delete`
- `constants:create`, `constants:read`, `constants:update`, `constants:delete`
- `user-input:create`, `user-input:read`, `user-input:update`, `user-input:delete`
- `role:create`, `role:read`, `role:update`, `role:delete`, `role:assign-permission`
- `seller:approve`

