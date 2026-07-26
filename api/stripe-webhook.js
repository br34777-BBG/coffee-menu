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
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildItemRows(session, lineItems) {
  return lineItems.data
    .map((item) => {
      return `
        <tr>
          <td style="
            padding:10px 8px;
            border-bottom:1px solid #ddd;
          ">
            ${escapeHtml(item.description)}
          </td>

          <td style="
            padding:10px 8px;
            border-bottom:1px solid #ddd;
            text-align:center;
          ">
            ${item.quantity}
          </td>

          <td style="
            padding:10px 8px;
            border-bottom:1px solid #ddd;
            text-align:right;
          ">
            ${formatMoney(
              item.amount_total,
              session.currency
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

async function sendResendEmail({
  to,
  subject,
  html,
  idempotencyKey
}) {
  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey
      },

      body: JSON.stringify({
        /*
         * IMPORTANT:
         *
         * This is fine while testing.
         *
         * Once you verify your own domain in Resend,
         * change this to something like:
         *
         * Bee & Gee's <orders@yourdomain.com>
         */
        from:
          "Bee & Gee's Beans & Greens <onboarding@resend.dev>",

        to: Array.isArray(to) ? to : [to],

        subject,

        html
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${JSON.stringify(result)}`
    );
  }

  return result;
}

async function sendOwnerOrderEmail(
  session,
  lineItems
) {
  const customerName =
    session.customer_details?.name ||
    "Not provided";

  const customerEmail =
    session.customer_details?.email ||
    "Not provided";

  const customerPhone =
    session.customer_details?.phone ||
    "Not provided";

  const specialRequests =
    session.metadata?.special_requests ||
    "None";

  const itemRows =
    buildItemRows(session, lineItems);

  const result = await sendResendEmail({
    to: "br34777@gmail.com",

    subject:
      `New paid coffee order — ${formatMoney(
        session.amount_total,
        session.currency
      )}`,

    idempotencyKey:
      `coffee-owner-${session.id}`,

    html: `
      <div style="
        font-family:Arial,sans-serif;
        max-width:680px;
        margin:auto;
        color:#222;
      ">

        <h1>
          New Paid Coffee Order
        </h1>

        <p>
          <strong>Customer:</strong>
          ${escapeHtml(customerName)}
        </p>

        <p>
          <strong>Email:</strong>
          ${escapeHtml(customerEmail)}
        </p>

        <p>
          <strong>Phone:</strong>
          ${escapeHtml(customerPhone)}
        </p>

        <table style="
          width:100%;
          border-collapse:collapse;
          margin-top:20px;
        ">
          <thead>
            <tr>
              <th style="
                padding:8px;
                text-align:left;
                border-bottom:2px solid #333;
              ">
                Item
              </th>

              <th style="
                padding:8px;
                text-align:center;
                border-bottom:2px solid #333;
              ">
                Qty
              </th>

              <th style="
                padding:8px;
                text-align:right;
                border-bottom:2px solid #333;
              ">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <p style="
          font-size:18px;
          margin-top:20px;
        ">
          <strong>Total paid:</strong>
          ${formatMoney(
            session.amount_total,
            session.currency
          )}
        </p>

        <p>
          <strong>Special requests:</strong>
          <br>
          ${escapeHtml(specialRequests)}
        </p>

        <p style="
          font-size:12px;
          color:#666;
          margin-top:30px;
        ">
          Stripe session:
          ${escapeHtml(session.id)}
        </p>

      </div>
    `
  });

  console.log(
    "OWNER ORDER EMAIL SENT",
    result
  );
}

async function sendCustomerReceiptEmail(
  session,
  lineItems
) {
  const customerEmail =
    session.customer_details?.email;

  /*
   * Stripe should normally supply this,
   * but don't let a missing email break
   * the entire webhook.
   */
  if (!customerEmail) {
    console.log(
      "No customer email available. Receipt skipped."
    );
    return;
  }

  const customerName =
    session.customer_details?.name ||
    "friend";

  const specialRequests =
    session.metadata?.special_requests ||
    "None";

  const itemRows =
    buildItemRows(session, lineItems);

  const result = await sendResendEmail({
    to: customerEmail,

    subject:
      "Your Bee & Gee's pour decision receipt",

    idempotencyKey:
      `coffee-customer-${session.id}`,

    html: `
      <div style="
        font-family:Georgia,Arial,sans-serif;
        max-width:680px;
        margin:auto;
        background:#11110f;
        color:#f0e3c7;
        padding:28px;
        border:1px solid #b18a45;
      ">

        <div style="
          text-align:center;
          border-bottom:1px solid #6f1e20;
          padding-bottom:20px;
          margin-bottom:24px;
        ">

          <p style="
            color:#858b4e;
            text-transform:uppercase;
            letter-spacing:2px;
            font-size:12px;
            margin-bottom:8px;
          ">
            Bee & Gee's Beans & Greens
          </p>

          <h1 style="
            color:#f0e3c7;
            margin:0;
          ">
            Your pour decision has been accepted.
          </h1>

          <p style="
            color:#d3ae68;
            font-style:italic;
          ">
            Where caffeine meets poor decisions.
          </p>

        </div>

        <p>
          Hello ${escapeHtml(customerName)},
        </p>

        <p>
          Thanks for your order.
          Here's a copy of your paid order
          for your records.
        </p>

        <table style="
          width:100%;
          border-collapse:collapse;
          margin-top:24px;
          background:#171612;
        ">

          <thead>
            <tr>
              <th style="
                padding:10px;
                text-align:left;
                border-bottom:2px solid #b18a45;
                color:#d3ae68;
              ">
                Item
              </th>

              <th style="
                padding:10px;
                text-align:center;
                border-bottom:2px solid #b18a45;
                color:#d3ae68;
              ">
                Qty
              </th>

              <th style="
                padding:10px;
                text-align:right;
                border-bottom:2px solid #b18a45;
                color:#d3ae68;
              ">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            ${itemRows}
          </tbody>

        </table>

        <p style="
          font-size:20px;
          text-align:right;
          margin-top:22px;
          color:#f0e3c7;
        ">
          <strong>Total paid:</strong>
          ${formatMoney(
            session.amount_total,
            session.currency
          )}
        </p>

        <div style="
          margin-top:24px;
          padding:16px;
          border:1px solid rgba(177,138,69,.45);
          background:#171612;
        ">

          <strong style="color:#d3ae68;">
            Special requests
          </strong>

          <p style="margin-bottom:0;">
            ${escapeHtml(specialRequests)}
          </p>

        </div>

        <p style="
          margin-top:30px;
          color:#9b927d;
          font-size:13px;
          text-align:center;
        ">
          Thanks for making another excellent
          pour decision.
        </p>

        <p style="
          color:#777;
          font-size:10px;
          text-align:center;
          margin-top:24px;
        ">
          Receipt reference:
          ${escapeHtml(session.id)}
        </p>

      </div>
    `
  });

  console.log(
    "CUSTOMER RECEIPT EMAIL SENT",
    result
  );
}

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const signature =
    req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      error: "Missing Stripe signature."
    });
  }

  try {
    const rawBody =
      await readRawBody(req);

    const event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

    if (
      event.type ===
      "checkout.session.completed"
    ) {
      const session =
        event.data.object;

      if (
        session.payment_status === "paid"
      ) {
        const lineItems =
          await stripe.checkout.sessions
            .listLineItems(
              session.id,
              {
                limit: 100
              }
            );

        console.log(
          "PAID COFFEE ORDER RECEIVED",
          {
            checkoutSessionId:
              session.id,

            customerName:
              session.customer_details
                ?.name ||
              "Not provided",

            customerEmail:
              session.customer_details
                ?.email ||
              "Not provided",

            customerPhone:
              session.customer_details
                ?.phone ||
              "Not provided",

            totalPaid:
              session.amount_total,

            currency:
              session.currency,

            specialRequests:
              session.metadata
                ?.special_requests ||
              "None",

            items:
              lineItems.data.map(
                (item) => ({
                  name:
                    item.description,

                  quantity:
                    item.quantity,

                  amountTotal:
                    item.amount_total
                })
              )
          }
        );

        /*
         * Send both messages.
         *
         * Separate idempotency keys mean
         * Resend treats these as two
         * distinct emails.
         */
        await Promise.all([
          sendOwnerOrderEmail(
            session,
            lineItems
          ),

          sendCustomerReceiptEmail(
            session,
            lineItems
          )
        ]);

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
      error:
        `Webhook error: ${error.message}`
    });
  }
};
