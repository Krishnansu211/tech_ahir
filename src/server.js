const express = require('express');
const path = require('path');
const { createAuction, placeBid, checkAuctionEnd } = require('./auction');
const { store } = require('./store');
const { sseManager } = require('./sse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * POST /auctions
 * Creates a new auction
 * Body: { id, item, startPrice, duration } (duration in seconds)
 */
app.post('/auctions', (req, res) => {
  try {
    const { id, item, startPrice, duration } = req.body;
    const auctionId = id || `a${Date.now()}`;
    const durationSec = duration || 120; // default 120 seconds

    if (!item || !startPrice) {
      return res.status(400).json({ error: 'item and startPrice are required' });
    }

    if (store.has(auctionId)) {
      return res.status(409).json({ error: `Auction with id ${auctionId} already exists` });
    }

    const auction = createAuction({
      id: auctionId,
      item,
      startPrice,
      durationSeconds: durationSec
    });

    store.set(auctionId, auction);

    return res.status(201).json({
      success: true,
      auction: { ...auction, serverTime: Date.now() }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /auctions
 * Lists all auctions
 */
app.get('/auctions', (req, res) => {
  const auctions = store.getAll().map((a) => ({
    ...a,
    serverTime: Date.now(),
    watchers: sseManager.getWatcherCount(a.id)
  }));
  res.json({ auctions });
});

/**
 * GET /auctions/:id
 * Fetches current state of an auction including authoritative server time
 */
app.get('/auctions/:id', (req, res) => {
  const auction = store.get(req.params.id);
  if (!auction) {
    return res.status(404).json({ error: 'Auction not found' });
  }

  // Check if expired
  checkAuctionEnd(auction, { now: Date.now() });

  res.json({
    ...auction,
    serverTime: Date.now(),
    watchers: sseManager.getWatcherCount(auction.id)
  });
});

/**
 * POST /auctions/:id/bids
 * Places a bid on an auction.
 * Evaluated atomically through the store to guarantee zero race conditions.
 * Body: { bidder, amount }
 */
app.post('/auctions/:id/bids', async (req, res) => {
  const auctionId = req.params.id;
  const { bidder, amount } = req.body;

  if (!store.has(auctionId)) {
    return res.status(404).json({ error: 'Auction not found' });
  }

  // Execute atomically to handle simultaneous bids in strict serial order
  const result = await store.executeAtomic(auctionId, () => {
    const auction = store.get(auctionId);
    const now = Date.now();
    const bidResult = placeBid(auction, { bidder, amount, now });
    return { bidResult, auction, now };
  });

  const { bidResult, auction, now } = result;

  if (!bidResult.success) {
    return res.status(400).json({
      success: false,
      reason: bidResult.reason,
      currentPrice: auction.currentPrice,
      highestBidder: auction.highestBidder
    });
  }

  // Broadcast BID_ACCEPTED event to all SSE watchers
  sseManager.broadcast(auctionId, 'BID_ACCEPTED', {
    bid: bidResult.bid,
    currentPrice: auction.currentPrice,
    highestBidder: auction.highestBidder,
    endTime: auction.endTime,
    extended: bidResult.extended,
    serverTime: now
  });

  // If anti-sniping extension was triggered, also broadcast an explicit notice
  if (bidResult.extended) {
    sseManager.broadcast(auctionId, 'ANTI_SNIPING_EXTENDED', {
      newEndTime: auction.endTime,
      addedSeconds: 30,
      reason: 'Late bid placed within last 30s. Auction extended by 30 seconds!'
    });
  }

  return res.status(200).json({
    success: true,
    bid: bidResult.bid,
    currentPrice: auction.currentPrice,
    highestBidder: auction.highestBidder,
    endTime: auction.endTime,
    extended: bidResult.extended,
    serverTime: now
  });
});

/**
 * GET /auctions/:id/stream
 * Connects a client to the real-time Server-Sent Events (SSE) feed
 */
app.get('/auctions/:id/stream', (req, res) => {
  const auctionId = req.params.id;
  const auction = store.get(auctionId);

  if (!auction) {
    return res.status(404).send('Auction not found');
  }

  sseManager.addWatcher(auctionId, req, res);

  // Send initial snapshot
  sseManager.sendToClient(res, 'INIT_STATE', {
    ...auction,
    serverTime: Date.now(),
    watchers: sseManager.getWatcherCount(auctionId)
  });
});

/**
 * Background ticker: runs every 500ms to monitor auction expirations
 * and broadcast winner/closing event.
 */
setInterval(() => {
  const now = Date.now();
  for (const auction of store.getAll()) {
    if (auction.status === 'open' && now >= auction.endTime) {
      store.executeAtomic(auction.id, () => {
        const check = checkAuctionEnd(auction, { now });
        if (check.ended) {
          sseManager.broadcast(auction.id, 'AUCTION_CLOSED', {
            id: auction.id,
            status: 'closed',
            winner: auction.winner,
            finalPrice: auction.currentPrice,
            endTime: auction.endTime
          });
          console.log(`[AuctionEngine] Auction ${auction.id} closed. Winner: ${auction.winner || 'None'} at ₹${auction.currentPrice}`);
        }
      });
    }
  }
}, 500);

// Seed initial demo auction "a1"
function seedInitialAuction() {
  const existing = store.get('a1');
  if (!existing) {
    const demo = createAuction({
      id: 'a1',
      item: 'VIP Cricket Match Ticket - Grand Finale',
      startPrice: 5000,
      durationSeconds: 120 // 2 minutes
    });
    store.set('a1', demo);
    console.log(`[AuctionEngine] Seeded initial demo auction 'a1': ${demo.item} (Starts ₹${demo.startPrice})`);
  }
}

seedInitialAuction();

// Start HTTP server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Live Auction Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
