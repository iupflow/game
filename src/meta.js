// Progress that lasts between games: stardust (the coin), what has been bought in the shop,
// what is in use, and today's daily challenge.
import { store } from './ads.js';

const KEYS = {
  coins: 'jd3_coins',
  owned: (type) => `jd3_owned_${type}`,
  using: (type) => `jd3_using_${type}`,
  daily: 'jd3_daily',
};
const FREE = { skin: 'classic', theme: 'nebula' };

export const Meta = {
  get coins() {
    return store.get(KEYS.coins, 0);
  },

  addCoins(n) {
    if (n > 0) store.set(KEYS.coins, this.coins + Math.round(n));
  },

  /** Spends stardust; false (and nothing spent) if there is not enough. */
  spend(n) {
    if (this.coins < n) return false;
    store.set(KEYS.coins, this.coins - n);
    return true;
  },

  /** type: 'skin' or 'theme' */
  owns(type, id) {
    return id === FREE[type] || store.get(KEYS.owned(type), []).includes(id);
  },

  own(type, id) {
    const list = store.get(KEYS.owned(type), []);
    if (!list.includes(id)) store.set(KEYS.owned(type), [...list, id]);
  },

  using(type) {
    return store.get(KEYS.using(type), FREE[type]);
  },

  use(type, id) {
    store.set(KEYS.using(type), id);
  },

  /** Today's daily challenge record: whether it has been completed, and the best score. */
  daily(dateKey) {
    const d = store.get(KEYS.daily, null);
    return d && d.date === dateKey ? d : { date: dateKey, done: false, best: 0 };
  },

  saveDaily(record) {
    store.set(KEYS.daily, record);
  },
};
