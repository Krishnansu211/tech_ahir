/**
 * Core auction business logic.
 * Pure rules without any Express or HTTP dependencies.
 */

/**
 * Creates an auction object according to the standard data model.
 */
function createAuction({ id, item, startPrice, durationSeconds = 60 }) {
  if (!id) throw new Error('Auction id is required');
  if (!item) throw new Error('Auction item name is required');
  const price = Number(startPrice);
  if (isNaN(price) || price <= 0) throw new Error('Valid starting price is required');

  const now = Date.now();
  return {
    id: String(id),
    item: String(item),
    startPrice: price,
    currentPrice: price,
    highestBidder: null,
    endTime: now + Number(durationSeconds) * 1000,
    status: 'open', // 'open' | 'closed'
    bids: [],       // history: { seq, bidder, amount, time }
    winner: null
  };
}

/**
 * Places a bid on an auction.
 * Evaluates rules:
 * 1. Checks if auction is active (server time < endTime and status === 'open').
 * 2. Checks if amount is strictly higher than currentPrice.
 * 3. Applies anti-sniping: if bid arrives in the last 30s, extends endTime by 30s.
 * 4. Records bid with sequence number and timestamp.
 */
function placeBid(auction, { bidder, amount, now = Date.now() }) {
  if (!auction) {
    return { success: false, reason: 'Auction not found' };
  }

  // Auto-close if past end time
  if (auction.status === 'closed' || now >= auction.endTime) {
    auction.status = 'closed';
    auction.winner = auction.highestBidder;
    return { success: false, reason: 'Auction is already closed' };
  }

  const bidAmount = Number(amount);
  if (isNaN(bidAmount)) {
    return { success: false, reason: 'Invalid bid amount format' };
  }

  if (!bidder || typeof bidder !== 'string' || bidder.trim() === '') {
    return { success: false, reason: 'Bidder name is required' };
  }

  const cleanBidder = bidder.trim();

  // Rule: Bid must be strictly higher than current price
  if (bidAmount <= auction.currentPrice) {
    return {
      success: false,
      reason: `Bid amount ₹${bidAmount} must be strictly higher than current price of ₹${auction.currentPrice}`
    };
  }

  // Rule: Anti-sniping
  // If a bid arrives in the last 30 seconds (<= 30000ms), extend by 30 seconds (30000ms)
  let extended = false;
  const remainingMs = auction.endTime - now;
  const ANTI_SNIPING_WINDOW_MS = 30 * 1000;
  const ANTI_SNIPING_EXTENSION_MS = 30 * 1000;

  if (remainingMs <= ANTI_SNIPING_WINDOW_MS) {
    auction.endTime += ANTI_SNIPING_EXTENSION_MS;
    extended = true;
  }

  // Update auction state
  auction.currentPrice = bidAmount;
  auction.highestBidder = cleanBidder;

  const bidRecord = {
    seq: auction.bids.length + 1,
    bidder: cleanBidder,
    amount: bidAmount,
    time: now
  };
  auction.bids.push(bidRecord);

  return {
    success: true,
    bid: bidRecord,
    auction,
    extended,
    newEndTime: auction.endTime
  };
}

/**
 * Checks if the auction end time has passed and closes it if so.
 */
function checkAuctionEnd(auction, { now = Date.now() } = {}) {
  if (!auction) return { ended: false };

  if (auction.status === 'open' && now >= auction.endTime) {
    auction.status = 'closed';
    auction.winner = auction.highestBidder;
    return {
      ended: true,
      auction,
      winner: auction.winner,
      finalPrice: auction.currentPrice
    };
  }

  return { ended: auction.status === 'closed', auction };
}

/**
 * Manually closes an auction.
 */
function closeAuction(auction) {
  if (!auction) return null;
  auction.status = 'closed';
  auction.winner = auction.highestBidder;
  return auction;
}

module.exports = {
  createAuction,
  placeBid,
  checkAuctionEnd,
  closeAuction
};
