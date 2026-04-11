import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 8787);

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";

const PRODUCT_NAME = process.env.PRODUCT_NAME ?? "Journal App";
const EXPORT_PRICE_INR_PAISE = Number(process.env.EXPORT_PRICE_INR_PAISE ?? 9900); // ₹99.00

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function createOrder(receipt) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
  }

  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const resp = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: EXPORT_PRICE_INR_PAISE,
      currency: "INR",
      receipt,
      notes: { product: "export_unlock", app: PRODUCT_NAME },
    }),
  });

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Razorpay error: ${resp.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function verifySignature({ orderId, paymentId, signature }) {
  if (!RAZORPAY_KEY_SECRET) throw new Error("Missing RAZORPAY_KEY_SECRET");
  const h = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return timingSafeEqual(h, signature);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return json(res, 200, { ok: true });

    if (req.url === "/health" && req.method === "GET") {
      return json(res, 200, { ok: true });
    }

    if (req.url === "/api/create-order" && req.method === "POST") {
      const body = await readJson(req);
      const receipt = typeof body.receipt === "string" ? body.receipt : `export-${Date.now()}`;
      const order = await createOrder(receipt);
      return json(res, 200, {
        ok: true,
        keyId: RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        productName: PRODUCT_NAME,
      });
    }

    if (req.url === "/api/verify-payment" && req.method === "POST") {
      const body = await readJson(req);
      const orderId = String(body.orderId ?? "");
      const paymentId = String(body.paymentId ?? "");
      const signature = String(body.signature ?? "");

      if (!orderId || !paymentId || !signature) {
        return json(res, 400, { ok: false, error: "Missing fields" });
      }

      const ok = verifySignature({ orderId, paymentId, signature });
      if (!ok) return json(res, 400, { ok: false, error: "Invalid signature" });

      return json(res, 200, { ok: true });
    }

    return json(res, 404, { ok: false, error: "Not found" });
  } catch (e) {
    return json(res, 500, { ok: false, error: e instanceof Error ? e.message : "error" });
  }
});

server.listen(PORT, () => {
  console.log(`payments server listening on http://localhost:${PORT}`);
});
