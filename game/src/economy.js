// Economy (DESIGN.md §1 + §13.6): player money, prices, round rewards, the
// buy menu's data. Teammates use the same reward rules (team.js teammateBuy).
export const PRICES = {
  pistol: 500,
  smg: 1500,
  rifle: 2700,
  armor: 650,
  he: 300,
  smoke: 300,
  flash: 200,
  ammo: 200,
};
export const REWARDS = { kill: 300, win: 3250, loss: 1900, plant: 300 };

export const BUY_MENU = [
  { id: 'rifle', key: '3', label: 'VK-7 Rifle', price: PRICES.rifle },
  { id: 'smg', key: '2', label: 'HORNET SMG', price: PRICES.smg },
  { id: 'pistol', key: '1', label: 'P9 Pistol', price: PRICES.pistol },
  { id: 'armor', key: '4', label: 'Armor', price: PRICES.armor },
  { id: 'he', key: '6', label: 'HE Grenade', price: PRICES.he },
  { id: 'smoke', key: '7', label: 'Smoke Grenade', price: PRICES.smoke },
  { id: 'flash', key: '8', label: 'Flash Grenade', price: PRICES.flash },
  { id: 'ammo', key: '5', label: 'Ammo Refill', price: PRICES.ammo },
];

export function createEconomy() {
  const eco = {
    money: 800,
    grenades: { he: 0, smoke: 0, flash: 0 },
    canAfford(price) {
      return eco.money >= price;
    },
    // Returns true when the purchase lands. Weapons/armor are applied by
    // main.js; this file only owns the money.
    buy(id, price) {
      if (eco.money < price) return false;
      eco.money -= price;
      return true;
    },
    reward(kind) {
      eco.money += REWARDS[kind] ?? 0;
      return REWARDS[kind] ?? 0;
    },
    reset() {
      eco.money = 800;
      eco.grenades = { he: 0, smoke: 0, flash: 0 };
    },
  };
  return eco;
}
