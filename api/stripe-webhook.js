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
