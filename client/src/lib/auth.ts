// Google OAuth configuration
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  provider: "email" | "google";
}

// localStorage keys
const AUTH_KEYS = {
  USER: "auth_user",
  TOKEN: "auth_token",
  LAST_EMAIL: "auth_last_email",
};

export const authService = {
  // Sign up with email
  async signUpWithEmail(email: string, name?: string): Promise<AuthUser> {
    const user: AuthUser = {
      id: `user-${Date.now()}`,
      email,
      name: name || email.split("@")[0],
      provider: "email",
    };
    localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(AUTH_KEYS.LAST_EMAIL, email);
    return user;
  },

  // Sign in with email
  async signInWithEmail(email: string): Promise<AuthUser> {
    const user: AuthUser = {
      id: `user-${Date.now()}`,
      email,
      name: email.split("@")[0],
      provider: "email",
    };
    localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(AUTH_KEYS.LAST_EMAIL, email);
    return user;
  },

  // Sign in with Google (OAuth flow)
  async signInWithGoogle(): Promise<AuthUser | null> {
    if (!GOOGLE_CLIENT_ID) {
      console.warn("Google Client ID not configured");
      // For demo, create a mock Google user
      return {
        id: `google-${Date.now()}`,
        email: `user-${Date.now()}@gmail.com`,
        name: "Google User",
        provider: "google",
      };
    }

    // In production, implement full OAuth flow here
    // This is a placeholder for the real OAuth implementation
    try {
      // Call Google OAuth endpoint
      const redirectUri = `${window.location.origin}/auth/callback`;
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile`;
      window.location.href = authUrl;
      return null;
    } catch (error) {
      console.error("Google sign-in failed:", error);
      return null;
    }
  },

  // Sign out
  signOut(): void {
    localStorage.removeItem(AUTH_KEYS.USER);
    localStorage.removeItem(AUTH_KEYS.TOKEN);
  },

  // Get current user
  getCurrentUser(): AuthUser | null {
    const user = localStorage.getItem(AUTH_KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  // Get last email
  getLastEmail(): string | null {
    return localStorage.getItem(AUTH_KEYS.LAST_EMAIL);
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getCurrentUser();
  },
};
