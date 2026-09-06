// A row reference that carries its owner.
//
// Every write helper for user-owned rows (D&D characters, campaigns, files)
// takes one of these instead of a bare id, so the owning `user_id` cannot be
// left out of the statement: forgetting it is a compile error, not a
// cross-user write discovered in review. The helper binds BOTH fields in the
// WHERE clause and reports whether a row matched, so a foreign or unknown id
// is a no-op the caller can turn into a 404 rather than a silent overwrite.
//
// `userId` must be the authenticated session's id — never a value from the
// request body.

export interface OwnedRef {
  readonly id: string;
  readonly userId: string;
}
