const CHECKOUT_API_URL = "https://coffee-menu-murex.vercel.app/api/create-checkout-session";

const state = {
  menu: null,
  cart: [],
  specialRequests: ""
};

const $ = (selector) => document.querySelector(selector);

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

async function loadMenu() {
  const response = await fetch("menu.json?v=20260720-7", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load menu.json");

  state.menu = await response.json();
  renderMenu("beans", "#beans-menu");
  renderMenu("greens", "#greens-menu");
  renderCart();
}

function modifierMarkup(drink, modifier, index) {
  const conditional = modifier.conditionalOn
    ? `data-conditional-modifier="${escapeHtml(modifier.conditionalOn.modifier)}"
       data-conditional-values="${escapeHtml(modifier.conditionalOn.values.join("|"))}"`
    : "";

  const conditionalClass = modifier.conditionalOn ? " conditional-modifier hidden" : "";
  const placeholder = modifier.placeholder
    ? `<option value="" selected disabled>${escapeHtml(modifier.placeholder)}</option>`
    : "";

  return `
    <div class="modifier${conditionalClass}" ${conditional}>
      <label for="${drink.id}-${index}">${escapeHtml(modifier.name)}</label>
      <select
        id="${drink.id}-${index}"
        data-modifier-name="${escapeHtml(modifier.name)}"
      >
        ${placeholder}
        ${modifier.options
          .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function extraMarkup(drink, extra, index) {
  return `
    <label class="extra-option" for="${drink.id}-extra-${index}">
      <input
        id="${drink.id}-extra-${index}"
        type="checkbox"
        data-extra-id="${escapeHtml(extra.id)}"
        data-extra-name="${escapeHtml(extra.name)}"
        data-extra-price="${extra.price}"
      >
      <span>${escapeHtml(extra.name)} <strong>(+${money(extra.price)})</strong></span>
    </label>
  `;
}

function drinkCard(drink) {
  const modifiers = (drink.modifiers || [])
    .map((modifier, index) => modifierMarkup(drink, modifier, index))
    .join("");

  const extras = (drink.extras || [])
    .map((extra, index) => extraMarkup(drink, extra, index))
    .join("");

  return `
    <article class="drink-card" data-drink-id="${escapeHtml(drink.id)}">
      <div class="drink-head">
        <div>
          <h3>${escapeHtml(drink.name)}</h3>
          <p class="drink-type">${escapeHtml(drink.type)}</p>
        </div>
        <span class="drink-price">${money(drink.price)}</span>
      </div>

      <p class="drink-description">${escapeHtml(drink.description)}</p>

      ${modifiers ? `<div class="modifiers">${modifiers}</div>` : ""}
      ${extras ? `<div class="extras">${extras}</div>` : ""}

      <button class="add-button" data-id="${escapeHtml(drink.id)}">
        Add to My Regrets
      </button>
    </article>
  `;
}

function updateConditionalModifiers(card) {
  card.querySelectorAll("[data-conditional-modifier]").forEach((wrapper) => {
    const parentName = wrapper.dataset.conditionalModifier;
    const acceptedValues = wrapper.dataset.conditionalValues.split("|");
    const parent = [...card.querySelectorAll("select")]
      .find((select) => select.dataset.modifierName === parentName);

    const shouldShow = parent && acceptedValues.includes(parent.value);
    wrapper.classList.toggle("hidden", !shouldShow);

    const select = wrapper.querySelector("select");
    select.disabled = !shouldShow;

    if (!shouldShow) {
      select.selectedIndex = 0;
    }
  });
}

function renderMenu(section, targetSelector) {
  const target = $(targetSelector);
  target.innerHTML = state.menu[section].map(drinkCard).join("");

  target.querySelectorAll(".drink-card").forEach((card) => {
    card.querySelectorAll("select").forEach((select) => {
      select.addEventListener("change", () => updateConditionalModifiers(card));
    });
    updateConditionalModifiers(card);
  });

  target.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.id, section));
  });
}

function addToCart(id, section) {
  const drink = state.menu[section].find((item) => item.id === id);
  const card = document.querySelector(`[data-drink-id="${CSS.escape(id)}"]`);
  const selections = {};
  const extras = [];

  for (const select of card.querySelectorAll("select:not(:disabled)")) {
    if (!select.value) {
      showToast(`Please choose ${select.dataset.modifierName}.`);
      select.focus();
      return;
    }
    selections[select.dataset.modifierName] = select.value;
  }

  let extrasTotal = 0;

  card.querySelectorAll('input[type="checkbox"][data-extra-id]:checked').forEach((checkbox) => {
    const price = Number(checkbox.dataset.extraPrice);
    extras.push({
      id: checkbox.dataset.extraId,
      name: checkbox.dataset.extraName,
      price
    });
    extrasTotal += price;
  });

  state.cart.push({
    key: `${id}-${Date.now()}-${Math.random()}`,
    id,
    name: drink.name,
    basePrice: drink.price,
    price: drink.price + extrasTotal,
    selections,
    extras
  });

  renderCart();
  showToast(`${drink.name} added. Another excellent pour decision.`);
}

function renderCart() {
  const cartItems = $("#cart-items");
  $("#cart-count").textContent = state.cart.length;
  $("#cart-total").textContent = money(
    state.cart.reduce((sum, item) => sum + item.price, 0)
  );

  if (!state.cart.length) {
    cartItems.innerHTML = `<div class="empty-cart">No pour decisions yet.</div>`;
    return;
  }

  cartItems.innerHTML = state.cart.map((item) => {
    const selectionDetails = Object.entries(item.selections)
      .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
      .join("");

    const extraDetails = item.extras
      .map((extra) => `<li>${escapeHtml(extra.name)} (+${money(extra.price)})</li>`)
      .join("");

    const details = selectionDetails || extraDetails
      ? `<ul class="cart-item-details">${selectionDetails}${extraDetails}</ul>`
      : `<p>As fate intended.</p>`;

    return `
      <div class="cart-item">
        <div class="cart-item-top">
          <div>
            <h4>${escapeHtml(item.name)}</h4>
            ${details}
          </div>
          <strong>${money(item.price)}</strong>
        </div>
        <button class="remove-button" data-key="${escapeHtml(item.key)}">
          Remove this regret
        </button>
      </div>
    `;
  }).join("");

  cartItems.querySelectorAll(".remove-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.cart = state.cart.filter((item) => item.key !== button.dataset.key);
      renderCart();
    });
  });
}

function openCart() {
  $("#cart-panel").classList.add("open");
  $("#cart-panel").setAttribute("aria-hidden", "false");
  $("#cart-overlay").classList.remove("hidden");
}

function closeCart() {
  $("#cart-panel").classList.remove("open");
  $("#cart-panel").setAttribute("aria-hidden", "true");
  $("#cart-overlay").classList.add("hidden");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

$("#enter-cafe").addEventListener("click", () => {
  $("#welcome").classList.add("hidden");
  $("#site").classList.remove("hidden");
  window.scrollTo({ top: 0 });
});

$("#cart-button").addEventListener("click", openCart);
$("#close-cart").addEventListener("click", closeCart);
$("#cart-overlay").addEventListener("click", closeCart);

const specialRequests = $("#special-requests");
const specialRequestCount = $("#special-request-count");

specialRequests.addEventListener("input", () => {
  state.specialRequests = specialRequests.value.trim();
  specialRequestCount.textContent = specialRequests.value.length;
});

$("#checkout-button").addEventListener("click", async () => {
  if (!state.cart.length) {
    showToast("The cart is empty. Temptation awaits.");
    return;
  }

  const checkoutButton = $("#checkout-button");
  const originalText = checkoutButton.textContent;

  checkoutButton.disabled = true;
  checkoutButton.textContent = "Preparing Your Pour Decision…";

  try {
    const response = await fetch(CHECKOUT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: state.cart.map((item) => ({
          id: item.id,
          selections: item.selections,
          extras: item.extras.map((extra) => ({ id: extra.id }))
        })),
        specialRequests: state.specialRequests
      })
    });

    const data = await response.json();

    if (!response.ok || !data.url) {
      throw new Error(data.error || "Checkout could not be created.");
    }

    window.location.assign(data.url);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Checkout failed. Please try again.");
    checkoutButton.disabled = false;
    checkoutButton.textContent = originalText;
  }
});

loadMenu().catch((error) => {
  console.error(error);
  document.body.innerHTML = `
    <main style="padding:2rem;color:white;background:#111;min-height:100vh">
      <h1>Menu unavailable</h1>
      <p>Make sure index.html, style.css, script.js, menu.json, bee-crest.png, and bee-icon.png are all in the same folder.</p>
    </main>
  `;
});
