import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Veuillez renseigner identifiant et mot de passe");
      return;
    }
    setIsLoading(true);
    const { error } = await signIn(username.trim(), password);
    if (error) {
      setIsLoading(false);
      return;
    }
    // Redirection selon rôle
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from("profiles")
          .select("password_change_required")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();
        if (profile?.password_change_required === true) {
          navigate("/change-password-required", { replace: true });
          return;
        }
        const { data: roles } = await (supabase as any)
          .from("user_roles").select("role").eq("user_id", user.id);
        const list = (roles || []).map((r: any) => r.role);
        const isStaff = list.some((r: string) => r !== "user");
        navigate(isStaff ? "/dashboard" : "/dashboard");
      } else {
        navigate("/dashboard");
      }
    } catch {
      navigate("/dashboard");
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page flex min-h-[100dvh] w-full min-w-0 flex-col overflow-x-clip lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      {/* Panneau gauche - Branding (caché sur mobile, visible sur desktop) */}
      <div className="login-brand-panel relative hidden min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden bg-primary px-[clamp(1rem,2.5vw,3rem)] py-[clamp(1.5rem,5vh,3rem)] text-white lg:flex">
        {/* Pattern décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-40 h-40 rounded-full border-2 border-white/30" />
          <div className="absolute bottom-32 right-16 w-64 h-64 rounded-full border-2 border-white/20" />
          <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full bg-white/5" />
        </div>
        
        <div className="relative z-10 flex w-full min-w-0 max-w-full flex-col items-center px-2 text-center">
          <img
            src="/agricapital360-logo.svg?v=20261022"
            alt="AgriCapital 360°"
            className="mx-auto mb-[clamp(1rem,3vh,2rem)] block h-auto w-[clamp(12rem,28vw,34rem)] max-w-full max-h-[55svh] object-contain drop-shadow-2xl"
          />
          <p className="text-white text-xl xl:text-2xl font-semibold mb-2">AgriCapital 360</p>
          <p className="max-w-xl text-sm text-white/85 xl:text-base">La plateforme métier intelligente d’AgriCapital.</p>
          
        </div>

        <p className="absolute bottom-6 text-white/50 text-xs">

          © {new Date().getFullYear()} AgriCapital - Investir la terre. Cultiver l'avenir.
        </p>
      </div>


      {/* Panneau droit - Formulaire de connexion */}
      <div className="login-form-panel relative flex min-h-[100dvh] min-w-0 w-full flex-col items-center justify-center bg-gradient-to-b from-background via-background to-primary/5 px-[clamp(1rem,3vw,3.5rem)] py-[clamp(1.25rem,4vh,3rem)] lg:min-h-0">
{/* Logo mobile — sans cadre */}

        <div className="login-brand-mobile lg:hidden mb-5 w-full min-w-0 flex flex-col items-center px-1 py-2">
          <img
            src="/agricapital360-logo.svg?v=20261022"
            alt="AgriCapital 360°"
            className="login-brand-mobile__logo mx-auto block h-auto max-w-[min(72vw,20rem)] object-contain"
          />
          
        </div>

        <div className="login-form-card mx-auto flex w-full min-w-0 max-w-[min(100%,52rem)] flex-col rounded-2xl border bg-card/95 p-[clamp(1rem,2.2vw,2.5rem)] shadow-lg lg:max-w-none lg:border-0 lg:bg-transparent lg:shadow-none">
          <div className="login-form-title mb-4 text-center lg:mb-8 lg:text-left">
            <h2 className="text-[clamp(1.9rem,3vw,3rem)] font-bold leading-tight text-foreground">Connexion</h2>
            
          </div>

          <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground text-lg lg:text-xl font-semibold">
                Nom d'utilisateur
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="votre_nom_utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="login-input h-[clamp(3rem,6.5vh,4.25rem)] min-w-0 text-base sm:text-lg lg:text-[clamp(1rem,1.2vw,1.25rem)]"
                disabled={isLoading}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); passwordInputRef.current?.focus(); } }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground text-lg font-semibold">
                  Mot de passe
                </Label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-sm text-primary hover:underline font-semibold"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  uppercase={false}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="login-input h-[clamp(3rem,6.5vh,4.25rem)] min-w-0 pr-12 sm:pr-14 text-base sm:text-lg lg:text-[clamp(1rem,1.2vw,1.25rem)]"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-12 sm:w-14 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="login-submit h-[clamp(3rem,6.5vh,4.25rem)] w-full whitespace-normal text-base font-semibold gap-2 sm:text-xl lg:text-[clamp(1rem,1.25vw,1.375rem)]"
              disabled={isLoading}
            >
              <LogIn className="h-4 w-4" />
              {isLoading ? "Connexion en cours..." : "Se connecter"}
            </Button>
          </form>

          <div className="login-account-request mt-6 text-center">
            <Button
              type="button"
              variant="link"
              onClick={() => navigate('/account-request')}
              className="max-w-full whitespace-normal text-center text-primary text-base lg:text-lg gap-2"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Demander la création d'un compte
            </Button>
          </div>

          <div className="login-support mt-4 pt-3 lg:mt-8 lg:pt-6 border-t text-center">
            <p className="text-sm text-muted-foreground">
              Support: <a href="tel:+2250759566087" className="text-primary hover:underline font-medium">+225 07 59 56 60 87</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
