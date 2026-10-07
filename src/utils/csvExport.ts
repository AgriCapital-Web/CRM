/**
 * CSV Export utility for offline data
 * Exports IndexedDB cached data to downloadable CSV files
 */

type ColumnDef = { key: string; label: string; format?: (val: any) => string };

const CLIENT_COLUMNS: ColumnDef[] = [
  { key: 'id_unique', label: 'ID' },
  { key: 'civilite', label: 'Civilité' },
  { key: 'nom_complet', label: 'Nom complet' },
  { key: 'nom_famille', label: 'Nom de famille' },
  { key: 'prenoms', label: 'Prénoms' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'date_naissance', label: 'Date de naissance' },
  { key: 'lieu_naissance', label: 'Lieu de naissance' },
  { key: 'statut_marital', label: 'Statut marital' },
  { key: 'type_piece', label: 'Type pièce' },
  { key: 'numero_piece', label: 'N° pièce' },
  { key: 'domicile', label: 'Domicile' },
  { key: 'nombre_plantations', label: 'Nb plantations' },
  { key: 'total_hectares', label: 'Total hectares' },
  { key: 'statut', label: 'Statut' },
  { key: 'created_at', label: 'Date création', format: formatDate },
];

const PLANTATION_COLUMNS: ColumnDef[] = [
  { key: 'id_unique', label: 'ID' },
  { key: 'nom_plantation', label: 'Nom plantation' },
  { key: 'superficie_ha', label: 'Superficie (ha)' },
  { key: 'superficie_activee', label: 'Superficie activée (ha)' },
  { key: 'variete', label: 'Variété' },
  { key: 'nombre_plants', label: 'Nb plants' },
  { key: 'age_plants', label: 'Âge plants' },
  { key: 'village', label: 'Village' },
  { key: 'localisation_gps_lat', label: 'Latitude' },
  { key: 'localisation_gps_lng', label: 'Longitude' },
  { key: 'montant_da', label: 'Montant DI' },
  { key: 'montant_da_paye', label: 'DI payé' },
  { key: 'montant_contribution_mensuelle', label: 'Contribution mensuelle' },
  { key: 'statut', label: 'Statut' },
  { key: 'statut_global', label: 'Statut global' },
  { key: 'date_activation', label: 'Date activation' },
  { key: 'derniere_visite', label: 'Dernière visite' },
  { key: 'prochaine_visite', label: 'Prochaine visite' },
  { key: 'created_at', label: 'Date création', format: formatDate },
];

const PAIEMENT_COLUMNS: ColumnDef[] = [
  { key: 'reference', label: 'Référence' },
  { key: 'type_paiement', label: 'Type' },
  { key: 'montant', label: 'Montant' },
  { key: 'montant_paye', label: 'Montant payé' },
  { key: 'mode_paiement', label: 'Mode' },
  { key: 'statut', label: 'Statut' },
  { key: 'date_paiement', label: 'Date paiement', format: formatDate },
  { key: 'date_echeance', label: 'Date échéance' },
  { key: 'notes', label: 'Notes' },
  { key: 'created_at', label: 'Date création', format: formatDate },
];

function formatDate(val: any): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('fr-FR'); } catch { return String(val); }
}

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Neutralise l'injection de formules (Excel/Sheets) : préfixe ' devant =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(data: any[], columns: ColumnDef[]): string {
  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const rows = data.map(item =>
    columns.map(col => {
      const val = item[col.key];
      const formatted = col.format ? col.format(val) : val;
      return escapeCSV(formatted);
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export type ExportType = 'clients' | 'plantations' | 'paiements';

const EXPORT_CONFIG: Record<ExportType, { columns: ColumnDef[]; label: string }> = {
  clients: { columns: CLIENT_COLUMNS, label: 'Clients' },
  plantations: { columns: PLANTATION_COLUMNS, label: 'Plantations' },
  paiements: { columns: PAIEMENT_COLUMNS, label: 'Paiements' },
};

export async function exportToCSV(type: ExportType, data: any[]): Promise<{ success: boolean; count: number }> {
  const config = EXPORT_CONFIG[type];
  if (!config) throw new Error(`Type d'export inconnu: ${type}`);
  if (!data.length) return { success: false, count: 0 };

  const csv = generateCSV(data, config.columns);
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `${config.label}_${date}.csv`);
  return { success: true, count: data.length };
}

export async function exportAllOfflineData() {
  const { getCachedClients, getCachedPlantations, getCachedItems, STORES } = await import('@/lib/offlineDb');
  
  const results: Record<string, { success: boolean; count: number }> = {};
  
  const [clients, plantations, paiements] = await Promise.all([
    getCachedClients(),
    getCachedPlantations(),
    getCachedItems(STORES.PAIEMENTS),
  ]);

  if (clients.length) results.clients = await exportToCSV('clients', clients);
  if (plantations.length) results.plantations = await exportToCSV('plantations', plantations);
  if (paiements.length) results.paiements = await exportToCSV('paiements', paiements);

  return results;
}

export { EXPORT_CONFIG };
