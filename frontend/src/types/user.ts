export type ApiCurrentUser = Readonly<{
  user_id: string;
  email: string;
}>;

export type UserProfile = Readonly<{
  username: string;
  email: string;
}>;

export const DEV_FALLBACK_USER: UserProfile = {
  username: "Local User",
  email: "local@example.local",
};

export function toUserProfile(user: ApiCurrentUser): UserProfile {
  const username = user.user_id.trim() || user.email.trim() || "User";
  const email = user.email.trim() || user.user_id.trim() || "user@example.local";

  return {
    username,
    email,
  };
}
