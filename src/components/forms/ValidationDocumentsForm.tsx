import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/safeError";

interface ValidationDocumentsFormProps {
  documents: any[];
  onSuccess: () => void;
}

const ValidationDocumentsForm = ({ documents, onSuccess }: ValidationDocumentsFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [observations, setObservations] = useState<{ [key: string]: string }>({});

  const pendingDocs = documents.filter(d => d.statut === "en_attente");

  const handleValidation = async (docId: string, statut: "valide" | "rejete") => {
    if (!user) return;
    setLoading(docId);

    try {
      const { error } = await (supabase as any)
        .from("documents_souscription")
        .update({
          statut,
          date_validation: new Date().toISOString(),
          valide_par: user.id,
          observations: observations[docId] || null,
        })
        .eq("id", docId);

      if (error) throw error;

      toast({
        title: "Succès",
        description: `Document ${statut === "valide" ? "validé" : "rejeté"}`,
      });
      onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(null);
    }
  };

  const getDocTypeLabel = (type: string) => {
    const labels: { [key: string]: string } = {
      fiche_contrat: "Fiche Contrat",
      enquete_communautaire: "Enquête Communautaire",
      piece_identite: "Pièce d'Identité",
      document_foncier: "Document Foncier",
      attestation_exploitation: "Attestation d'Exploitation",
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-4">
      {pendingDocs.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Aucun document en attente de validation
        </p>
      ) : (
        pendingDocs.map((doc) => (
          <Card key={doc.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold">{getDocTypeLabel(doc.type_document)}</h3>
                  <p className="text-sm text-muted-foreground">
                    Soumis le {new Date(doc.date_soumission).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline">En attente</Badge>
              </div>

              <div className="space-y-4">
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(doc.fichier_url, "_blank")}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Voir le document
                  </Button>
                </div>

                <Textarea
                  placeholder="Observations (optionnel)"
                  value={observations[doc.id] || ""}
                  onChange={(e) =>
                    setObservations({ ...observations, [doc.id]: e.target.value })
                  }
                />

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleValidation(doc.id, "valide")}
                    disabled={loading === doc.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Valider
                  </Button>
                  <Button
                    onClick={() => handleValidation(doc.id, "rejete")}
                    disabled={loading === doc.id}
                    variant="destructive"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default ValidationDocumentsForm;
