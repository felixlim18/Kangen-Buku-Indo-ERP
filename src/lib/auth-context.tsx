import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AuthContextType {
  user: User | null;
  profile: {
    uid: string;
    email: string;
    role: 'owner' | 'staff' | 'partner';
    displayName: string;
    permissions?: Record<string, boolean>;
    status?: 'aktif' | 'nonaktif';
  } | null;
  loading: boolean;
  authError: string | null;
  setAuthError: (err: string | null) => void;
  loginWithGoogle: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  loginWithEmailPassword: (e: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  loginAsDemo: (role: 'owner' | 'staff') => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthContextType['profile']>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let unsubAuthUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubAuthUser) {
        unsubAuthUser();
        unsubAuthUser = null;
      }

      if (currentUser) {
        const email = currentUser.email?.toLowerCase() || '';

        // Check for Custom Claims role
        let claimRole: 'owner' | 'staff' | 'partner' | null = null;
        let isTokenRefreshedMessageNeeded = false;
        try {
          const tokenResult = await currentUser.getIdTokenResult();
          const roleClaim = tokenResult.claims.role as 'owner' | 'staff' | 'partner' | undefined;
          if (roleClaim) {
            claimRole = roleClaim;
          } else {
            // Custom claim is missing (or cloud functions claims not set yet)
            isTokenRefreshedMessageNeeded = true;
          }
        } catch (tokenErr) {
          console.error("Error fetching token claims", tokenErr);
        }

        // Define hardcoded roles for bootstrapping (ONLY OWNER)
        const BOOTSTRAP_USERS: Record<string, 'owner' | 'staff' | 'partner'> = {
          'felixsalimzz@gmail.com': 'owner',
          'kangenbukuindo@gmail.com': 'owner'
        };

        // If email is not authorized in DB, check bootstrap
        let authorizedRole: 'owner' | 'staff' | 'partner' | null = BOOTSTRAP_USERS[email] || null;
        let permissions: Record<string, boolean> = {};
        let userStatus: 'aktif' | 'nonaktif' = 'aktif';
        let existingDisplayName: string | undefined = undefined;

        try {
          const authUserRef = doc(db, 'authorizedUsers', email);
          const authUserSnap = await getDoc(authUserRef);

          if (authUserSnap.exists()) {
            authorizedRole = authUserSnap.data().role;
            permissions = authUserSnap.data().permissions || {};
            userStatus = authUserSnap.data().status || 'aktif';
            existingDisplayName = authUserSnap.data().displayName;
          } else if (BOOTSTRAP_USERS[email]) {
            // Seed the authorizedUsers document for this bootstrapped user
            await setDoc(authUserRef, {
              email: email,
              role: BOOTSTRAP_USERS[email],
              displayName: currentUser.displayName || email.split('@')[0],
              createdAt: new Date().toISOString(),
              status: 'aktif',
              permissions: {}
            });
            authorizedRole = BOOTSTRAP_USERS[email];
            existingDisplayName = currentUser.displayName || email.split('@')[0];
          }
        } catch (err) {
          console.warn("Could not fetch from authorizedUsers collection, falling back to bootstrap:", err);
        }

        // If email is not authorized, block and sign out
        if (!authorizedRole) {
          setAuthError("Akses Ditolak: Email Google Anda tidak terdaftar sebagai Authorized User sistem ERP KangenBukuIndo. Silakan hubungi Owner.");
          setUser(null);
          setProfile(null);
          await signOut(auth);
          setLoading(false);
          return;
        }

        if (userStatus === 'nonaktif') {
          setAuthError("Akses Ditolak: Akun Anda telah dinonaktifkan oleh Owner.");
          setUser(null);
          setProfile(null);
          await signOut(auth);
          setLoading(false);
          return;
        }

        // Resolve final role (custom claim > database collection > bootstrap default)
        const finalRole = claimRole || authorizedRole;

        if (isTokenRefreshedMessageNeeded) {
          setAuthError("ℹ️ Klaim hak akses Google Anda sedang divalidasi. Jika menu navigasi belum lengkap, silakan keluar lalu masuk kembali untuk memperbarui token claims.");
        } else {
          setAuthError(null);
        }

        setUser(currentUser);
        
        const baseProfileData = {
          uid: currentUser.uid,
          email: email,
          role: finalRole,
          displayName: existingDisplayName || currentUser.displayName || email.split('@')[0] || 'User',
          permissions,
          status: userStatus
        };

        setProfile(baseProfileData);

        // Update/Sync profile in users collection (for basic profile info, but we rely on authorizedUsers for permissions)
        try {
          const profileRef = doc(db, 'users', currentUser.uid);
          await setDoc(profileRef, {
            uid: currentUser.uid,
            email: email,
            role: finalRole,
            displayName: existingDisplayName || currentUser.displayName || email.split('@')[0] || 'User',
          }, { merge: true });
        } catch (profileErr) {
          console.error("Error loading/syncing profile", profileErr);
        }

        // Listen for realtime permission & profile changes
        const authUserRef = doc(db, 'authorizedUsers', email);
        unsubAuthUser = onSnapshot(authUserRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === 'nonaktif') {
              setAuthError("Akses Ditolak: Akun Anda telah dinonaktifkan oleh Owner.");
              setUser(null);
              setProfile(null);
              signOut(auth);
            } else {
              setProfile(prev => prev ? {
                ...prev,
                role: claimRole || data.role || prev.role,
                displayName: data.displayName || prev.displayName,
                permissions: data.permissions || {},
                status: data.status || 'aktif'
              } : null);
            }
          }
        }, err => {
          if (String(err).includes("Quota") || String(err).includes("quota")) {
            console.warn("Firebase quota exceeded (snapshot)");
          } else {
            console.error("Snapshot error:", err);
          }
        });

      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubAuthUser) unsubAuthUser();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);

    // Google OAuth is prohibited from rendering inside an iframe by Google's X-Frame-Options header
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      setLoading(false);
      window.open(window.location.href, '_blank');
      setAuthError("ℹ️ Google Sign-In telah dibuka di tab browser baru karena extension/iframe memblokir Google Auth.");
      return;
    }

    const provider = new GoogleAuthProvider();
    try {
      // Enforce Google Sign-In with popup
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Google Auth failed", error);
      if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup')) {
        try {
          console.warn("Popup diblokir, mengalihkan ke signInWithRedirect...");
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          console.error("Redirect Auth failed", redirectErr);
          setAuthError("Popup login diblokir oleh extension/browser preview. Silakan buka aplikasi di tab browser baru atau gunakan Login Demo.");
        }
      } else {
        setAuthError(error instanceof Error ? error.message : "Gagal melakukan Google Sign-In.");
      }
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  const loginWithEmailPassword = async (rawEmail: string, rawPass: string) => {
    const email = rawEmail.trim();
    const pass = rawPass.trim();
    setLoading(true);
    setAuthError(null);

    const ownerUsername = ((import.meta as any).env?.VITE_OWNER_USERNAME || 'kangenbukuindo@gmail.com').trim();
    const ownerPassword = ((import.meta as any).env?.VITE_OWNER_PASSWORD || 'kangenbukuindo123').trim();
    
    // Fallback local mock user login for preview / iframe environments if owner credentials are correct
    if (email === ownerUsername && pass === ownerPassword) {
      console.warn("Using local mock demo user fallback for preview environment");
      const mockUser = {
        uid: 'demo-owner-uid',
        email,
        displayName: 'Login Owner',
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        refreshToken: '',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'mock-token',
        getIdTokenResult: async () => ({
          authTime: '',
          expirationTime: '',
          issuedAtTime: '',
          signInProvider: 'demo',
          signInSecondFactor: null,
          token: 'mock-token',
          claims: { role: 'owner' }
        }),
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
        providerId: 'demo'
      } as unknown as User;

      setUser(mockUser);
      setProfile({
        uid: mockUser.uid,
        email,
        role: 'owner',
        displayName: 'Login Owner',
        permissions: {},
        status: 'aktif'
      });
      setLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      console.warn("Firebase email auth attempt notice:", err?.code || err);
      setAuthError("Username atau password salah.");
    } finally {
      setLoading(false);
    }
  };

  const loginAsDemo = async (role: 'owner' | 'staff') => {
    setLoading(true);
    setAuthError(null);
    const email = role === 'owner' ? 'kangenbukuindo@gmail.com' : 'kangenbukuindo2@gmail.com';
    const password = 'kangenbukuindo123';
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.warn("Firebase email auth attempt notice:", err?.code || err);
      let success = false;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email' || err.code === 'auth/missing-password' || err.code === 'auth/wrong-password') {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          success = true;
        } catch (createErr: any) {
          console.error("Failed to create demo user in Firebase Auth", createErr);
        }
      }
      
      if (!success) {
        // Fallback local mock user login for preview / iframe environments
        console.warn("Using local mock demo user fallback for preview environment");
        const mockUser = {
          uid: role === 'owner' ? 'demo-owner-uid' : 'demo-staff-uid',
          email,
          displayName: role === 'owner' ? 'Demo Owner' : 'Demo Staff',
          emailVerified: true,
          isAnonymous: false,
          metadata: {},
          providerData: [],
          refreshToken: '',
          tenantId: null,
          delete: async () => {},
          getIdToken: async () => 'mock-token',
          getIdTokenResult: async () => ({
            authTime: '',
            expirationTime: '',
            issuedAtTime: '',
            signInProvider: 'demo',
            signInSecondFactor: null,
            token: 'mock-token',
            claims: { role }
          }),
          reload: async () => {},
          toJSON: () => ({}),
          phoneNumber: null,
          photoURL: null,
          providerId: 'demo'
        } as unknown as User;

        setUser(mockUser);
        setProfile({
          uid: mockUser.uid,
          email,
          role,
          displayName: role === 'owner' ? 'Demo Owner' : 'Demo Staff',
          permissions: role === 'owner' ? {} : { pos: true, sales: true },
          status: 'aktif'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = loginWithGoogle;

  const updateDisplayName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (user?.email) {
      const emailLower = user.email.toLowerCase();
      try {
        await setDoc(doc(db, 'authorizedUsers', emailLower), { displayName: trimmed }, { merge: true });
      } catch (err) {
        console.error("Error updating authorizedUsers displayName:", err);
      }
    }

    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), { displayName: trimmed }, { merge: true });
      } catch (err) {
        console.error("Error updating users displayName:", err);
      }
    }

    setProfile(prev => prev ? { ...prev, displayName: trimmed } : null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, setAuthError, loginWithEmailPassword, loginWithGoogle, signInWithGoogle, logout, loginAsDemo, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
