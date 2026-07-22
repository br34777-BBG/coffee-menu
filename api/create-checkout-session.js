const Stripe = require("stripe");
const fs = require("node:fs");
const path = require("node:path");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function setCors(res, origin) {
  const allowedOrigin = "https://br34777-bbg.github.io";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function readMenu() {
  const menuPath = path.join(process.cwd(), "menu.json");
  return JSON.parse(fs.readFileSync(menuPath, "utf8"));
}

function buildCatalog(menu) {
  return [...menu.beans, ...menu.greens].reduce((catalog, drink) => {
    catalog[drink.id] = drink;
    return catalog;
  }, {});
}

function validateSelections(drink, submittedSelections = {}) {
  const validated = {};

  for (const modifier of drink.modifiers || []) {
    const submittedValue = submittedSelections[modifier.name];

    if (modifier.conditionalOn) {
      const parentValue =
        submittedSelections[modifier.conditionalOn.modifier];

      const required =
        modifier.conditionalOn.values.includes(parentValue);

      if (!required) continue;
    }

    if (!modifier.options.includes(submittedValue)) {
      throw new Error(
        `Please choose a valid ${modifier.name} for ${drink.name}.`
      );
    }

    validated[modifier.name] = submittedValue;
  }

  return validated;
}

function validateExtras(drink, submittedExtras = []) {
  const allowedExtras = new Map(
    (drink.extras || []).map((extra) => [extra.id, extra])
  );

  return submittedExtras.map(({ id }) => {
    const extra = allowedExtras.get(id);

    if (!extra) {
      throw new Error(
        `An invalid add-on was submitted for ${drink.name}.`
      );
    }

    return extra;
  });
}

function describeItem(selections, extras) {
  const details = [
    ...Object.entries(selections).map(
      ([name, value]) => `${name}: ${value}`
    ),
    ...extras.map(
      (extra) => `${extra.name} (+$${extra.price.toFixed(2)})`
    )
  ];

  return details.length
    ? details.join(" • ")
    : "As fate intended.";
}

module.exports = async function handler(req, res) {
  setCors(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        error: "Stripe has not been configured on the server."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const submittedItems =
      Array.isArray(body.items) ? body.items : [];

    const specialRequests =
      String(body.specialRequests || "")
        .trim()
        .slice(0, 250);

    if (!submittedItems.length) {
      return res.status(400).json({
        error: "Your cart is empty."
      });
    }

    if (submittedItems.length > 30) {
      return res.status(400).json({
        error: "This order is too large."
      });
    }

    const catalog = buildCatalog(readMenu());

    const lineItems = submittedItems.map((submittedItem) => {
      const drink = catalog[submittedItem.id];

      if (!drink) {
        throw new Error(
          "An invalid menu item was submitted."
        );
      }

      const selections = validateSelections(
        drink,
        submittedItem.selections
      );

      const extras = validateExtras(
        drink,
        submittedItem.extras
      );

      const unitAmount = Math.round(
        (
          drink.price +
          extras.reduce(
            (sum, extra) => sum + extra.price,
            0
          )
        ) * 100
      );

      return {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: drink.name,
            description: describeItem(
              selections,
              extras
            )
          }
        }
      };
    });

    const storefrontOrigin =
      process.env.STOREFRONT_ORIGIN ||
      req.headers.origin ||
      `https://${req.headers.host}`;

    const session =
      await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        customer_creation: "always",
        billing_address_collection: "auto",
        phone_number_collection: {
          enabled: true
        },
        success_url: "https://br34777-bbg.github.io/coffee-menu/success.html?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://br34777-bbg.github.io/coffee-menu/",
        metadata: {
          special_requests:
            specialRequests || "None"
        }
      });

    return res.status(200).json({
      url: session.url
    });
  } catch (error) {
    console.error(
      "Checkout session error:",
      error
    );

    return res.status(400).json({
      error:
        error.message ||
        "Checkout could not be created."
    });
  }
};
