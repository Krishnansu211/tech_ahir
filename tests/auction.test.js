const assert = require('assert');
const { createAuction, placeBid, closeAuction, checkAuctionEnd } = require('../src/auction');

function runTests() {
  console.log('--- Running Core Auction Unit Tests ---');

  // Test 1: createAuction initializes properly
  const a1 = createAuction({
    id: 'a1',
    item: 'Vintage Watch',
    startPrice: 1000,
    durationSeconds: 60
  });

  assert.strictEqual(a1.id, 'a1');
  assert.strictEqual(a1.item, 'Vintage Watch');
  assert.strictEqual(a1.currentPrice, 1000);
  assert.strictEqual(a1.highestBidder, null);
  assert.strictEqual(a1.status, 'open');
  assert.strictEqual(a1.bids.length, 0);
  assert.strictEqual(a1.winner, null);
  console.log('✓ Test 1: createAuction initializes correctly');

  // Test 2: Valid bid accepted
  const now = Date.now();
  const bid1 = placeBid(a1, { bidder: 'Ravi', amount: 1500, now });
  assert.strictEqual(bid1.success, true);
  assert.strictEqual(a1.currentPrice, 1500);
  assert.strictEqual(a1.highestBidder, 'Ravi');
  assert.strictEqual(a1.bids.length, 1);
  assert.strictEqual(a1.bids[0].seq, 1);
  assert.strictEqual(a1.bids[0].amount, 1500);
  console.log('✓ Test 2: Valid bid accepted and price updated');

  // Test 3: Lower or equal bid rejected
  const bidLower = placeBid(a1, { bidder: 'Priya', amount: 1400, now });
  assert.strictEqual(bidLower.success, false);
  assert.ok(bidLower.reason.includes('higher than'));

  const bidEqual = placeBid(a1, { bidder: 'Amit', amount: 1500, now });
  assert.strictEqual(bidEqual.success, false);
  assert.strictEqual(a1.currentPrice, 1500);
  console.log('✓ Test 3: Lower and equal bids rejected with clear reason');

  // Test 4: Anti-sniping rule (+30 seconds when bid within last 30s)
  const initialEndTime = a1.endTime;
  // Place bid at (endTime - 10 seconds), which is in the last 30s window
  const antiSnipingTime = initialEndTime - 10000;
  const bidLate = placeBid(a1, { bidder: 'Priya', amount: 2000, now: antiSnipingTime });
  assert.strictEqual(bidLate.success, true);
  assert.strictEqual(bidLate.extended, true);
  assert.strictEqual(a1.endTime, initialEndTime + 30000);
  console.log('✓ Test 4: Anti-sniping extends auction by 30 seconds');

  // Test 5: Bid when auction closed or past endTime rejected
  const postEndTime = a1.endTime + 1000;
  const bidExpired = placeBid(a1, { bidder: 'Kunal', amount: 2500, now: postEndTime });
  assert.strictEqual(bidExpired.success, false);
  assert.strictEqual(a1.status, 'closed');
  assert.strictEqual(a1.winner, 'Priya');
  console.log('✓ Test 5: Bid past end time rejected and auction marked closed');

  // Test 6: checkAuctionEnd closes auction
  const a2 = createAuction({ id: 'a2', item: 'Signed Bat', startPrice: 500, durationSeconds: 10 });
  placeBid(a2, { bidder: 'Rohit', amount: 1000, now: Date.now() });
  const checkEarly = checkAuctionEnd(a2, { now: a2.endTime - 1000 });
  assert.strictEqual(checkEarly.ended, false);
  assert.strictEqual(a2.status, 'open');

  const checkLate = checkAuctionEnd(a2, { now: a2.endTime + 1 });
  assert.strictEqual(checkLate.ended, true);
  assert.strictEqual(a2.status, 'closed');
  assert.strictEqual(a2.winner, 'Rohit');
  console.log('✓ Test 6: checkAuctionEnd properly transitions state to closed with winner');

  console.log('\nAll core auction unit tests PASSED successfully!');
}

runTests();
