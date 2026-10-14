import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

// Module-level registry shared by desktop/mobile notification centers.
const realtimeSideEffectsSeen = new Map<string, number>();
const claimRealtimeSideEffect = (id: string) => {
  const now = Date.now();
  for (const [key, timestamp] of realtimeSideEffectsSeen) if (now - timestamp > 30000) realtimeSideEffectsSeen.delete(key);
  if (realtimeSideEffectsSeen.has(id)) return false;
  realtimeSideEffectsSeen.set(id, now); return true;
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
}

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const seenIds = useRef<Set<string>>(new Set());

  const fetchNotifications = async () => {
    if (!user) return;

    try {
      const [{ data, error }, { count: unreadTotal, error: countError }] = await Promise.all([
        (supabase as any).from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        (supabase as any).from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .or('read.eq.false,read.is.null'),
      ]);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const rows = (data as Notification[]) || [];
      seenIds.current = new Set(rows.map(n => n.id));
      setNotifications(rows);
      setUnreadCount(countError ? rows.filter((n: Notification) => !n.read).length : (unreadTotal || 0));
    } catch (error) {
      console.error('Error:', error);
    }
  };

  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // Subscribe to realtime notifications
    // Subscribe to realtime notifications (unique channel per hook instance:
    // plusieurs NotificationCenter peuvent être montés simultanément - sidebar + sheet mobile)
    const channel = supabase
      .channel(`notifications-changes-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (seenIds.current.has(newNotification.id)) return;
          seenIds.current.add(newNotification.id);
          setNotifications(prev => [newNotification, ...prev.filter(n => n.id !== newNotification.id)]);
          setUnreadCount(prev => prev + (newNotification.read ? 0 : 1));
          
          // Le layout CRM monte le centre de notifications dans les vues desktop et mobile.
          // Les deux abonnements reçoivent le même INSERT : une seule instance doit déclencher
          // les effets visibles (toast / notification navigateur), sinon l'utilisateur voit un doublon.
          if (claimRealtimeSideEffect(`${user.id}:${newNotification.id}`) && document.visibilityState === "visible") {
            // The service worker displays the server Web Push when the app is in
            // the background. Realtime only displays the in-app toast, so one
            // event can never create both a browser notification and a toast-driven push.
            toast({ title: newNotification.title, description: newNotification.message });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setNotifications(prev => 
            prev.map(n => n.id === payload.new.id ? payload.new as Notification : n)
          );
          fetchNotifications(); // Refresh to update unread count
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = async (notificationId: string) => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .or('read.eq.false,read.is.null')
      .select('id');

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    if ((data || []).length > 0) setUnreadCount(prev => Math.max(0, prev - 1));
    else void fetchNotifications();
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const { error } = await (supabase as any)
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .or('read.eq.false,read.is.null');

    if (error) {
      console.error('Error marking all as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const openNotification = (notification: Notification) => {
    if (!notification.read) void markAsRead(notification.id);
    const data = notification.data || {};
    const route = data.route;
    const ticketId = data.ticket_id;
    const clientId = data.client_id || data.clientId || data.client?.id || data.sender_client_id;
    const type = String(notification.type || "").toLowerCase();
    const title = String(notification.title || "").toLowerCase();
    const message = String(notification.message || "").toLowerCase();
    const routeIsMessaging = String(route || "").toLowerCase().includes("messagerie");
    const isMessageNotification = type.includes("message") || routeIsMessaging ||
      data.source === "portail_messages" || title.includes("message") || message.includes("message");
    if (isMessageNotification && clientId) {
      navigate(`/messagerie?client=${encodeURIComponent(String(clientId))}`);
      return;
    }
    if (route) navigate(ticketId ? `${route}?ticket=${ticketId}` : route);
  };

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    openNotification,
    refetch: fetchNotifications
  };
};
