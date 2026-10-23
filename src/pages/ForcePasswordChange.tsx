import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

import { getSafeErrorMessage } from "@/lib/safeError";

const ForcePasswordChange = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id || password.length === 0) {
      toast({ variant: "destructive", title: "Mot de passe requis", description: "Saisissez votre nouveau mot de passe." });
      return;
    }

    setSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const { data, error } = await supabase.functions.invoke("admin-manage-user", {
        body: { action: "complete_forced_password_change", user_id: user.id },
      });
      let payload: any = data;
      if (error && typeof (error as any).context?.json === "function") {
        try { payload = await (error as any).context.json(); } catch { /* réponse non JSON */ }
      }
      if (error || payload?.error || payload?.success !== true) {
        throw new Error(payload?.error || error?.message || "Impossible de confirmer le changement dans le profil.");
      }

      await refreshProfile();
      setPassword("");
      toast({ title: "Mot de passe modifié", description: "Votre nouveau mot de passe est enregistré. Vous pouvez continuer." });
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Modification impossible",
        description: getSafeErrorMessage(error, "Vérifiez le mot de passe puis réessayez."),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-3 py-6">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="items-center text-center space-y-3">
          <img src="/images/Logo%20%20AgriCapital%20-360%C2%B0.png?v=20261023-official" alt="AgriCapital" className="h-16 w-auto max-w-full" />
          <div className="rounded-full bg-primary/10 p-3 text-primary"><ShieldCheck className="h-7 w-7" /></div>
          <CardTitle className="text-2xl">Modification obligatoire du mot de passe</CardTitle>
          <CardDescription>
            Le PDG ou l’administration a modifié votre mot de passe. Choisissez maintenant votre mot de passe personnel pour continuer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forced-password">Votre nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="forced-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Choisissez librement votre mot de passe"
                  required
                  className="h-12 pr-12"
                  disabled={saving}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Aucune règle de composition personnalisée : utilisez le mot de passe que vous souhaitez, dans les limites techniques du service de connexion.</p>
            </div>
            <Button type="submit" className="w-full h-12" disabled={saving || password.length === 0}>
              <KeyRound className="mr-2 h-4 w-4" />
              {saving ? "Enregistrement…" : "Enregistrer et continuer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export default ForcePasswordChange;
