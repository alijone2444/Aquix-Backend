-- ============================================
-- RBAC Seed Data
-- ============================================

-- Insert initial roles
INSERT INTO roles (id, name, description, is_system_role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'superadmin', 'Super Administrator with full system access', true),
  ('00000000-0000-0000-0000-000000000002', 'admin', 'Administrator with management capabilities', true),
  ('00000000-0000-0000-0000-000000000003', 'seller', 'Seller role for company sellers', true),
  ('00000000-0000-0000-0000-000000000004', 'investor', 'Investor role for investors', true)
ON CONFLICT (name) DO NOTHING;

-- Insert permissions
-- User management permissions
INSERT INTO permissions (id, name, resource, action, description) VALUES
  ('10000000-0000-0000-0000-000000000001', 'user:create', 'user', 'create', 'Create new users'),
  ('10000000-0000-0000-0000-000000000002', 'user:read', 'user', 'read', 'View users'),
  ('10000000-0000-0000-0000-000000000003', 'user:update', 'user', 'update', 'Update user information'),
  ('10000000-0000-0000-0000-000000000004', 'user:delete', 'user', 'delete', 'Delete users'),
  ('10000000-0000-0000-0000-000000000005', 'user:approve', 'user', 'approve', 'Approve user accounts'),
  ('10000000-0000-0000-0000-000000000006', 'user:assign-role', 'user', 'assign-role', 'Assign roles to users'),

  -- Company management permissions
  ('10000000-0000-0000-0000-000000000011', 'company:create', 'company', 'create', 'Create companies'),
  ('10000000-0000-0000-0000-000000000012', 'company:read', 'company', 'read', 'View companies'),
  ('10000000-0000-0000-0000-000000000013', 'company:update', 'company', 'update', 'Update company information'),
  ('10000000-0000-0000-0000-000000000014', 'company:delete', 'company', 'delete', 'Delete companies'),

  -- Query permissions
  ('10000000-0000-0000-0000-000000000021', 'query:create', 'query', 'create', 'Create queries'),
  ('10000000-0000-0000-0000-000000000022', 'query:read', 'query', 'read', 'View queries'),
  ('10000000-0000-0000-0000-000000000023', 'query:update', 'query', 'update', 'Update queries'),
  ('10000000-0000-0000-0000-000000000024', 'query:delete', 'query', 'delete', 'Delete queries'),

  -- Constants management permissions
  ('10000000-0000-0000-0000-000000000031', 'constants:create', 'constants', 'create', 'Create constants'),
  ('10000000-0000-0000-0000-000000000032', 'constants:read', 'constants', 'read', 'View constants'),
  ('10000000-0000-0000-0000-000000000033', 'constants:update', 'constants', 'update', 'Update constants'),
  ('10000000-0000-0000-0000-000000000034', 'constants:delete', 'constants', 'delete', 'Delete constants'),

  -- User input permissions
  ('10000000-0000-0000-0000-000000000041', 'user-input:create', 'user-input', 'create', 'Create user inputs'),
  ('10000000-0000-0000-0000-000000000042', 'user-input:read', 'user-input', 'read', 'View user inputs'),
  ('10000000-0000-0000-0000-000000000043', 'user-input:update', 'user-input', 'update', 'Update user inputs'),
  ('10000000-0000-0000-0000-000000000044', 'user-input:delete', 'user-input', 'delete', 'Delete user inputs'),

  -- Role management permissions
  ('10000000-0000-0000-0000-000000000051', 'role:create', 'role', 'create', 'Create roles'),
  ('10000000-0000-0000-0000-000000000052', 'role:read', 'role', 'read', 'View roles'),
  ('10000000-0000-0000-0000-000000000053', 'role:update', 'role', 'update', 'Update roles'),
  ('10000000-0000-0000-0000-000000000054', 'role:delete', 'role', 'delete', 'Delete roles'),
  ('10000000-0000-0000-0000-000000000055', 'role:assign-permission', 'role', 'assign-permission', 'Assign permissions to roles'),

  -- Seller approval permission
  ('10000000-0000-0000-0000-000000000061', 'seller:approve', 'seller', 'approve', 'Approve seller accounts')
ON CONFLICT (name) DO NOTHING;

-- Assign ALL permissions to superadmin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid as role_id,
  id as permission_id
FROM permissions
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign basic permissions to admin role (can manage users, companies, queries, but not roles)
INSERT INTO role_permissions (role_id, permission_id) VALUES
  -- User management (except assign-role, which is superadmin only)
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005'),
  -- Company management
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000013'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000014'),
  -- Query management
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000023'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000024'),
  -- Constants management
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000031'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000032'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000033'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000034'),
  -- User input management
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000044'),
  -- Seller approval
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000061')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign read permissions to seller role
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000012'), -- company:read
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000022'), -- query:read
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000032'), -- constants:read
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000041'), -- user-input:create
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000042'), -- user-input:read
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000043')  -- user-input:update
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign read permissions to investor role
INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000012'), -- company:read
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000022'), -- query:read
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000032'), -- constants:read
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000042')  -- user-input:read
ON CONFLICT (role_id, permission_id) DO NOTHING;

