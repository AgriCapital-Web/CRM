import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { cacheAuthCredentials, getCachedAuth, hashPassword, generateAuthSalt } from '@/lib/offlineDb';
import { getSafeErrorMessage } from '@/lib/safeError';


interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  userRoles: string[];
  loading: boolean;
  signIn: (usernameOrEmail: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadProfileAndRoles = useCallback(async (userId: string) => {
    try {
      const cached = await getCachedAuth();
      let profileData: any = null;
      let roles: string[] = [];

      try {
        const result = await (supabase as any)
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        profileData = result.data || null;

        if (!profileData) {
          const fallback = await (supabase as any)
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          profileData = fallback.data || null;
        }
      } catch {
        profileData = null;
      }

      try {
        const { data: rolesData } = await (supabase as any)
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);
        roles = rolesData?.map((r: any) => r.role) || [];
      } catch {
        roles = [];
      }

      // Après une coupure réseau, le dernier profil/rôle authentifié reste utilisable.
      if (!profileData && cached?.profile?.user_id === userId) profileData = cached.profile;
      if (!roles.length && cached?.profile?.user_id === userId) roles = cached.roles || [];

      setProfile(profileData || null);
      setUserRoles(roles);
    } catch (error) {
      console.error('Error fetching user data:', error);
      try {
        const cached = await getCachedAuth();
        if (cached?.profile?.user_id === userId) {
          setProfile(cached.profile);
          setUserRoles(cached.roles || []);
        }
      } catch {
        // local cache unavailable
      }
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Ne laissez jamais une route métier s'évaluer avec une liste de rôles vide
          // pendant la phase de connexion : les comptes Super Admin / PDG doivent
          // disposer de leurs droits avant le rendu des écrans protégés.
          setLoading(true);
          setTimeout(async () => {
            try {
              await loadProfileAndRoles(session.user.id);
            } finally {
              setLoading(false);
            }
          }, 0);
        } else {
          setProfile(null);
          setUserRoles([]);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      // Stale/invalid refresh token → clean local storage so ProtectedRoute redirects to /login
      if (error && /refresh.*token/i.test(error.message || '')) {
        try { await supabase.auth.signOut(); } catch { /* best effort */ }
        setSession(null); setUser(null); setProfile(null); setUserRoles([]);
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(async () => {
          await loadProfileAndRoles(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfileAndRoles]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await loadProfileAndRoles(user.id);
  }, [user?.id, loadProfileAndRoles]);

  const signIn = async (usernameOrEmail: string, password: string) => {
    // Authentification hors ligne : comparaison PBKDF2 avec le sel unique mis en cache.
    const tryOfflineAuth = async (identifier?: string) => {
      const cached = await getCachedAuth();
      if (!cached || !cached.salt) return false;
      if (identifier) {
        const normalizedIdentifier = identifier.trim().toLowerCase();
        const emailMatch = cached.email?.toLowerCase() === normalizedIdentifier;
        const usernameMatch = cached.profile?.username?.toLowerCase() === normalizedIdentifier;
        if (!emailMatch && !usernameMatch) return false;
      }
      const hashed = await hashPassword(password, cached.salt);
      if (hashed !== cached.passwordHash) return false;
      setUser({ id: cached.profile?.user_id, email: cached.email } as any);
      setProfile({ ...cached.profile, offline_session: true });
      setUserRoles(cached.roles);
      setLoading(false);
      return true;
    };

    try {
      let email = usernameOrEmail.trim().toLowerCase();

      if (!navigator.onLine) {
        const cached = await getCachedAuth();
        if (!cached || !cached.salt) {
          return { error: { message: 'Aucune donnée hors ligne disponible. Connectez-vous en ligne d\'abord.' } };
        }
        if (await tryOfflineAuth(usernameOrEmail)) {
          toast({
            title: "Connexion hors ligne",
            description: "Mode hors ligne activé. Les données seront synchronisées dès le retour du réseau.",
          });
          return { error: null };
        }
        return { error: { message: 'Identifiants incorrects (mode hors ligne)' } };
      }

      // Online: resolve username to email (edge function sécurisée uniquement)
      if (!usernameOrEmail.includes('@')) {
        let resolved: string | null = null;

        try {
          const { data: resolveData } = await supabase.functions.invoke('resolve-username', {
            body: { username: usernameOrEmail, password, mode: 'login' },
          });
          resolved = ((resolveData as any)?.email as string) || null;
        } catch {
          resolved = null;
        }


        if (!resolved) {
          toast({
            variant: 'destructive',
            title: 'Connexion impossible',
            description: 'Identifiant ou mot de passe incorrect.',
          });
          return { error: { message: 'Identifiant ou mot de passe incorrect.' } };
        }
        email = resolved.trim().toLowerCase();
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        // Fallback to offline auth if network error
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
          if (await tryOfflineAuth(email)) {
            toast({ title: "Connexion hors ligne", description: "Réseau instable — mode hors ligne activé." });
            return { error: null };
          }
        }
        toast({
          variant: "destructive",
          title: "Erreur de connexion",
          description: /invalid login credentials/i.test(error.message || '')
            ? 'Mot de passe incorrect. Utilisez « Mot de passe oublié ? » pour le réinitialiser.'
            : getSafeErrorMessage(error, 'Identifiants incorrects'),
        });
        return { error };
      }

      // Cache credentials for offline use (sel aléatoire unique par appareil/utilisateur)
      try {
        const userId = authData.user?.id;
        const { data: prof } = await (supabase as any).from('profiles').select('*').eq('user_id', userId).maybeSingle();
        const { data: roles } = await (supabase as any).from('user_roles').select('role').eq('user_id', userId);
        const rolesList = roles?.map((r: any) => r.role) || [];
        if (prof) {
          const salt = generateAuthSalt();
          const hashed = await hashPassword(password, salt);
          await cacheAuthCredentials(email, hashed, salt, prof, rolesList);
        }
      } catch (cacheErr) {
        console.warn('Failed to cache auth:', cacheErr);
      }

      toast({ title: "Connexion réussie", description: "Bienvenue sur AgriCapital CRM" });
      return { error: null };
    } catch (error: any) {
      console.error('Sign in error:', error);
      // Last resort: try offline auth
      try {
        if (await tryOfflineAuth()) {
          toast({ title: "Connexion hors ligne", description: "Erreur réseau — mode hors ligne activé." });
          return { error: null };
        }
      } catch { /* best effort */ }
      return { error };
    }
  };


  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de se déconnecter",
      });
    } else {
      toast({
        title: "Déconnexion",
        description: "À bientôt !",
      });
    }
  };

  const hasRole = (role: string) => {
    return userRoles.includes(role);
  };

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile-sync-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` }, (payload) => {
        setProfile(payload.new);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      profile, 
      userRoles, 
      loading, 
      signIn, 
      signOut,
      hasRole,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
