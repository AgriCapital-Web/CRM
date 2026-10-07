import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

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
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const rows = (data as Notification[]) || [];
      seenIds.current = new Set(rows.map(n => n.id));
      setNotifications(rows);
      setUnreadCount(rows.filter((n: Notification) => !n.read).length || 0);
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
          
          // Notification native navigateur si l'utilisateur l'a déjà autorisée.
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(newNotification.title, {
                body: newNotification.message,
                icon: '/logo-agricapital.png',
                tag: newNotification.id,
                data: newNotification.data || {},
              });
            } catch (error) { console.warn("[Notifications] notification navigateur indisponible", error); }
          }
          toast({ title: newNotification.title, description: newNotification.message });
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
    const { error } = await (supabase as any)
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return;
    }

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const { error } = await (supabase as any)
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) {
      console.error('Error marking all as read:', error);
      return;
    }

    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const openNotification = (notification: Notification) => {
    if (!notification.read) void markAsRead(notification.id);
    const route = notification.data?.route;
    const ticketId = notification.data?.ticket_id;
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
