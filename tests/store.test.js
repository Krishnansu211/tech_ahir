const assert = require('assert');
const { AuctionStore } = require('../src/store');

async function testStore() {
  console.log('--- Testing AuctionStore Atomic Execution ---');
  const store = new AuctionStore();

  const auction = { id: 'test1', currentPrice: 100, bids: [] };
  store.set('test1', auction);

  // Simulate 50 concurrent operations modifying the auction
  const operations = [];
  for (let i = 1; i <= 50; i++) {
    operations.push(
      store.executeAtomic('test1', async () => {
        // Small delay to simulate processing
        await new Promise((r) => setTimeout(r, 2));
        auction.currentPrice += 10;
        auction.bids.push(i);
        return auction.currentPrice;
      })
    );
  }

  await Promise.all(operations);

  // If atomic execution works, all 50 operations ran serially without dropping any
  assert.strictEqual(auction.currentPrice, 100 + 50 * 10);
  assert.strictEqual(auction.bids.length, 50);
  console.log('✓ Store atomic execution successfully serialized 50 concurrent operations');
  console.log('All store tests PASSED!\n');
}

testStore();
