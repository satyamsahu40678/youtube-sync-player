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
          prompt: (callback?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            getNotDisplayedReason: () => string;
          }) => void) => void;
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
        .join("")
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
      throw new Error(
        "Google Sign-In is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in client/.env.local to enable it."
      );
    }

    // Wait for GIS library to load
    if (!window.google?.accounts?.id) {
      // Try waiting a moment for the script to load
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!window.google?.accounts?.id) {
        throw new Error(
          "Google Sign-In library failed to load. Please refresh the page and try again."
        );
      }
    }

    return new Promise((resolve, reject) => {
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
            reject(
              new Error(
                "No Google session found. Please sign in to Google in your browser first."
              )
            );
          } else {
            reject(
              new Error(
                `Google Sign-In popup was not displayed: ${reason}. Try using email sign-in instead.`
              )
            );
          }
        } else if (notification.isSkippedMoment()) {
          reject(
            new Error("Google Sign-In was dismissed. Please try again.")
          );
        }
      });
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
