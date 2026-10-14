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

function decodeVapidKey(value: string): ArrayBuffer { const padded = value + "=".repeat((4 - value.length % 4) % 4); const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (character) => character.charCodeAt(0)).buffer as ArrayBuffer; }

export const usePushNotifications = () => {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    // Vérifier si les notifications sont supportées
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      void navigator.serviceWorker.ready.then(async (registration) => setPushEnabled(Boolean(await registration.pushManager.getSubscription()) && Notification.permission === 'granted')).catch(() => setPushEnabled(false));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) { toast({ variant: "destructive", title: "Non supporté", description: "Les notifications push ne sont pas prises en charge sur cet appareil." }); return false; }
    try { const result = await Notification.requestPermission(); setPermission(result); if (result !== "granted") { toast({ variant: "destructive", title: "Notifications refusées", description: "Autorisez-les dans les paramètres du navigateur." }); return false; } return true; }
    catch (error) { console.error("[Push] permission", error); return false; }
  }, [isSupported, toast]);

  const enablePush = useCallback(async () => {
    if (!isSupported || isEnabling) return false; setIsEnabling(true);
    try {
      const allowed = permission === "granted" || await requestPermission(); if (!allowed) return false;
      const registration = await navigator.serviceWorker.ready;
      const { data: config, error: configError } = await supabase.functions.invoke("push-subscriptions", { body: { action: "config" } });
      if (configError || !config?.supported || !config?.public_key) throw new Error("Le service push n'est pas configuré côté serveur.");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(config.public_key) });
      const { error } = await supabase.functions.invoke("push-subscriptions", { body: { action: "subscribe", subscription: subscription.toJSON() } });
      if (error) throw error; setPermission("granted"); setPushEnabled(true);
      toast({ title: "Notifications activées", description: "Les alertes peuvent apparaître même lorsque le CRM est fermé, selon les réglages de l'appareil." }); return true;
    } catch (error: any) { console.error("[Push] activation", error); toast({ variant: "destructive", title: "Activation impossible", description: error?.message || "Impossible d'activer les notifications." }); return false; }
    finally { setIsEnabling(false); }
  }, [isSupported, isEnabling, permission, requestPermission, toast]);

  const disablePush = useCallback(async () => {
    try { const registration = await navigator.serviceWorker.ready; const subscription = await registration.pushManager.getSubscription(); if (subscription) { await supabase.functions.invoke("push-subscriptions", { body: { action: "unsubscribe", endpoint: subscription.endpoint } }); await subscription.unsubscribe(); } setPushEnabled(false); toast({ title: "Notifications désactivées" }); return true; }
    catch (error: any) { toast({ variant: "destructive", title: "Désactivation impossible", description: error?.message || "Réessayez." }); return false; }
  }, [toast]);

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
      console.warn('[Push] affichage local indisponible', error);
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
    pushEnabled,
    isEnabling,
    enablePush,
    disablePush,
    requestPermission,
    showNotification,
    notifyPaymentSuccess,
    notifyPaymentFailed,
    notifyArrears
  };
};

export default usePushNotifications;
