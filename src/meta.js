// Progress that lasts between games: diamonds, what has been bought in the shop and what is in
// use, the biggest body ever made, today's daily challenge, and a game left unfinished.
import { store } from './ads.js';

const KEYS = {
  gems: 'jd3_gems',
  owned: (type) => `jd3_owned_${type}`,
  using: (type) => `jd3_using_${type}`,
  record: 'jd3_record',
  daily: 'jd3_daily',
  save: 'jd3_save',
};
const FREE = { skin: 'classic', theme: 'nebula' };

export const Meta = {
  get gems() {
    return store.get(KEYS.gems, 0);
  },

  addGems(n) {
    if (n > 0) store.set(KEYS.gems, this.gems + Math.round(n));
  },

  /** Spends diamonds; false (and nothing spent) if there are not enough. */
  spendGems(n) {
    if (this.gems < n) return false;
    store.set(KEYS.gems, this.gems - n);
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

  /** The biggest body ever made, in any game (-1 before the first merge). */
  get record() {
    return store.get(KEYS.record, -1);
  },

  noteRecord(tier) {
    if (tier > this.record) store.set(KEYS.record, tier);
  },

  /** Today's daily challenge record: whether it has been completed. */
  daily(dateKey) {
    const d = store.get(KEYS.daily, null);
    return d && d.date === dateKey ? d : { date: dateKey, done: false };
  },

  saveDaily(record) {
    store.set(KEYS.daily, record);
  },

  /** A game left unfinished (from the pause menu, or by closing the app), to continue later. */
  get savedGame() {
    return store.get(KEYS.save, null);
  },

  saveGame(state) {
    store.set(KEYS.save, state);
  },

  clearSavedGame() {
    store.set(KEYS.save, null);
  },
};
