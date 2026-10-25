import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [pushConfig, setPushConfig] = useState<{ supported: boolean; public_key: string } | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const autoEnableAttempted = useRef(false);

  useEffect(() => {
    // Vérifier si les notifications sont supportées
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      // Préparer le service worker et la clé VAPID avant le clic utilisateur.
      // Cela évite d'attendre une requête réseau au milieu du geste d'activation,
      // ce qui peut faire échouer PushManager.subscribe sur certains navigateurs.
      void navigator.serviceWorker.ready.then(async (registration) => {
        registrationRef.current = registration;
        setPushEnabled(Boolean(await registration.pushManager.getSubscription()) && Notification.permission === 'granted');
      }).catch(() => setPushEnabled(false));

      void supabase.functions.invoke("push-subscriptions", { body: { action: "config" } })
        .then(({ data, error }) => {
          if (!error && data?.supported && typeof data?.public_key === "string" && data.public_key.length > 0) {
            setPushConfig({ supported: true, public_key: data.public_key });
          } else {
            console.warn("[Push] configuration indisponible", error || data);
          }
        })
        .catch((error) => console.warn("[Push] préparation configuration", error));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) { toast({ variant: "destructive", title: "Non supporté", description: "Les notifications push ne sont pas prises en charge sur cet appareil." }); return false; }
    try { const result = await Notification.requestPermission(); setPermission(result); if (result !== "granted") { toast({ variant: "destructive", title: "Notifications refusées", description: "Autorisez-les dans les paramètres du navigateur." }); return false; } return true; }
    catch (error) { console.error("[Push] permission", error); return false; }
  }, [isSupported, toast]);

  const enablePush = useCallback(async () => {
    if (!isSupported || isEnabling) return false;
    // Éviter toute requête réseau après le clic : certains navigateurs Android
    // refusent l'abonnement push si le geste utilisateur a expiré.
    if (!pushConfig?.supported || !pushConfig.public_key || !registrationRef.current?.active) {
      toast({ title: "Préparation des notifications", description: "Le service est en cours de préparation. Patientez quelques secondes puis réessayez." });
      return false;
    }
    setIsEnabling(true);
    try {
      const allowed = permission === "granted" || await requestPermission(); if (!allowed) return false;
      let registration = registrationRef.current;
      if (!registration?.active) throw new Error("Le service worker n'est pas encore actif. Rechargez AC_Teams puis réessayez.");
      const config = pushConfig;
      const applicationServerKey = decodeVapidKey(String(config.public_key).trim());
      if (applicationServerKey.byteLength !== 65 || new Uint8Array(applicationServerKey)[0] !== 4) {
        throw new Error("La clé publique VAPID fournie par le serveur est invalide. Vérifiez la configuration des notifications.");
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        } catch (firstError: any) {
          const message = String(firstError?.message || "");
          const pushServiceUnavailable = /push service error|registration failed/i.test(message);
          if (!pushServiceUnavailable) throw firstError;

          // Une première tentative peut échouer si le service worker ou le service push
          // du navigateur vient de se réveiller. Actualiser l'enregistrement et réessayer une fois.
          await registration.update().catch(() => undefined);
          registration = await navigator.serviceWorker.ready;
          subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        }
      }
      const { error } = await supabase.functions.invoke("push-subscriptions", { body: { action: "subscribe", subscription: subscription.toJSON() } });
      if (error) throw error; setPermission("granted"); setPushEnabled(true);
      toast({ title: "Notifications activées", description: "Les alertes peuvent apparaître même lorsque le CRM est fermé, selon les réglages de l'appareil." }); return true;
    } catch (error: any) {
      console.error("[Push] activation", error);
      const rawMessage = String(error?.message || "");
      const description = /push service error|registration failed/i.test(rawMessage)
        ? "Le service de notifications du navigateur ne répond pas. Vérifiez votre connexion, ouvrez AC_Teams dans Chrome à jour, puis réessayez. Si l’erreur persiste, le service push de l’appareil est temporairement indisponible."
        : rawMessage || "Impossible d'activer les notifications.";
      toast({ variant: "destructive", title: "Activation impossible", description });
      return false;
    }
    finally { setIsEnabling(false); }
  }, [isSupported, isEnabling, permission, requestPermission, toast, pushConfig]);

  // If the OS permission was already granted, restore the server subscription automatically
  // after install/relaunch. Browsers still require explicit consent for a first-time permission.
  useEffect(() => {
    if (!isSupported || permission !== "granted" || !pushConfig?.supported || pushEnabled || isEnabling || autoEnableAttempted.current) return;
    autoEnableAttempted.current = true;
    void enablePush();
  }, [isSupported, permission, pushConfig, pushEnabled, isEnabling, enablePush]);

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
    pushConfigReady: Boolean(pushConfig?.supported && pushConfig.public_key),
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
