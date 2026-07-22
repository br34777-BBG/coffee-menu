const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

function formatMoney(amount, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format((amount || 0) / 100);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendOrderEmail(session, lineItems) {
  const customerName =
    session.customer_details?.name || "Not provided";

  const customerEmail =
    session.customer_details?.email || "Not provided";

  const customerPhone =
    session.customer_details?.phone || "Not provided";

  const specialRequests =
    session.metadata?.special_requests || "None";

  const itemRows = lineItems.data
    .map((item) => {
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">
            ${escapeHtml(item.description)}
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">
            ${item.quantity}
          </td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">
            ${formatMoney(item.amount_total, session.currency)}
          </td>
        </tr>
      `;
    })
    .join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `coffee-order-${session.id}`
    },
    body: JSON.stringify({
      from: "Bee & Gee's Orders <onboarding@resend.dev>",
      to: ["br34777@gmail.com"],
      subject: `New paid coffee order — ${formatMoney(
        session.amount_total,
        session.currency
      )}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;">
          <h1>New Paid Coffee Order</h1>

          <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
          <p><strong>Email:</strong> ${escapeHtml(customerEmail)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(customerPhone)}</p>

          <table style="width:100%;border-collapse:collapse;margin-top:20px;">
            <thead>
              <tr>
                <th style="padding:8px;text-align:left;border-bottom:2px solid #333;">
                  Item
                </th>
                <th style="padding:8px;text-align:center;border-bottom:2px solid #333;">
                  Qty
                </th>
                <th style="padding:8px;text-align:right;border-bottom:2px solid #333;">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>

          <p style="font-size:18px;margin-top:20px;">
            <strong>Total paid:</strong>
            ${formatMoney(session.amount_total, session.currency)}
          </p>

          <p>
            <strong>Special requests:</strong><br>
            ${escapeHtml(specialRequests)}
          </p>

          <p style="font-size:12px;color:#666;margin-top:30px;">
            Stripe session: ${escapeHtml(session.id)}
          </p>
        </div>
      `
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${JSON.stringify(result)}`
    );
  }

  console.log("ORDER EMAIL SENT", result);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      error: "Missing Stripe signature."
    });
  }

  try {
    const rawBody = await readRawBody(req);

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.payment_status === "paid") {
        const lineItems =
          await stripe.checkout.sessions.listLineItems(
            session.id,
            {
              limit: 100
            }
          );

        console.log("PAID COFFEE ORDER RECEIVED", {
          checkoutSessionId: session.id,
          customerName:
            session.customer_details?.name || "Not provided",
          customerEmail:
            session.customer_details?.email || "Not provided",
          customerPhone:
            session.customer_details?.phone || "Not provided",
          totalPaid: session.amount_total,
          currency: session.currency,
          specialRequests:
            session.metadata?.special_requests || "None",
          items: lineItems.data.map((item) => ({
            name: item.description,
            quantity: item.quantity,
            amountTotal: item.amount_total
          }))
        });

        await sendOrderEmail(session, lineItems);
      } else {
        console.log(
          "Checkout completed, but payment is still pending:",
          session.id
        );
      }
    }

    return res.status(200).json({
      received: true
    });
  } catch (error) {
    console.error(
      "Stripe webhook error:",
      error.message
    );

    return res.status(400).json({
      error: `Webhook error: ${error.message}`
    });
  }
};
