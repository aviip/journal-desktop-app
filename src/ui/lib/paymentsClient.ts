type CreateOrderResponse =
  | {
      ok: true;
      keyId: string;
      orderId: string;
      amount: number;
      currency: string;
      productName: string;
    }
  | { ok: false; error: string };

type VerifyResponse = { ok: true } | { ok: false; error: string };

const DEFAULT_API_URL = "http://localhost:8787";

function apiUrl(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_PAYMENTS_API_URL;
  return fromEnv || DEFAULT_API_URL;
}

export async function createExportOrder(receipt: string): Promise<CreateOrderResponse> {
  const resp = await fetch(`${apiUrl()}/api/create-order`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ receipt }),
  });
  return (await resp.json()) as CreateOrderResponse;
}

export async function verifyPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<VerifyResponse> {
  const resp = await fetch(`${apiUrl()}/api/verify-payment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await resp.json()) as VerifyResponse;
}

