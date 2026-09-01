import { useEffect } from "react";

const APP_ID = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_ONESIGNAL_APP_ID;

type OneSignalLike = {
  init: (options: { appId: string; serviceWorkerPath?: string; serviceWorkerParam?: { scope?: string } }) => Promise<void>;
  Notifications: { requestPermission: () => Promise<void>; isPushSupported: () => boolean };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalLike) => void | Promise<void>>;
  }
}

/** Initializes OneSignal Web Push only when an App ID is configured. */
export function OneSignalPush() {
  useEffect(() => {
    if (!APP_ID || typeof window === "undefined") return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId: APP_ID,
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
      });
    });

    const scriptId = "onesignal-web-sdk";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  return null;
}
