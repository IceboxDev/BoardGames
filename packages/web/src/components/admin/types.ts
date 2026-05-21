/**
 * Shape returned by `authClient.admin.listUsers()` after the call-site cast.
 * Lives here so every admin sub-component imports it from one place — the
 * Better-Auth client doesn't expose this row shape in its inferred types
 * (the custom-fields plugin omits `role` / `onlineEnabled` / `internal` /
 * `guest`), so we narrow at the boundary in AdminPage and use this type from
 * there down.
 */
export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  onlineEnabled?: boolean | null;
  internal?: boolean | null;
  guest?: boolean | null;
  createdAt: string | Date;
};
