type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  name: string;
  description?: string;
  order_id: string;
  amount?: number;
  currency?: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

let loadPromise: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<void> {
  const ok = await loadRazorpay();
  if (!ok || !window.Razorpay) throw new Error("Razorpay SDK failed to load");
  const rzp = new window.Razorpay(options);
  rzp.open();
}

