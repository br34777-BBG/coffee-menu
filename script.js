const state = {
  menu: null,
  cart: []
};

const $ = (selector) => document.querySelector(selector);

const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

async function loadMenu() {
  const response = await fetch("menu.json");
  if (!response.ok) throw new Error("Could not load menu.json");
  state.menu = await response.json();
  renderMenu("beans", "#beans-menu");
  renderMenu("greens", "#greens-menu");
  renderCart();
}

function renderMenu(section, targetSelector) {
  const target = $(targetSelector);
  target.innerHTML = state.menu[section].map(drinkCard).join("");

  target.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.id, section));
  });
}

function drinkCard(drink) {
  const modifiers = drink.modifiers.map((modifier, index) => `
    <div class="modifier">
      <label for="${drink.id}-${index}">${modifier.name}</label>
      <select id="${drink.id}-${index}" data-modifier-name="${modifier.name}">
        ${modifier.options.map(option => `<option value="${option}">${option}</option>`).join("")}
      </select>
    </div>
  `).join("");

  return `
    <article class="drink-card" data-drink-id="${drink.id}">
      <div class="drink-head">
        <div>
          <h3>${drink.name}</h3>
          <p class="drink-type">${drink.type}</p>
        </div>
        <span class="drink-price">${money(drink.price)}</span>
      </div>
      <p class="drink-description">${drink.description}</p>
      ${modifiers ? `<div class="modifiers">${modifiers}</div>` : ""}
      <button class="add-button" data-id="${drink.id}">
        Add to My Regrets
      </button>
    </article>
  `;
}

function addToCart(id, section) {
  const drink = state.menu[section].find((item) => item.id === id);
  const card = document.querySelector(`[data-drink-id="${id}"]`);
  const selections = {};

  card.querySelectorAll("select").forEach((select) => {
    selections[select.dataset.modifierName] = select.value;
  });

  state.cart.push({
    key: `${id}-${Date.now()}-${Math.random()}`,
    id,
    name: drink.name,
    price: drink.price,
    selections
  });

  renderCart();
  showToast(`${drink.name} added. Another excellent decision.`);
}

function renderCart() {
  const cartItems = $("#cart-items");
  $("#cart-count").textContent = state.cart.length;
  $("#cart-total").textContent = money(
    state.cart.reduce((sum, item) => sum + item.price, 0)
  );

  if (!state.cart.length) {
    cartItems.innerHTML = `<div class="empty-cart">No poor decisions yet.</div>`;
    return;
  }

  cartItems.innerHTML = state.cart.map((item) => {
    const details = Object.entries(item.selections)
      .map(([label, value]) => `${label}: ${value}`)
      .join(" • ");

    return `
      <div class="cart-item">
        <div class="cart-item-top">
          <div>
            <h4>${item.name}</h4>
            <p>${details || "As fate intended."}</p>
          </div>
          <strong>${money(item.price)}</strong>
        </div>
        <button class="remove-button" data-key="${item.key}">Remove this regret</button>
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

$("#checkout-button").addEventListener("click", () => {
  if (!state.cart.length) {
    showToast("The cart is empty. Temptation awaits.");
    return;
  }

  showToast("Stripe checkout is the next ritual.");
});

loadMenu().catch((error) => {
  console.error(error);
  document.body.innerHTML = `
    <main style="padding:2rem;color:white;background:#111;min-height:100vh">
      <h1>Menu unavailable</h1>
      <p>Make sure index.html, style.css, script.js, and menu.json are all in the same folder.</p>
    </main>
  `;
});
