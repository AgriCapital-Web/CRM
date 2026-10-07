import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Eye, GripVertical, User, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "react-router-dom";
import { getSafeErrorMessage } from "@/lib/safeError";

interface KanbanPipelineProps {
  clients: any[];
  onRefresh: () => void;
}

const STAGES = [
  { key: "en_attente", label: "En attente", color: "bg-yellow-500", textColor: "text-yellow-700", bgLight: "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" },
  { key: "documents_requis", label: "Documents requis", color: "bg-orange-500", textColor: "text-orange-700", bgLight: "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800" },
  { key: "enquete", label: "Enquête terrain", color: "bg-blue-500", textColor: "text-blue-700", bgLight: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" },
  { key: "actif", label: "Actif", color: "bg-green-500", textColor: "text-green-700", bgLight: "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" },
  { key: "suspendu", label: "Suspendu", color: "bg-red-500", textColor: "text-red-700", bgLight: "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" },
  { key: "archive", label: "Archivé", color: "bg-slate-500", textColor: "text-slate-700", bgLight: "bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800" },
];

const KanbanPipeline = ({ clients, onRefresh }: KanbanPipelineProps) => {
  const { toast } = useToast();
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const getStageItems = (stageKey: string) => {
    return clients.filter((s) => {
      const statut = s.statut || s.statut_global || "actif";
      if (stageKey === "en_attente") return statut === "en_attente" || statut === "inactif";
      if (stageKey === "documents_requis") return statut === "documents_requis";
      if (stageKey === "enquete") return statut === "enquete" || statut === "en_cours";
      return statut === stageKey;
    });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageKey);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedItem) return;

    try {
      const { error } = await supabase
        .from("clients")
        .update({ statut: newStage, statut_global: newStage })
        .eq("id", draggedItem);

      if (error) throw error;

      toast({
        title: "Statut mis à jour",
        description: `Client déplacé vers "${STAGES.find(s => s.key === newStage)?.label}"`,
      });
      onRefresh();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: getSafeErrorMessage(error) });
    } finally {
      setDraggedItem(null);
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
      {STAGES.map((stage) => {
        const items = getStageItems(stage.key);
        return (
          <div
            key={stage.key}
            className={`flex-shrink-0 w-[280px] rounded-xl border-2 transition-all ${
              dragOverStage === stage.key ? "border-primary scale-[1.02] shadow-lg" : stage.bgLight
            }`}
            onDragOver={(e) => handleDragOver(e, stage.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.key)}
          >
            <div className="p-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <h3 className="font-semibold text-sm">{stage.label}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
            </div>
            <ScrollArea className="h-[calc(60vh-60px)]">
              <div className="p-2 space-y-2">
                {items.map((item) => (
                  <Card
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    className={`cursor-grab active:cursor-grabbing transition-all hover:shadow-md ${
                      draggedItem === item.id ? "opacity-50 scale-95" : ""
                    }`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.id_unique}
                          </span>
                        </div>
                        <Link to={`/client/${item.id}`}>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {item.nom_complet || `${item.nom || ""} ${item.prenoms || ""}`}
                        </span>
                      </div>
                      {item.offres && (
                        <Badge
                          className="text-xs"
                          style={{ backgroundColor: item.offres.couleur, color: "#fff" }}
                        >
                          {item.offres.nom}
                        </Badge>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{item.nombre_plantations || 0} parcelle(s)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {item.created_at
                              ? format(new Date(item.created_at), "dd MMM", { locale: fr })
                              : "-"}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-8">
                    Aucun élément
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
};

export default KanbanPipeline;
