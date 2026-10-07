import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/lib/safeError";

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string;
  action: string;
  onNoteSaved?: () => void;
}

export const NoteDialog = ({ 
  open, 
  onOpenChange, 
  entityType, 
  entityId, 
  action,
  onNoteSaved 
}: NoteDialogProps) => {
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!user || !note.trim()) return;

    setIsSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('activity_notes')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId,
          action: action,
          note: note.trim()
        });

      if (error) throw error;

      toast({
        title: "Note enregistrée",
        description: "Votre note a été enregistrée avec succès",
      });

      setNote("");
      onOpenChange(false);
      onNoteSaved?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setNote("");
    onOpenChange(false);
    onNoteSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une note (optionnel)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Action effectuée</Label>
            <p className="text-sm text-muted-foreground mt-1">{action}</p>
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajoutez une note sur cette action..."
              rows={4}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleSkip}
              disabled={isSaving}
            >
              Ignorer
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !note.trim()}
            >
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
