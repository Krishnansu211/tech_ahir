/**
 * Server-Sent Events (SSE) manager.
 * Maintains connected watchers per auction and broadcasts real-time events.
 */

class SSEManager {
  constructor() {
    // Map of auctionId -> Set of express response objects
    this.watchers = new Map();
  }

  /**
   * Registers a new watcher connection for an auction.
   */
  addWatcher(auctionId, req, res) {
    const id = String(auctionId);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });

    if (!this.watchers.has(id)) {
      this.watchers.set(id, new Set());
    }

    const auctionWatchers = this.watchers.get(id);
    auctionWatchers.add(res);

    // Send immediate connected event
    this.sendToClient(res, 'CONNECTED', {
      auctionId: id,
      watcherCount: auctionWatchers.size,
      time: Date.now()
    });

    // Notify all watchers of updated count
    this.broadcast(id, 'WATCHER_COUNT', { count: auctionWatchers.size });

    // Clean up when the client disconnects
    req.on('close', () => {
      auctionWatchers.delete(res);
      if (auctionWatchers.size === 0) {
        this.watchers.delete(id);
      } else {
        this.broadcast(id, 'WATCHER_COUNT', { count: auctionWatchers.size });
      }
    });
  }

  /**
   * Broadcasts an event and JSON payload to all active watchers of an auction.
   */
  broadcast(auctionId, event, data) {
    const id = String(auctionId);
    const auctionWatchers = this.watchers.get(id);
    if (!auctionWatchers || auctionWatchers.size === 0) return;

    for (const client of auctionWatchers) {
      this.sendToClient(client, event, data);
    }
  }

  /**
   * Formats and writes an SSE message to an individual client response.
   */
  sendToClient(res, event, data) {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // If writing fails, client disconnected
    }
  }

  /**
   * Returns current count of watchers for an auction.
   */
  getWatcherCount(auctionId) {
    const id = String(auctionId);
    const set = this.watchers.get(id);
    return set ? set.size : 0;
  }
}

const sseManager = new SSEManager();

module.exports = {
  SSEManager,
  sseManager
};
