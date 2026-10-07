import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
  tag?: string;
}

export const usePushNotifications = () => {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Vérifier si les notifications sont supportées
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({
        variant: "destructive",
        title: "Non supporté",
        description: "Les notifications ne sont pas supportées sur cet appareil"
      });
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast({
          title: "Notifications activées",
          description: "Vous recevrez des alertes pour vos paiements"
        });
        return true;
      } else {
        toast({
          variant: "destructive",
          title: "Notifications refusées",
          description: "Vous pouvez les activer dans les paramètres de votre navigateur"
        });
        return false;
      }
    } catch (error) {
      console.error('Erreur permission notification:', error);
      return false;
    }
  }, [isSupported, toast]);

  const showNotification = useCallback(async (payload: NotificationPayload) => {
    if (permission !== 'granted') {
      console.log('Notifications non autorisées');
      return;
    }

    try {
      // Essayer d'utiliser le service worker pour les notifications
      const registration = await navigator.serviceWorker.ready;
      
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/logo-agricapital.png',
        badge: payload.badge || '/icons/icon-96x96.png',
        tag: payload.tag,
        data: payload.data
      } as NotificationOptions);
    } catch (error) {
      // Fallback: notification classique
      console.log('Utilisation notification classique');
      new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/logo-agricapital.png',
        tag: payload.tag
      });
    }
  }, [permission]);

  // Notification de paiement validé
  const notifyPaymentSuccess = useCallback((montant: number, reference: string) => {
    const formatted = new Intl.NumberFormat('fr-FR').format(montant);
    showNotification({
      title: '✅ Paiement validé',
      body: `Votre paiement de ${formatted} F CFA a été validé. Réf: ${reference}`,
      tag: `payment-success-${reference}`,
      data: { type: 'payment_success', reference }
    });
  }, [showNotification]);

  // Notification de paiement échoué
  const notifyPaymentFailed = useCallback((reference: string, reason?: string) => {
    showNotification({
      title: '❌ Paiement échoué',
      body: reason || `Le paiement ${reference} n'a pas pu être effectué. Veuillez réessayer.`,
      tag: `payment-failed-${reference}`,
      data: { type: 'payment_failed', reference }
    });
  }, [showNotification]);

  // Notification de rappel d'arriérés
  const notifyArrears = useCallback((montant: number, jours: number) => {
    const formatted = new Intl.NumberFormat('fr-FR').format(montant);
    showNotification({
      title: '⚠️ Rappel de paiement',
      body: `Vous avez ${jours} jour(s) d'arriérés pour un montant de ${formatted} F CFA. Régularisez votre situation.`,
      tag: 'arrears-reminder',
      data: { type: 'arrears_reminder', montant, jours }
    });
  }, [showNotification]);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    notifyPaymentSuccess,
    notifyPaymentFailed,
    notifyArrears
  };
};

export default usePushNotifications;
