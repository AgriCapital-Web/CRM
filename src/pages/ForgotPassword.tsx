import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logoGreen from "@/assets/logo-green.png";
import { ArrowLeft } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";

const ForgotPassword = () => {
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const value = identifier.trim().toLowerCase();

      if (!value.includes("@")) {
        // L'email de réinitialisation est envoyé côté serveur : l'adresse n'est jamais divulguée.
        const { error: resolveError } = await supabase.functions.invoke("resolve-username", {
          body: { username: value, mode: "recovery" },
        });
        if (resolveError) throw resolveError;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(value, {
          redirectTo: "https://app.agricapital.ci/reset-password",
        });
        if (error) throw error;
      }

      setEmailSent(true);
      toast({
        title: "Email envoyé",
        description: "Vérifiez votre boîte mail pour réinitialiser votre mot de passe.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error) || "Impossible d'envoyer l'email de réinitialisation",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary-hover p-4 relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptMCA0YzEuMTA1IDAgMiAuODk1IDIgMnMtLjg5NSAyLTIgMi0yLS44OTUtMi0yIC44OTUtMiAyLTJ6IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuMDUiLz48L2c+PC9zdmc+')] opacity-20"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
      
      <Card className="w-full max-w-md shadow-strong relative z-10 backdrop-blur-sm bg-white/95">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="flex justify-center mb-4">
            <img src={logoGreen} alt="AgriCapital Logo" className="h-32 w-auto" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">
            Mot de passe oublié ?
          </CardTitle>
          <CardDescription>
            {emailSent 
              ? "Un email de réinitialisation a été envoyé"
              : "Entrez votre identifiant ou votre email pour réinitialiser votre mot de passe"
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {!emailSent ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-foreground font-medium">
                  Identifiant ou email
                </Label>
                <Input
                  id="identifier"
                  type="text"
                  uppercase={false}
                  placeholder="votre_identifiant ou contact@agricapital.ci"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="h-11"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-semibold bg-primary hover:bg-primary-hover text-primary-foreground transition-all"
                disabled={isLoading}
              >
                {isLoading ? "Envoi en cours..." : "Envoyer le lien de réinitialisation"}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe.
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="text-accent hover:text-accent/80"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour à la connexion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
