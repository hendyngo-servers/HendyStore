import { createAuthClient } from "@neondatabase/auth";
import { createRealtimeClient } from "@neon/realtime/client";

const apiUrl = new URL("api.php", document.baseURI);

async function loadNeonClientConfig() {
  const url = new URL(apiUrl);
  url.searchParams.set("action", "client_config");
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Neon client configuration is unavailable.");
  }
  return result.data;
}

const ready = (async () => {
  const config = await loadNeonClientConfig();
  const auth = config.authEnabled && config.authUrl ? createAuthClient(config.authUrl) : null;
  let realtimeClient = null;
  let liveSubscription = null;
  let renewTimer = null;
  let subscribed = false;

  async function getToken() {
    if (!auth) return null;
    try {
      const result = await auth.token();
      if (result?.error) return null;
      return result?.data?.token || null;
    } catch {
      return null;
    }
  }

  async function getSealedCatalog() {
    const base = String(config.functionUrl || "").replace(/\/+$/, "");
    if (!base) throw new Error("Neon Function URL is not configured.");
    const response = await fetch(base + "/catalog-live", {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();
    if (!response.ok || !payload.sealed) {
      throw new Error(payload.error || "Unable to seal the live catalog query.");
    }
    return payload.sealed;
  }

  async function subscribeCatalog() {
    if (subscribed) return true;
    if (!config.realtimeEnabled || !config.realtimeUrl || !config.functionUrl) return false;

    try {
      realtimeClient = createRealtimeClient({ url: config.realtimeUrl });
      const sealed = await getSealedCatalog();
      liveSubscription = realtimeClient.subscribe(sealed);

      const snapshot = await liveSubscription.getSnapshot();
      window.dispatchEvent(new CustomEvent("hendy:catalog-live", {
        detail: snapshot?.data ?? snapshot,
      }));

      liveSubscription.onChange(({ data }) => {
        window.dispatchEvent(new CustomEvent("hendy:catalog-live", { detail: data }));
      });
      liveSubscription.onStateChange?.((state) => {
        if (state?.status === "error" || state?.error) {
          window.dispatchEvent(new CustomEvent("hendy:catalog-live-error"));
        }
      });

      // Neon sealed-query tokens expire. Renew with the exact same sealed query
      // before expiry; the subscription reports a final error if renewal fails.
      renewTimer = window.setInterval(async () => {
        try {
          await liveSubscription?.renew();
        } catch {
          window.clearInterval(renewTimer);
          subscribed = false;
          window.dispatchEvent(new CustomEvent("hendy:catalog-live-error"));
        }
      }, 40000);

      subscribed = true;
      return true;
    } catch (error) {
      console.warn("[Hendy Store] Neon Realtime is unavailable:", error?.message || "connection error");
      window.dispatchEvent(new CustomEvent("hendy:catalog-live-error"));
      return false;
    }
  }

  return {
    config,
    auth,
    getToken,
    async signIn(email, password) {
      if (!auth) throw new Error("Neon Auth chưa được cấu hình. Kiểm tra NEON_AUTH_BASE_URL trên Render.");
      const result = await auth.signIn.email({ email, password });
      if (result?.error) throw new Error(result.error.message || "Đăng nhập thất bại.");
      return result?.data;
    },
    async signUp(name, email, password) {
      if (!auth) throw new Error("Neon Auth chưa được cấu hình. Kiểm tra NEON_AUTH_BASE_URL trên Render.");
      const result = await auth.signUp.email({ name, email, password });
      if (result?.error) throw new Error(result.error.message || "Không thể tạo tài khoản.");
      return result?.data;
    },
    async signOut() {
      if (!auth) return;
      const result = await auth.signOut();
      if (result?.error) throw new Error(result.error.message || "Đăng xuất thất bại.");
    },
    subscribeCatalog,
  };
})();

window.HendyNeon = {
  ready,
  async getToken() {
    const client = await ready;
    return client.getToken();
  },
  async signIn(email, password) {
    const client = await ready;
    return client.signIn(email, password);
  },
  async signUp(name, email, password) {
    const client = await ready;
    return client.signUp(name, email, password);
  },
  async signOut() {
    const client = await ready;
    return client.signOut();
  },
  async subscribeCatalog() {
    const client = await ready;
    return client.subscribeCatalog();
  },
};
