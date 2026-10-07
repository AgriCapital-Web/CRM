import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Statut {
  id: string;
  type: string;
  valeur: string;
  label: string;
  description: string;
  color: string;
  ordre: number;
}

const STATUTS_PLANTATION = [
  { valeur: "en_attente_da", label: "En attente PI", color: "secondary", description: "Dossier en attente de versement du Paiement Initial" },
  { valeur: "da_valide", label: "PI validé", color: "default", description: "Paiement Initial versé et validé" },
  { valeur: "en_delimitation_gps", label: "En délimitation GPS", color: "default", description: "Délimitation géographique en cours" },
  { valeur: "en_piquetage", label: "En piquetage", color: "default", description: "Piquetage du terrain en cours" },
  { valeur: "en_plantation", label: "En plantation", color: "default", description: "Mise en terre des plants en cours" },
  { valeur: "en_croissance", label: "En croissance", color: "default", description: "Phase de croissance des plants" },
  { valeur: "en_production", label: "En production", color: "default", description: "Plantation en phase de production" },
  { valeur: "autonomie", label: "Autonomie", color: "default", description: "Plantation autonome" },
  { valeur: "suspendue", label: "Suspendue", color: "destructive", description: "Plantation temporairement suspendue" },
  { valeur: "hypothequee", label: "Hypothéquée", color: "destructive", description: "Plantation mise en garantie" },
  { valeur: "resiliee", label: "Résiliée", color: "destructive", description: "Contrat résilié" },
  { valeur: "abandonnee", label: "Abandonnée", color: "destructive", description: "Plantation abandonnée" },
];

const STATUTS_CLIENT = [
  { valeur: "actif", label: "Actif", color: "default", description: "Client actif" },
  { valeur: "inactif", label: "Inactif", color: "secondary", description: "Client inactif temporairement" },
  { valeur: "suspendu", label: "Suspendu", color: "destructive", description: "Compte suspendu" },
  { valeur: "resilie", label: "Résilié", color: "destructive", description: "Contrat résilié" },
  { valeur: "blacklist", label: "Liste noire", color: "destructive", description: "Client en liste noire" },
];

const STATUTS_PAIEMENT = [
  { valeur: "en_attente", label: "En attente", color: "secondary", description: "En attente de paiement" },
  { valeur: "preuve_fournie", label: "Preuve fournie", color: "default", description: "Preuve de paiement reçue" },
  { valeur: "en_verification", label: "En vérification", color: "default", description: "Vérification en cours" },
  { valeur: "valide", label: "Validé", color: "default", description: "Paiement validé" },
  { valeur: "rejete", label: "Rejeté", color: "destructive", description: "Paiement rejeté" },
];

const GestionStatuts = () => {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStatut, setEditingStatut] = useState<Statut | null>(null);
  const [newStatut, setNewStatut] = useState({
    type: "plantation",
    valeur: "",
    label: "",
    description: "",
    color: "default",
  });

  const handleSaveStatut = () => {
    toast({
      title: "Statut enregistré",
      description: "Le statut a été enregistré avec succès",
    });
    setIsDialogOpen(false);
    setEditingStatut(null);
    setNewStatut({
      type: "plantation",
      valeur: "",
      label: "",
      description: "",
      color: "default",
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gestion des Statuts</CardTitle>
              <CardDescription>
                Gérer les statuts des différentes entités du système
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouveau Statut
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingStatut ? "Modifier le statut" : "Nouveau statut"}
                  </DialogTitle>
                  <DialogDescription>
                    Définir un nouveau statut pour le système
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type d'entité</Label>
                    <Select 
                      value={newStatut.type}
                      onValueChange={(value) => setNewStatut({...newStatut, type: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plantation">Plantation</SelectItem>
                        <SelectItem value="client">Client</SelectItem>
                        <SelectItem value="paiement">Paiement</SelectItem>
                        <SelectItem value="ticket">Ticket</SelectItem>
                        <SelectItem value="commission">Commission</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valeur technique</Label>
                    <Input 
                      placeholder="ex: en_production"
                      value={newStatut.valeur}
                      onChange={(e) => setNewStatut({...newStatut, valeur: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Libellé</Label>
                    <Input 
                      placeholder="ex: En Production"
                      value={newStatut.label}
                      onChange={(e) => setNewStatut({...newStatut, label: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input 
                      placeholder="Description du statut"
                      value={newStatut.description}
                      onChange={(e) => setNewStatut({...newStatut, description: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Couleur</Label>
                    <Select 
                      value={newStatut.color}
                      onValueChange={(value) => setNewStatut({...newStatut, color: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Par défaut (vert)</SelectItem>
                        <SelectItem value="secondary">Secondaire (gris)</SelectItem>
                        <SelectItem value="destructive">Destructif (rouge)</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSaveStatut}>
                    Enregistrer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="plantation">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="plantation">Plantations</TabsTrigger>
              <TabsTrigger value="client">Clients</TabsTrigger>
              <TabsTrigger value="paiement">Paiements</TabsTrigger>
            </TabsList>
            
            <TabsContent value="plantation" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statut</TableHead>
                      <TableHead>Valeur</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATUTS_PLANTATION.map((statut, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={statut.color as any}>{statut.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{statut.valeur}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{statut.description}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="client" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statut</TableHead>
                      <TableHead>Valeur</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATUTS_CLIENT.map((statut, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={statut.color as any}>{statut.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{statut.valeur}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{statut.description}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="paiement" className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statut</TableHead>
                      <TableHead>Valeur</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATUTS_PAIEMENT.map((statut, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={statut.color as any}>{statut.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded">{statut.valeur}</code>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{statut.description}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default GestionStatuts;
