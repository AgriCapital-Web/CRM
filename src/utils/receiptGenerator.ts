import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReceiptData {
  reference: string;
  date: Date;
  acquereurNom: string;
  acquereurTelephone: string;
  plantationNom: string;
  typePaiement: string;
  montant: number;
  modePaiement: string;
  statut: string;
}

export const generatePaymentReceiptHTML = (data: ReceiptData): string => {
  const formatMontant = (m: number) => new Intl.NumberFormat("fr-FR").format(m);
  
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: white; }
        .receipt { max-width: 500px; margin: 0 auto; border: 2px solid #00643C; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #00643C; padding-bottom: 20px; }
        .logo { width: 120px; margin-bottom: 10px; }
        .company-name { color: #00643C; font-size: 24px; font-weight: bold; margin-bottom: 5px; }
        .company-slogan { color: #666; font-size: 12px; }
        .receipt-title { background: #00643C; color: white; text-align: center; padding: 15px; margin: 20px 0; font-size: 18px; font-weight: bold; letter-spacing: 2px; }
        .receipt-ref { text-align: center; font-family: monospace; color: #666; margin-bottom: 20px; font-size: 12px; }
        .info-section { margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #ddd; }
        .info-label { color: #666; font-size: 13px; }
        .info-value { font-weight: bold; color: #333; font-size: 14px; text-align: right; }
        .amount-section { background: linear-gradient(135deg, #00643C, #008f4c); color: white; padding: 25px; text-align: center; margin: 25px 0; border-radius: 10px; }
        .amount-label { font-size: 14px; opacity: 0.9; margin-bottom: 5px; }
        .amount { font-size: 32px; font-weight: bold; }
        .amount-currency { font-size: 16px; }
        .status-badge { display: inline-block; background: #4CAF50; color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; text-transform: uppercase; font-size: 12px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #00643C; text-align: center; }
        .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
        .signature-box { width: 45%; text-align: center; }
        .signature-line { border-bottom: 1px solid #333; height: 60px; margin-bottom: 5px; }
        .signature-name { font-size: 12px; color: #666; }
        .dg-signature { font-family: 'Brush Script MT', cursive; font-size: 24px; color: #00643C; margin-bottom: 5px; }
        .qr-placeholder { width: 80px; height: 80px; background: #f0f0f0; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
        .footer-text { font-size: 11px; color: #666; margin-top: 15px; }
        .contact { margin-top: 10px; font-size: 11px; color: #00643C; }
      </style>
    </head>
    <body>
      <div class="receipt" id="receipt">
        <div class="header">
          <div class="company-name">🌴 AGRICAPITAL</div>
          <div class="company-slogan">Le partenaire idéal des producteurs agricoles</div>
        </div>
        
        <div class="receipt-title">REÇU DE PAIEMENT</div>
        
        <div class="receipt-ref">Réf: ${data.reference}</div>
        
        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Date</span>
            <span class="info-value">${format(data.date, "dd MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Acquéreur</span>
            <span class="info-value">${data.acquereurNom}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Téléphone</span>
            <span class="info-value">${data.acquereurTelephone}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Plantation</span>
            <span class="info-value">${data.plantationNom}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Type</span>
            <span class="info-value">${data.typePaiement}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Mode de paiement</span>
            <span class="info-value">${data.modePaiement}</span>
          </div>
        </div>
        
        <div class="amount-section">
          <div class="amount-label">Montant payé</div>
          <div class="amount">${formatMontant(data.montant)} <span class="amount-currency">F CFA</span></div>
        </div>
        
        <div style="text-align: center; margin: 20px 0;">
          <span class="status-badge">✓ ${data.statut === 'valide' ? 'VALIDÉ' : data.statut.toUpperCase()}</span>
        </div>
        
        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-name">Cachet du Client</div>
          </div>
          <div class="signature-box">
            <div class="dg-signature">I. Koffi</div>
            <div class="signature-name">Inocent KOFFI - PDG</div>
            <div style="font-size: 10px; color: #999;">Signature électronique</div>
          </div>
        </div>
        
        <div class="footer">
          <div class="qr-placeholder">QR CODE</div>
          <div class="footer-text">
            Ce reçu fait foi de paiement. Conservez-le précieusement.
          </div>
          <div class="contact">
            📞 +225 05 64 55 17 17 | 🌐 www.agricapital.ci
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const downloadReceiptAsPDF = async (data: ReceiptData): Promise<void> => {
  // Créer un iframe caché pour le rendu
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.left = '-9999px';
  iframe.style.width = '600px';
  iframe.style.height = '900px';
  document.body.appendChild(iframe);
  
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not access iframe document');
  }
  
  iframeDoc.open();
  iframeDoc.write(generatePaymentReceiptHTML(data));
  iframeDoc.close();
  
  // Attendre le chargement
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const receiptElement = iframeDoc.getElementById('receipt');
  if (!receiptElement) {
    document.body.removeChild(iframe);
    throw new Error('Receipt element not found');
  }
  
  try {
    const canvas = await html2canvas(receiptElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });
    
    // Télécharger comme image (simulation PDF)
    const link = document.createElement('a');
    link.download = `recu-${data.reference}-${format(data.date, 'yyyy-MM-dd')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    document.body.removeChild(iframe);
  }
};

export const printReceipt = (data: ReceiptData): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Veuillez autoriser les popups pour imprimer le reçu');
    return;
  }
  
  printWindow.document.write(generatePaymentReceiptHTML(data));
  printWindow.document.close();
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
};