import { useEffect, useRef, useCallback } from 'react';


declare global {
  interface Window {
    openKkiapayWidget?: (config: KkiapayConfig) => void;
    addSuccessListener?: (callback: (data: any) => void) => void;
    addFailedListener?: (callback: (data: any) => void) => void;
    addKkiapayCloseListener?: (callback: () => void) => void;
    addKkiapayListener?: (event: string, callback: (data: any) => void) => void;
    removeKkiapayListener?: (event: string, callback: (data: any) => void) => void;
  }
}

export interface KkiapayConfig {
  amount: number;
  key: string;
  sandbox?: boolean;
  email?: string;
  phone?: string;
  name?: string;
  callback?: string;
  data?: Record<string, any>;
  theme?: string;
  countries?: string[];
  paymentMethods?: string[];
  paymentmethod?: string[];
  position?: 'left' | 'right' | 'center';
}

export interface KkiapayResponse {
  transactionId: string;
  isPaymentSucces?: boolean;
  account?: string;
  label?: string;
  method?: string;
  amount?: number;
  fees?: number;
  partnerId?: string;
  performedAt?: string;
  stateData?: Record<string, any>;
  event?: string;
}
export interface KkiapayError { reason: string; error?: string; }

const KKIAPAY_PUBLIC_KEY =
  import.meta.env.VITE_KKIAPAY_PUBLIC_KEY ||
  '193bbb7e7387d1c3ac16ced9d47fe52fad2b228e';

const KKIAPAY_SCRIPT_SRC = 'https://cdn.kkiapay.me/k.js';

export const useKkiapay = () => {
  const scriptLoaded = useRef(false);
  const loadPromise = useRef<Promise<boolean> | null>(null);
  const listenersAttached = useRef(false);
  const successCallback = useRef<((response: KkiapayResponse) => void) | null>(null);
  const failedCallback = useRef<((error: KkiapayError) => void) | null>(null);
  const closeCallback = useRef<(() => void) | null>(null);

  const attachListeners = useCallback(() => {
    if (listenersAttached.current || typeof window === 'undefined') return;

    const success = (response: KkiapayResponse) => successCallback.current?.(response);
    const failed = (error: KkiapayError) => failedCallback.current?.(error);
    const close = () => closeCallback.current?.();

    if (window.addSuccessListener) window.addSuccessListener(success);
    else if (window.addKkiapayListener) window.addKkiapayListener('success', success);

    if (window.addFailedListener) window.addFailedListener(failed);
    else if (window.addKkiapayListener) window.addKkiapayListener('failed', failed);

    if (window.addKkiapayCloseListener) window.addKkiapayCloseListener(close);
    else if (window.addKkiapayListener) window.addKkiapayListener('close', close);

    listenersAttached.current = true;
  }, []);

  const ensureLoaded = useCallback(() => {
    if (typeof window === 'undefined') return Promise.resolve(false);

    if (window.openKkiapayWidget) {
      scriptLoaded.current = true;
      attachListeners();
      return Promise.resolve(true);
    }

    if (loadPromise.current) return loadPromise.current;

    loadPromise.current = new Promise<boolean>((resolve) => {
      let settled = false;
      let pollTimer: number | undefined;
      let timeoutTimer: number | undefined;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        if (pollTimer) window.clearInterval(pollTimer);
        if (timeoutTimer) window.clearTimeout(timeoutTimer);
        scriptLoaded.current = ok;
        if (ok) attachListeners();
        resolve(ok);
      };

      const checkReady = () => {
        if (window.openKkiapayWidget) finish(true);
      };

      const existing = document.querySelector(
        `script[src="${KKIAPAY_SCRIPT_SRC}"]`
      ) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener('load', checkReady, { once: true });
        existing.addEventListener('error', () => finish(false), { once: true });
        pollTimer = window.setInterval(checkReady, 100);
        timeoutTimer = window.setTimeout(() => finish(false), 15000);
        checkReady();
        return;
      }

      const script = document.createElement('script');
      script.src = KKIAPAY_SCRIPT_SRC;
      script.async = true;
      script.onload = checkReady;
      script.onerror = () => finish(false);
      document.body.appendChild(script);

      pollTimer = window.setInterval(checkReady, 100);
      timeoutTimer = window.setTimeout(() => finish(false), 15000);
    });

    return loadPromise.current;
  }, [attachListeners]);

  useEffect(() => { void ensureLoaded(); }, [ensureLoaded]);

  const openPayment = useCallback(async (config: Omit<KkiapayConfig, 'key'>) => {
    const ready = await ensureLoaded();
    if (!ready || !window.openKkiapayWidget) return false;

    const amount = Math.round(Number(config.amount) || 0);
    if (amount <= 0) return false;

    try {
      const paymentMethods = config.paymentMethods || config.paymentmethod || ['momo', 'card'];

      window.openKkiapayWidget({
        ...config,
        amount,
        key: KKIAPAY_PUBLIC_KEY,
        sandbox: false,
        position: config.position || 'center',
        countries: config.countries || ['CI'],
        paymentMethods,
        paymentmethod: paymentMethods,
        theme: config.theme || '#00643C',
      });

      return true;
    } catch (error) {
      console.error('Erreur ouverture widget KKiaPay:', error);
      return false;
    }
  }, [ensureLoaded]);

  const onSuccess = useCallback((callback: (response: KkiapayResponse) => void) => {
    successCallback.current = callback;
  }, []);

  const onFailed = useCallback((callback: (error: KkiapayError) => void) => {
    failedCallback.current = callback;
  }, []);

  const onClose = useCallback((callback: () => void) => {
    closeCallback.current = callback;
  }, []);

  return { openPayment, onSuccess, onFailed, onClose, isLoaded: scriptLoaded.current };
};

export default useKkiapay;
