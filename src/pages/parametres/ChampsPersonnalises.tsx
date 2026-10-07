import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const ChampsPersonnalises = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Champs Personnalisés</CardTitle>
          <CardDescription>
            Ajouter de nouveaux champs dans les formulaires existants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="text-sm font-semibold mb-2">Ajouter un nouveau champ</h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="formulaire_cible">Formulaire cible</Label>
                  <Select>
                    <SelectTrigger id="formulaire_cible">
                      <SelectValue placeholder="Sélectionner un formulaire" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utilisateur">Formulaire Utilisateur</SelectItem>
                      <SelectItem value="planteur">Formulaire Planteur</SelectItem>
                      <SelectItem value="plantation">Formulaire Plantation</SelectItem>
                      <SelectItem value="paiement">Formulaire Paiement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nom_champ">Nom du champ</Label>
                  <Input id="nom_champ" placeholder="Ex: Numéro CNI Témoin" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type_champ">Type de champ</Label>
                  <Select>
                    <SelectTrigger id="type_champ">
                      <SelectValue placeholder="Sélectionner le type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="texte">Texte</SelectItem>
                      <SelectItem value="nombre">Nombre</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="liste">Liste déroulante</SelectItem>
                      <SelectItem value="fichier">Fichier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter le champ
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChampsPersonnalises;
