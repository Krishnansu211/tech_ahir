/**
 * In-memory storage for auctions.
 * Uses a Map keyed by auction ID.
 * Provides a per-auction execution queue to guarantee single-writer serial processing.
 */

class AuctionStore {
  constructor() {
    this.auctions = new Map();
    // Map of auctionId -> Promise chain for serial execution
    this.locks = new Map();
  }

  /**
   * Retrieves an auction by ID.
   */
  get(id) {
    return this.auctions.get(String(id));
  }

  /**
   * Stores an auction by ID.
   */
  set(id, auction) {
    this.auctions.set(String(id), auction);
    return auction;
  }

  /**
   * Checks if an auction exists.
   */
  has(id) {
    return this.auctions.has(String(id));
  }

  /**
   * Returns all stored auctions as an array.
   */
  getAll() {
    return Array.from(this.auctions.values());
  }

  /**
   * Removes an auction.
   */
  delete(id) {
    this.locks.delete(String(id));
    return this.auctions.delete(String(id));
  }

  /**
   * Executes an operation atomically on an auction.
   * Guarantees that only one operation runs on the auction at any moment,
   * completely eliminating race conditions.
   *
   * @param {string} id - Auction ID
   * @param {Function} taskFn - Function returning a result or Promise
   */
  async executeAtomic(id, taskFn) {
    const key = String(id);
    const currentPromise = this.locks.get(key) || Promise.resolve();

    let resolveNext;
    const nextPromise = new Promise((resolve) => {
      resolveNext = resolve;
    });

    // Chain the next task to run only after the current one completes
    this.locks.set(key, nextPromise);

    try {
      await currentPromise;
      return await taskFn();
    } finally {
      resolveNext();
      // Clean up lock if no more tasks are waiting
      if (this.locks.get(key) === nextPromise) {
        this.locks.delete(key);
      }
    }
  }
}

// Export singleton instance
const store = new AuctionStore();

module.exports = {
  AuctionStore,
  store
};
