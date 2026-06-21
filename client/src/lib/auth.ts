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
            ux_mode?: string;
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
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string; message: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
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

  // Sign in with Google using OAuth2 token flow (works reliably on localhost)
  async signInWithGoogle(): Promise<AuthUser | null> {
    // If no client ID configured, use mock for development
    if (!GOOGLE_CLIENT_ID) {
      console.warn(
        "[AUTH] No GOOGLE_CLIENT_ID configured. Using dev mock login.",
      );
      return this._createDevMockUser();
    }

    // Wait for Google libraries to load
    await this._waitForGoogleLibrary();

    // Try OAuth2 token flow first (most reliable, works on localhost)
    if (window.google?.accounts?.oauth2) {
      return this._signInWithOAuth2Token();
    }

    // Fallback: try GIS credential flow
    if (window.google?.accounts?.id) {
      return this._signInWithGISCredential();
    }

    // If no Google library loaded at all, use dev mock
    console.warn("[AUTH] Google libraries failed to load. Using dev mock.");
    return this._createDevMockUser();
  },

  /**
   * OAuth2 token flow — opens a proper Google consent popup.
   * Most reliable method, works on localhost without special configuration.
   */
  async _signInWithOAuth2Token(): Promise<AuthUser> {
    return new Promise((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "email profile openid",
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            reject(new Error(`Google OAuth error: ${tokenResponse.error}`));
            return;
          }

          try {
            // Use the access token to fetch user info
            const userInfoRes = await fetch(
              "https://www.googleapis.com/oauth2/v3/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${tokenResponse.access_token}`,
                },
              },
            );

            if (!userInfoRes.ok) {
              throw new Error("Failed to fetch user info from Google");
            }

            const userInfo = await userInfoRes.json();
            const user: AuthUser = {
              id: `google-${userInfo.sub}`,
              email: userInfo.email,
              name: userInfo.name,
              image: userInfo.picture,
              provider: "google",
            };

            localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
            localStorage.setItem(AUTH_KEYS.LAST_EMAIL, user.email);
            resolve(user);
          } catch (err) {
            reject(
              new Error("Failed to process Google sign-in. Please try again."),
            );
          }
        },
        error_callback: (error) => {
          if (error.type === "popup_closed") {
            reject(new Error("Sign-in popup was closed. Please try again."));
          } else {
            reject(new Error(`Google sign-in error: ${error.message}`));
          }
        },
      });

      // This opens the consent popup
      client.requestAccessToken();
    });
  },

  /**
   * GIS credential (One Tap) flow — fallback.
   * Less reliable but can work when OAuth2 isn't available.
   */
  async _signInWithGISCredential(): Promise<AuthUser> {
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
            reject(
              new Error(
                `Google sign-in unavailable: ${reason}. Try using email sign-in instead.`,
              ),
            );
          } else if (notification.isSkippedMoment()) {
            reject(
              new Error(
                "Google sign-in was dismissed. Please try again or use email sign-in.",
              ),
            );
          }
        });
      } catch (e) {
        reject(new Error("Google Sign-In failed. Please try email sign-in."));
      }
    });
  },

  /**
   * Wait for Google Identity Services library to load.
   */
  async _waitForGoogleLibrary(): Promise<void> {
    if (window.google?.accounts) return;

    // Wait up to 3 seconds for the script to load
    for (let i = 0; i < 15; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (window.google?.accounts) return;
    }
  },

  /**
   * Create a dev/mock user for development without Google OAuth configured.
   */
  _createDevMockUser(): AuthUser {
    const mockUser: AuthUser = {
      id: `dev-${Date.now()}`,
      email: "developer@local.dev",
      name: "Dev User",
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
      provider: "google",
    };
    localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(mockUser));
    localStorage.setItem(AUTH_KEYS.LAST_EMAIL, mockUser.email);
    return mockUser;
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
