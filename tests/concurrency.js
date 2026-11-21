/**
 * Concurrency Test Suite
 * Fires 100 bids simultaneously against the auction engine
 * to prove correctness under extreme race-condition pressure.
 */

const assert = require('assert');
const app = require('../src/server');

const TEST_PORT = 3456;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runConcurrencyTest() {
  console.log('====================================================');
  console.log('   STARTING 100-BID CONCURRENCY RACE CONDITION TEST  ');
  console.log('====================================================\n');

  // 1. Start server on test port
  const server = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  try {
    const auctionId = `test_race_${Date.now()}`;
    const startPrice = 1000;

    // 2. Create fresh auction with 60s duration
    console.log(`[Step 1] Creating auction '${auctionId}' with starting price ₹${startPrice}...`);
    const createRes = await fetch(`${BASE_URL}/auctions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: auctionId,
        item: 'Rare Signed Cricket Ball',
        startPrice: startPrice,
        duration: 60
      })
    });
    const createData = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    console.log(`✓ Auction created: ${createData.auction.item}\n`);

    // 3. Prepare 100 bids with deliberate collisions, duplicates, and lower bids
    console.log('[Step 2] Generating 100 simultaneous bids with overlapping prices...');
    const bidders = ['Ravi', 'Priya', 'Amit', 'Sneha', 'Rahul', 'Ananya', 'Karan', 'Pooja'];
    const bidsPayload = [];

    // Category A: 40 bids with strictly increasing amounts
    for (let i = 1; i <= 40; i++) {
      bidsPayload.push({
        bidder: bidders[i % bidders.length] + `_${i}`,
        amount: startPrice + i * 100
      });
    }

    // Category B: 30 duplicate bids (competing at exact same prices)
    for (let i = 1; i <= 30; i++) {
      const collisionPrice = startPrice + (i % 5 + 1) * 200; // collisions at 1200, 1400, 1600, 1800, 2000
      bidsPayload.push({
        bidder: `CollisionBidder_${i}`,
        amount: collisionPrice
      });
    }

    // Category C: 30 lower bids (should be rejected)
    for (let i = 1; i <= 30; i++) {
      bidsPayload.push({
        bidder: `LowBidder_${i}`,
        amount: startPrice - 100 + (i % 10) * 10
      });
    }

    // Randomize bid order to simulate realistic chaotic network arrival
    for (let i = bidsPayload.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bidsPayload[i], bidsPayload[j]] = [bidsPayload[j], bidsPayload[i]];
    }

    console.log(`[Step 3] Firing 100 HTTP requests simultaneously via Promise.all()...\n`);
    const startTime = Date.now();

    // 4. FIRE ALL 100 BIDS AT ONCE
    const responses = await Promise.all(
      bidsPayload.map((b) =>
        fetch(`${BASE_URL}/auctions/${auctionId}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(b)
        }).then(async (res) => ({
          status: res.status,
          data: await res.json(),
          sentBid: b
        }))
      )
    );

    const totalTimeMs = Date.now() - startTime;
    console.log(`✓ All 100 bids processed in ${totalTimeMs} ms (~${(totalTimeMs / 100).toFixed(2)} ms/bid)\n`);

    // 5. Analyze Results
    const accepted = responses.filter((r) => r.status === 200 && r.data.success);
    const rejected = responses.filter((r) => r.status !== 200 || !r.data.success);

    console.log('--- Summary of Concurrency Execution ---');
    console.log(`Total Bids Sent:    ${responses.length}`);
    console.log(`Accepted Bids:      ${accepted.length}`);
    console.log(`Rejected Bids:      ${rejected.length}`);

    // 6. Fetch authoritative auction state from server
    const stateRes = await fetch(`${BASE_URL}/auctions/${auctionId}`);
    const finalAuction = await stateRes.json();

    console.log(`\nFinal Current Price: ₹${finalAuction.currentPrice}`);
    console.log(`Final Highest Bidder: ${finalAuction.highestBidder}`);
    console.log(`Recorded Bids in Store: ${finalAuction.bids.length}`);

    // 7. Rigorous Correctness Checks
    console.log('\n--- Verifying Invariants & Incorruptibility ---');

    // Invariant 1: Store bid count equals accepted count
    assert.strictEqual(
      finalAuction.bids.length,
      accepted.length,
      `Mismatch: Store recorded ${finalAuction.bids.length} bids but HTTP returned ${accepted.length} accepted`
    );
    console.log('✓ Invariant 1 Passed: Exact match between accepted HTTP responses and recorded bids');

    // Invariant 2: Bids history is strictly monotonically increasing
    for (let i = 1; i < finalAuction.bids.length; i++) {
      const prev = finalAuction.bids[i - 1];
      const curr = finalAuction.bids[i];
      assert.strictEqual(
        curr.seq,
        prev.seq + 1,
        `Sequence gap detected between seq ${prev.seq} and ${curr.seq}`
      );
      assert.ok(
        curr.amount > prev.amount,
        `Non-increasing price detected! ${curr.amount} is not > ${prev.amount}`
      );
    }
    console.log('✓ Invariant 2 Passed: Bid history is strictly monotonic and sequential (zero race conditions)');

    // Invariant 3: Final price matches highest accepted bid
    const maxAcceptedAmount = Math.max(...accepted.map((a) => a.data.currentPrice));
    assert.strictEqual(
      finalAuction.currentPrice,
      maxAcceptedAmount,
      `Final price ₹${finalAuction.currentPrice} does not match max accepted ₹${maxAcceptedAmount}`
    );
    console.log(`✓ Invariant 3 Passed: Final price matches highest accepted bid (₹${finalAuction.currentPrice})`);

    // Invariant 4: No two accepted bids have the exact same amount
    const acceptedAmounts = accepted.map((a) => a.data.currentPrice);
    const uniqueAmounts = new Set(acceptedAmounts);
    assert.strictEqual(
      acceptedAmounts.length,
      uniqueAmounts.size,
      'Duplicate prices detected among accepted bids!'
    );
    console.log('✓ Invariant 4 Passed: Zero duplicate price collisions were accepted');

    // Invariant 5: All rejected bids have clear, sensible reasons
    for (const rej of rejected) {
      assert.ok(rej.data.reason, 'Rejected bid missing reason');
    }
    console.log('✓ Invariant 5 Passed: All 100% of rejected bids received clear explanation reasons');

    console.log('\n====================================================');
    console.log('  CONCURRENCY TEST PASSED! 100% CORRECT UNDER LOAD   ');
    console.log('====================================================\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  runConcurrencyTest()
    .then(() => {
      setTimeout(() => process.exit(0), 100);
    })
    .catch((err) => {
      console.error('CONCURRENCY TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = runConcurrencyTest;
