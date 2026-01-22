const { AbilityBuilder, Ability } = require('@casl/ability');

/**
 * Define abilities based on user permissions
 */
function defineAbilitiesFor(user) {
  const { can, cannot, build } = new AbilityBuilder(Ability);

  // If user has no permissions, they can't do anything
  if (!user || !user.permissions || user.permissions.length === 0) {
    return build();
  }

  // Build permissions from user's permission list
  user.permissions.forEach(permission => {
    // Permission can be in format "resource:action" (e.g., "user:create")
    // Or we can use the resource and action fields directly
    let resource, action;
    
    if (permission.resource && permission.action) {
      // Use resource and action fields directly (preferred)
      resource = permission.resource;
      action = permission.action;
    } else if (permission.name) {
      // Fallback to parsing name field
      const parts = permission.name.split(':');
      if (parts.length === 2) {
        resource = parts[0];
        action = parts[1];
      }
    }
    
    if (resource && action) {
      can(action, resource);
    }
  });

  return build();
}

/**
 * Authorization middleware factory
 * Creates middleware that checks if user can perform an action on a resource
 * 
 * Usage: authorize('create', 'user') or authorize('read', 'company')
 */
const authorize = (action, resource) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ability = defineAbilitiesFor(req.user);

    if (ability.can(action, resource)) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Forbidden', 
      message: `You don't have permission to ${action} ${resource}` 
    });
  };
};

/**
 * Check if user has a specific role
 * 
 * Usage: requireRole('admin') or requireRole(['admin', 'superadmin'])
 */
const requireRole = (roleNames) => {
  const roles = Array.isArray(roleNames) ? roleNames : [roleNames];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRoleNames = req.user.roles.map(role => role.name);
    const hasRole = roles.some(role => userRoleNames.includes(role));

    if (hasRole) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Forbidden', 
      message: `Required role: ${roles.join(' or ')}` 
    });
  };
};

/**
 * Convenience middleware functions for common permissions
 */
const canApproveSeller = authorize('approve', 'seller');
const canCreateAdmin = authorize('create', 'user'); // Combined with requireRole('superadmin')
const canManageRoles = authorize('create', 'role');
const canAssignRole = authorize('assign-role', 'user');

module.exports = {
  authorize,
  requireRole,
  defineAbilitiesFor,
  canApproveSeller,
  canCreateAdmin,
  canManageRoles,
  canAssignRole
};

