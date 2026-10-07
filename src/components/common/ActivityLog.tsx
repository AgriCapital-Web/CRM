import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Clock, User, FileText } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";

interface ActivityLogProps {
  entityType: string;
  entityId: string;
  showAddNote?: boolean;
}

export const ActivityLog = ({ entityType, entityId, showAddNote = true }: ActivityLogProps) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchLogs = async () => {
    const { data } = await (supabase as any)
      .from("historique_actions")
      .select(`
        *,
        profiles:user_id(nom_complet)
      `)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    
    if (data) setLogs(data);
  };

  useEffect(() => {
    fetchLogs();
  }, [entityType, entityId]);

  const addNote = async () => {
    if (!note.trim() || !user) return;
    
    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from("historique_actions")
        .insert({
          user_id: user.id,
          action: "note_ajoutee",
          entity_type: entityType,
          entity_id: entityId,
          details: { note: note.trim() },
        });

      if (error) throw error;

      toast({
        title: "Note ajoutée",
        description: "Votre note a été enregistrée avec succès",
      });
      
      setNote("");
      fetchLogs();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      created: "Création",
      updated: "Modification",
      validated: "Validation",
      rejected: "Rejet",
      note_ajoutee: "Note ajoutée",
      paiement_effectue: "Paiement effectué",
      document_ajoute: "Document ajouté",
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      created: "default",
      updated: "secondary",
      validated: "default",
      rejected: "destructive",
      note_ajoutee: "outline",
    };
    return colors[action] || "default";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Historique & Traçabilité
        </CardTitle>
        <CardDescription>
          Toutes les actions effectuées sur cet élément
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddNote && (
          <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
            <Label htmlFor="note">Ajouter une note (optionnel)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajouter un commentaire, une observation ou une note..."
              rows={3}
            />
            <Button onClick={addNote} disabled={loading || !note.trim()} size="sm">
              <FileText className="h-4 w-4 mr-2" />
              {loading ? "Ajout..." : "Ajouter la note"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun historique disponible
            </p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex-shrink-0 mt-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getActionColor(log.action) as any}>
                      {getActionLabel(log.action)}
                    </Badge>
                    <span className="text-sm font-medium">
                      {log.profiles?.nom_complet || "Utilisateur"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  {log.details && (
                    <div className="text-sm text-muted-foreground">
                      {typeof log.details === 'object' ? (
                        log.details.note ? (
                          <p className="italic">&quot;{log.details.note}&quot;</p>
                        ) : (
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )
                      ) : (
                        <p>{log.details}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
