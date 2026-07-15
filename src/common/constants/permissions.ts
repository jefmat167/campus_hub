export const AdminPermissions = {
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  DASHBOARD_READ: 'dashboard:read',
  MARKETPLACE_READ: 'marketplace:read',
  MARKETPLACE_MANAGE: 'marketplace:manage',
  WALLET_READ: 'wallet:read',
  WALLET_MANAGE: 'wallet:manage',
  ESCROW_READ: 'escrow:read',
  ESCROW_MANAGE: 'escrow:manage',
  HOUSING_READ: 'housing:read',
  HOUSING_MANAGE: 'housing:manage',
  SOCIAL_READ: 'social:read',
  SOCIAL_MANAGE: 'social:manage',
  MODERATION_READ: 'moderation:read',
  MODERATION_MANAGE: 'moderation:manage',
  UNIVERSITIES_READ: 'universities:read',
  UNIVERSITIES_MANAGE: 'universities:manage',
  NEWS_READ: 'news:read',
  NEWS_MANAGE: 'news:manage',
  VERIFICATION_READ: 'verification:read',
  VERIFICATION_MANAGE: 'verification:manage',
} as const;

export type AdminPermissionType =
  (typeof AdminPermissions)[keyof typeof AdminPermissions];

export const ALL_PERMISSIONS = Object.values(AdminPermissions);

/** Human-readable descriptions for admin UI */
export const PERMISSION_DESCRIPTIONS: Record<AdminPermissionType, string> = {
  'users:read': 'View user list and user details',
  'users:manage': 'Force logout, adjust verification tier',
  'dashboard:read': 'View audit logs and dashboard statistics',
  'marketplace:read': 'View all marketplace listings',
  'marketplace:manage': 'Take down marketplace listings',
  'wallet:read': 'View wallet transactions and withdrawals',
  'wallet:manage': 'Manual wallet credit/debit adjustments',
  'escrow:read': 'View escrow transactions and disputes',
  'escrow:manage': 'Resolve escrow disputes',
  'housing:read': 'View reported housing listings',
  'housing:manage': 'Dismiss reports, take down housing listings',
  'social:read': 'View all posts (reveals author)',
  'social:manage': 'Hide/unhide posts, delete comments',
  'moderation:read': 'View reports, warnings, moderation queue, appeals',
  'moderation:manage': 'Review reports, ban/unban users, issue warnings, review appeals',
  'universities:read': 'View university/faculty/department details',
  'universities:manage': 'Create, update, deactivate universities/faculties/departments',
  'news:read': 'View all articles including drafts',
  'news:manage': 'Create, edit, delete, publish/unpublish articles',
  'verification:read': 'View pending verification requests',
  'verification:manage': 'Approve or reject verification requests',
};
