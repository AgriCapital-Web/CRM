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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Panneau gauche - Branding (caché sur mobile, visible sur desktop) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[52%] bg-primary relative flex-col items-center justify-center px-6 xl:px-10 py-10 overflow-hidden">
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
            className="block w-full max-w-[min(44vw,720px)] max-h-[62svh] object-contain mx-auto mb-5 xl:mb-7 drop-shadow-2xl"
          />
          <p className="text-white text-xl xl:text-2xl font-semibold mb-2">Espace équipe</p>
          
        </div>

        <p className="absolute bottom-6 text-white/50 text-xs">

          © {new Date().getFullYear()} AgriCapital - Investir la terre. Cultiver l'avenir.
        </p>
      </div>


      {/* Panneau droit - Formulaire de connexion */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-3 py-5 sm:px-6 sm:py-8 lg:px-8 xl:px-12 bg-gradient-to-b from-background via-background to-primary/5 min-h-dvh lg:min-h-0">
{/* Logo mobile — sans cadre */}

        <div className="login-brand-mobile lg:hidden mb-5 w-full min-w-0 flex flex-col items-center px-1 py-2">
          <img
            src={logoV2}
            alt="AgriCapital"
            className="login-brand-mobile__logo block h-auto object-contain"
          />
          
        </div>

        <div className="w-full max-w-xl rounded-3xl border bg-card/95 p-4 sm:p-8 lg:max-w-2xl lg:p-8 xl:p-10 shadow-lg lg:border-0 lg:bg-transparent lg:shadow-none">
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-[clamp(1.8rem,4vw,2.5rem)] font-bold text-foreground">Connexion</h2>
            
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground text-lg font-semibold">
                Nom d'utilisateur
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="votre_nom_utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-14 sm:h-16 lg:h-[3.75rem] text-base sm:text-lg"
                disabled={isLoading}
                autoComplete="username"
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
                  className="h-14 sm:h-16 lg:h-[3.75rem] pr-14 text-base sm:text-lg"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-14 w-14 sm:h-16 sm:w-16 hover:bg-transparent"
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
              className="w-full h-14 sm:h-16 text-lg font-semibold gap-2"
              disabled={isLoading}
            >
              <LogIn className="h-4 w-4" />
              {isLoading ? "Connexion en cours..." : "Se connecter"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Button
              type="button"
              variant="link"
              onClick={() => navigate('/account-request')}
              className="text-primary text-base gap-2"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Demander la création d'un compte
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t text-center">
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
