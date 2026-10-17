import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import logoV2 from "@/assets/logo-agricapital-v2.png";
import logoWhite from "@/assets/logo-white.png";
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
    <div className="login-page min-h-screen flex flex-col lg:flex-row">
      {/* Panneau gauche - Branding (caché sur mobile, visible sur desktop) */}
      <div className="login-brand-panel hidden lg:flex lg:w-[42%] xl:w-[42%] bg-primary relative flex-col items-center justify-center px-6 xl:px-10 py-10 overflow-hidden">
        {/* Pattern décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-40 h-40 rounded-full border-2 border-white/30" />
          <div className="absolute bottom-32 right-16 w-64 h-64 rounded-full border-2 border-white/20" />
          <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full bg-white/5" />
        </div>
        
        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center px-2">
          <img
            src={logoWhite}
            alt="AgriCapital"
            className="block w-full max-w-[min(62vw,1120px)] max-h-[80svh] object-contain mx-auto mb-5 xl:mb-7 drop-shadow-2xl"
          />
          <p className="text-white text-xl xl:text-2xl font-semibold mb-2">Espace équipe</p>
          
        </div>

        <p className="absolute bottom-6 text-white/50 text-xs">

          © {new Date().getFullYear()} AgriCapital - Investir la terre. Cultiver l'avenir.
        </p>
      </div>


      {/* Panneau droit - Formulaire de connexion */}
      <div className="login-form-panel relative flex-1 min-w-0 flex flex-col items-center justify-center px-3 py-5 sm:px-6 sm:py-8 lg:px-8 xl:px-12 2xl:px-16 bg-gradient-to-b from-background via-background to-primary/5 min-h-dvh lg:min-h-0">
{/* Logo mobile — sans cadre */}

        <div className="login-brand-mobile lg:hidden mb-5 w-full min-w-0 flex flex-col items-center px-1 py-2">
          <img
            src={logoV2}
            alt="AgriCapital"
            className="login-brand-mobile__logo mx-auto block h-auto max-w-[min(72vw,20rem)] object-contain"
          />
          
        </div>

        <div className="login-form-card mx-auto w-full max-w-xl min-w-0 rounded-2xl border bg-card/95 p-4 sm:p-6 lg:max-w-4xl lg:p-8 xl:p-10 2xl:p-12 shadow-lg lg:border-0 lg:bg-transparent lg:shadow-none">
          <div className="login-form-title mb-4 text-center lg:mb-8 lg:text-left">
            <h2 className="text-[clamp(2rem,3.4vw,3.5rem)] font-bold leading-tight text-foreground">Connexion</h2>
            
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
                className="login-input h-12 sm:h-14 lg:h-[4.5rem] text-base sm:text-lg lg:text-xl"
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
                  className="login-input h-12 sm:h-14 lg:h-[4.5rem] pr-14 text-base sm:text-lg lg:text-xl"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-12 w-12 sm:h-14 sm:w-14 lg:h-[4.5rem] lg:w-[4.5rem] hover:bg-transparent"
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
              className="login-submit w-full h-12 sm:h-14 lg:h-[4.5rem] text-base sm:text-xl lg:text-2xl font-semibold gap-2"
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
              className="text-primary text-base lg:text-lg gap-2"
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
