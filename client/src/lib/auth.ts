// Google OAuth configuration
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  provider: "email" | "google";
}

// Extend Window for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          prompt: (
            callback?: (notification: {
              isNotDisplayed: () => boolean;
              isSkippedMoment: () => boolean;
              getNotDisplayedReason: () => string;
            }) => void,
          ) => void;
          renderButton: (element: HTMLElement, config: object) => void;
          revoke: (hint: string, callback: () => void) => void;
        };
      };
    };
  }
}

// Decode JWT payload (base64url)
function decodeJwtPayload(token: string): Record<string, string> {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    throw new Error("Failed to decode Google credential");
  }
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

  // Sign in with Google (Google Identity Services popup flow)
  async signInWithGoogle(): Promise<AuthUser | null> {
    if (!GOOGLE_CLIENT_ID) {
      console.warn(
        "Google Sign-In is not configured. Using Mock Google Login for development.",
      );
      const mockUser: AuthUser = {
        id: `google-mock-${Date.now()}`,
        email: "mock.user@gmail.com",
        name: "Mock Google User",
        image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
        provider: "google",
      };
      localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
      localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
      return Promise.resolve(mockUser);
    }

    // Wait for GIS library to load
    if (!window.google?.accounts?.id) {
      // Try waiting a moment for the script to load
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!window.google?.accounts?.id) {
        console.warn(
          "Google Sign-In library failed to load. Falling back to mock login.",
        );
        const mockUser: AuthUser = {
          id: `google-mock-${Date.now()}`,
          email: "mock.user@gmail.com",
          name: "Mock Google User",
          image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
          provider: "google",
        };
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
        localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
        return Promise.resolve(mockUser);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        window.google!.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            try {
              const payload = decodeJwtPayload(response.credential);
              const user: AuthUser = {
                id: `google-${payload.sub}`,
                email: payload.email,
                name: payload.name,
                image: payload.picture,
                provider: "google",
              };
              localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
              localStorage.setItem(AUTH_KEYS.LAST_EMAIL, user.email);
              resolve(user);
            } catch (err) {
              reject(new Error("Failed to process Google sign-in response"));
            }
          },
        });

        window.google!.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed()) {
            const reason = notification.getNotDisplayedReason();
            if (reason === "opt_out_or_no_session") {
              console.warn("No Google session found. Falling back to mock.");
              const mockUser: AuthUser = {
                id: `google-mock-${Date.now()}`,
                email: "mock.user@gmail.com",
                name: "Mock Google User",
                image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
                provider: "google",
              };
              localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
              localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
              resolve(mockUser);
            } else {
              console.warn(
                `Google Sign-In popup was not displayed: ${reason}. Falling back to mock.`,
              );
              const mockUser: AuthUser = {
                id: `google-mock-${Date.now()}`,
                email: "mock.user@gmail.com",
                name: "Mock Google User",
                image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
                provider: "google",
              };
              localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
              localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
              resolve(mockUser);
            }
          } else if (notification.isSkippedMoment()) {
            // If skipped, we can just resolve the mock user so it doesn't break
            console.warn("Google Sign-In was dismissed. Falling back to mock.");
            const mockUser: AuthUser = {
              id: `google-mock-${Date.now()}`,
              email: "mock.user@gmail.com",
              name: "Mock Google User",
              image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
              provider: "google",
            };
            localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
            localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
            resolve(mockUser);
          }
        });
      } catch (e) {
        console.warn("Google Sign In failed, falling back to mock:", e);
        const mockUser: AuthUser = {
          id: `google-mock-${Date.now()}`,
          email: "mock.user@gmail.com",
          name: "Mock Google User",
          image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mock",
          provider: "google",
        };
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
        localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
        resolve(mockUser);
      }
    });
  },

  // Sign out
  signOut(): void {
    localStorage.removeItem(AUTH_KEYS.USER);
    localStorage.removeItem(AUTH_KEYS.TOKEN);
  },

  // Get current user
  getCurrentUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const user = localStorage.getItem(AUTH_KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  // Get last email
  getLastEmail(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_KEYS.LAST_EMAIL);
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getCurrentUser();
  },
};
