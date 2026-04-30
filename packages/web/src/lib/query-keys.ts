export const qk = {
  inventory: (userId: string | null | undefined) => ["inventory", userId] as const,
  adminUsers: () => ["admin", "users"] as const,
  adminUserInventory: (targetUserId: string) => ["admin", "user-inventory", targetUserId] as const,
  adminPendingInventory: () => ["admin", "pending-inventory"] as const,
  availability: (userId: string | null | undefined) => ["availability", userId] as const,
  availabilityCounts: () => ["availability", "counts"] as const,
  calendarLocks: () => ["calendar", "locks"] as const,
  availableGames: (date: string | null) => ["calendar", "games", date] as const,
  adminUserAvailability: (targetUserId: string) =>
    ["admin", "user-availability", targetUserId] as const,
  adminAggregateAvailability: () => ["admin", "availability", "all"] as const,
} as const;
