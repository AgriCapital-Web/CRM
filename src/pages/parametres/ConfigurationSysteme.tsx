import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/traceability";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Globe, 
  Mail, 
  Phone, 
  DollarSign, 
  Settings, 
  Bell, 
  Save, 
  Loader2,
  Shield,
  FileText,
  AlertTriangle,
  Building2,
  Percent
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Configuration {
  id: string;
  cle: string;
  valeur: string;
  description: string | null;
  categorie: string;
  type_valeur: string;
  modifiable: boolean;
}

const ConfigurationSysteme = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const { data: configurations, isLoading } = useQuery({
    queryKey: ['configurations'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('configurations_systeme')
        .select('*')
        .order('categorie', { ascending: true })
        .order('cle', { ascending: true});
      
      if (error) throw error;
      return data as Configuration[];
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, valeur }: { id: string; valeur: string }) => {
      const { error } = await (supabase as any)
        .from('configurations_systeme')
        .update({ valeur, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] });
      logActivity({
        tableName: 'configurations_systeme',
        recordId: variables.id,
        action: 'UPDATE',
        details: `Configuration modifiée: ${variables.valeur}`,
      });
      setEditedValues({});
      toast({
        title: "Configuration mise à jour",
        description: "Les modifications ont été enregistrées.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour.",
        variant: "destructive",
      });
      console.error(error);
    }
  });

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(editedValues).map(([id, valeur]) => 
        (supabase as any)
          .from('configurations_systeme')
          .update({ valeur, updated_at: new Date().toISOString() })
          .eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] });
      setEditedValues({});
      toast({
        title: "Toutes les configurations mises à jour",
      });
    },
    onError: () => {
      toast({
        title: "Erreur",
        variant: "destructive",
      });
    }
  });

  const handleValueChange = (configId: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [configId]: value }));
  };

  const renderInput = (config: Configuration) => {
    const currentValue = editedValues[config.id] ?? config.valeur;
    const hasChanged = editedValues[config.id] !== undefined && editedValues[config.id] !== config.valeur;

    switch (config.type_valeur) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex-1">
              <p className="font-medium text-sm">{config.description || config.cle}</p>
              <p className="text-xs text-muted-foreground">{config.cle}</p>
            </div>
            <Switch
              checked={currentValue === 'true'}
              onCheckedChange={(checked) => handleValueChange(config.id, checked ? 'true' : 'false')}
              disabled={!config.modifiable || updateConfigMutation.isPending}
            />
          </div>
        );
      
      case 'number':
        return (
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{config.description || config.cle}</p>
                <p className="text-xs text-muted-foreground">{config.cle}</p>
              </div>
              {hasChanged && (
                <Badge variant="outline" className="text-xs">Modifié</Badge>
              )}
            </div>
            <Input
              type="number"
              value={currentValue}
              onChange={(e) => handleValueChange(config.id, e.target.value)}
              disabled={!config.modifiable || updateConfigMutation.isPending}
              className="bg-white"
            />
          </div>
        );
      
      default:
        return (
          <div className="p-3 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{config.description || config.cle}</p>
                <p className="text-xs text-muted-foreground">{config.cle}</p>
              </div>
              {hasChanged && (
                <Badge variant="outline" className="text-xs">Modifié</Badge>
              )}
            </div>
            <Input
              type={config.type_valeur === 'email' ? 'email' : config.type_valeur === 'url' ? 'url' : 'text'}
              value={currentValue}
              onChange={(e) => handleValueChange(config.id, e.target.value)}
              disabled={!config.modifiable || updateConfigMutation.isPending}
              className="bg-white"
            />
          </div>
        );
    }
  };

  const groupedConfigs = configurations?.reduce((acc, config) => {
    if (!acc[config.categorie]) {
      acc[config.categorie] = [];
    }
    acc[config.categorie].push(config);
    return acc;
  }, {} as Record<string, Configuration[]>);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'general': return <Building2 className="h-4 w-4" />;
      case 'contact': return <Mail className="h-4 w-4" />;
      case 'paiements': return <DollarSign className="h-4 w-4" />;
      case 'commissions': return <Percent className="h-4 w-4" />;
      case 'notifications': return <Bell className="h-4 w-4" />;
      case 'alertes': return <AlertTriangle className="h-4 w-4" />;
      case 'souscriptions': return <FileText className="h-4 w-4" />;
      case 'securite': return <Shield className="h-4 w-4" />;
      default: return <Settings className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      general: 'Général',
      contact: 'Contact',
      paiements: 'Paiements',
      commissions: 'Commissions',
      notifications: 'Notifications',
      alertes: 'Alertes',
      souscriptions: 'Souscriptions',
      securite: 'Sécurité'
    };
    return labels[category] || category;
  };

  const hasUnsavedChanges = Object.keys(editedValues).length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Configuration Système
            </CardTitle>
            <CardDescription>
              Configuration globale de la plateforme AgriCapital
            </CardDescription>
          </div>
          {hasUnsavedChanges && (
            <Button 
              onClick={() => saveAllMutation.mutate()}
              disabled={saveAllMutation.isPending}
              className="gap-2"
            >
              {saveAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer tout ({Object.keys(editedValues).length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {Object.keys(groupedConfigs || {}).length === 0 ? (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucune configuration disponible</p>
              <p className="text-sm text-muted-foreground mt-1">
                Les configurations seront automatiquement créées
              </p>
            </div>
          ) : (
            <Tabs defaultValue={Object.keys(groupedConfigs || {})[0]} className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1 p-1">
                {Object.keys(groupedConfigs || {}).map((category) => (
                  <TabsTrigger 
                    key={category} 
                    value={category} 
                    className="text-xs sm:text-sm gap-1"
                  >
                    {getCategoryIcon(category)}
                    <span className="hidden sm:inline">{getCategoryLabel(category)}</span>
                    <span className="sm:hidden">{getCategoryLabel(category).slice(0, 4)}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {groupedConfigs?.[category]?.length || 0}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(groupedConfigs || {}).map(([category, configs]) => (
                <TabsContent key={category} value={category}>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getCategoryIcon(category)}
                        {getCategoryLabel(category)}
                      </CardTitle>
                      <CardDescription>
                        {configs.length} paramètre(s) dans cette catégorie
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {configs.map((config) => (
                        <div key={config.id}>
                          {renderInput(config)}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigurationSysteme;
