import { useState } from "react";
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
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative flex-col items-center justify-center p-12 overflow-hidden">
        {/* Pattern décoratif */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-40 h-40 rounded-full border-2 border-white/30" />
          <div className="absolute bottom-32 right-16 w-64 h-64 rounded-full border-2 border-white/20" />
          <div className="absolute top-1/2 left-1/3 w-20 h-20 rounded-full bg-white/5" />
        </div>
        
        <div className="relative z-10 text-center max-w-md">
          <img
            src={logoWhite}
            alt="AgriCapital"
            className="w-full max-w-md h-auto mx-auto mb-8 drop-shadow-2xl"
          />
          <p className="text-white text-xl font-semibold mb-2">Espace équipe</p>
          <p className="text-white/80 text-base">
            Connectez-vous pour accéder à votre espace de travail.
          </p>
        </div>

        <p className="absolute bottom-6 text-white/50 text-xs">

          © {new Date().getFullYear()} AgriCapital - Investir la terre. Cultiver l'avenir.
        </p>
      </div>


      {/* Panneau droit - Formulaire de connexion */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-b from-background via-background to-primary/5 min-h-screen lg:min-h-0">
{/* Logo mobile — sans cadre */}

        <div className="lg:hidden mb-6 w-full flex flex-col items-center rounded-3xl border bg-card/95 px-5 py-6 shadow-sm backdrop-blur">
          <img
            src={logoV2}
            alt="AgriCapital"
            className="w-full max-w-[230px] sm:max-w-xs h-auto"
          />
          <p className="text-muted-foreground text-sm mt-3 text-center">
            Gestion des clients & plantations
          </p>
        </div>

        <div className="w-full max-w-sm rounded-3xl border bg-card/95 p-5 shadow-lg sm:p-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
          <div className="mb-8 text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Connexion</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Connectez-vous avec votre nom d'utilisateur
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground font-medium">
                Nom d'utilisateur
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="votre_nom_utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground font-medium">
                  Mot de passe
                </Label>
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  uppercase={false}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-11 w-11 hover:bg-transparent"
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
              className="w-full h-11 font-semibold gap-2"
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
              className="text-primary text-sm gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Demander la création d'un compte
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Support: <a href="tel:+2250759566087" className="text-primary hover:underline font-medium">+225 07 59 56 60 87</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
