# 🏏 Live Auction Platform (`tech_ahir`)

A high-concurrency, real-time live auction bidding engine built with Node.js and Server-Sent Events (SSE). Built with **strict separation of concerns**, **atomic single-writer concurrency guarantees**, and **server-authoritative anti-sniping protection**.

---

## 📖 Table of Contents
1. [Core Features & Problem Statement Rules](#-core-features--problem-statement-rules)
2. [Project Architecture & Separation of Concerns](#-project-architecture--separation-of-concerns)
3. [Concurrency & Race Condition Handling](#-concurrency--race-condition-handling)
4. [High-Scale Architecture Design Note (50k Auctions, 200k Watchers)](#-high-scale-architecture-design-note)
5. [API Specification](#-api-specification)
6. [Quick Start & Verification Guide](#-quick-start--verification-guide)
7. [Automated Concurrency Proof (100 Simultaneous Bids)](#-automated-concurrency-proof)

---

## ⚡ Core Features & Problem Statement Rules

| Rule | Requirement | Implementation Guarantee |
| :--- | :--- | :--- |
| **1. Instant Updates** | Every watcher must see the current price almost instantly | Broadcasted immediately via **Server-Sent Events (SSE)** without polling. |
| **2. Deterministic Winner** | Zero doubt about who won when the auction closes | Monotonic bid sequence; exactly one highest bidder at all times; closed status locks out further bids. |
| **3. Anti-Sniping** | If a bid arrives in the last 30 seconds, push the end time forward by 30 seconds | Evaluated strictly on authoritative **server time** (`Date.now()`). Extends `endTime += 30000`. |
| **4. Race-Condition Safety** | 100 bids arriving in the exact same millisecond cannot corrupt state | Single-writer promise queue executes bids sequentially; strictly increasing prices only. |

---

## 🏛️ Project Architecture & Separation of Concerns

```text
tech_ahir/
├── package.json          # Dependencies (Express) and scripts (start, test, test:unit)
├── README.md             # Complete documentation and 6-point scaling design note
├── src/
│   ├── auction.js        # Core pure business logic (placeBid, checkAuctionEnd, anti-sniping)
│   ├── store.js          # In-memory storage (Map) with per-auction atomic execution queue
│   ├── sse.js            # SSE connection manager, heartbeat, and multi-client broadcaster
│   └── server.js         # Express HTTP REST endpoints and background ticker
├── public/
│   └── index.html        # Real-time web dashboard (live price, countdown, quick bids, feed)
├── tests/
│   ├── auction.test.js   # Unit tests for pure auction logic (TDD validation)
│   └── concurrency.js    # Concurrency test firing 100 simultaneous bids via Promise.all
└── docs/
    └── superpowers/plans/2026-11-21-live-auction-engine.md # Full implementation plan
```

> **Why this separation matters for system design interviews:**
> `src/auction.js` contains **zero Express or HTTP dependencies**. The business rules can be tested in isolation, ported to a WebSocket gateway, or reused in an AWS Lambda / worker thread without changing a single line of business logic.

---

## 🛡️ Concurrency & Race Condition Handling

### The Problem
Imagine the current price is ₹5,000. Two bidders (Ravi and Priya) simultaneously submit ₹5,500 in the exact same millisecond:
- **Flawed System**: Reads current price (₹5,000) for both requests simultaneously, accepts both, and creates duplicate ₹5,500 prices with conflicting highest bidders.
- **Our System**: Utilizes a **Single-Writer Atomic Queue** (`src/store.js`). The first bid is processed synchronously (updating the price to ₹5,500). The second bid is then evaluated against the updated price (₹5,500) and immediately rejected because ₹5,500 is not strictly higher than ₹5,500.

### Why Node.js is safe
Node.js processes JavaScript on a **single-threaded event loop**. While I/O operations are asynchronous, the CPU execution of synchronous JavaScript code runs without preemption. By sequencing bid validation through a per-auction promise queue (`store.executeAtomic`), each bid is guaranteed atomic read-modify-write execution.

---

## 🚀 High-Scale Architecture Design Note
*(Scaling to 50,000 concurrent auctions and 200,000 active watchers per auction)*

To scale from this single-node implementation to an enterprise architecture supporting **50,000 concurrent auctions** and **200,000 spectators on high-profile auctions**, the following 6 design principles apply:

1. **Partitioned Single-Writer Actor Model (Core Bidding Engine)**:
   - Partition auctions across a cluster of bidding nodes using consistent hashing on `auction_id` (e.g. using Akka, Microsoft Orleans, or distributed worker pools).
   - Each auction has exactly **one active in-memory actor/writer** at any moment. Bids for `auction_id: a1` are routed to the specific node managing that auction, eliminating distributed database locks and guaranteeing sequential, sub-millisecond bid execution.

2. **Decouple the Bidding Engine from the Viewer Layer via Pub/Sub**:
   - The bidding engine's only responsibility is accepting or rejecting bids. It does **not** manage 200,000 WebSocket connections.
   - When a bid is accepted, the actor publishes a lightweight event (`{ auctionId, currentPrice, highestBidder, endTime }`) to a distributed message bus (e.g., **Apache Kafka**, **Redis Streams**, or **NATS**).

3. **Horizontally-Scaled Edge Fan-Out Gateways (200k Watchers per Auction)**:
   - 200,000 watchers connect to horizontally scaled **Edge Streaming Gateways** (or CDN-terminated WebSockets/SSE such as Cloudflare Workers or AWS API Gateway).
   - If 100 edge nodes each hold 2,000 client connections, each edge node subscribes once to the auction topic on the message bus and fans out updates locally. This shields the core bidding engine from connection load.

4. **In-Memory Write Path with Async Write-Behind Persistence**:
   - High-speed auctions during the final 10 seconds cannot wait for relational disk writes (e.g. PostgreSQL `fsync`).
   - The authoritative state lives in memory (backed by Redis cluster replication). State changes are appended to an append-only transaction log and flushed asynchronously to persistent storage (PostgreSQL / DynamoDB) via write-behind workers.

5. **Server-Authoritative Clock & Anti-Sniping Protection**:
   - All auction nodes are synchronized with PTP (Precision Time Protocol) or NTP daemons to keep clock drift under $\pm 1$ millisecond.
   - Client timestamps are completely ignored. Anti-sniping extensions are calculated strictly against the server's authoritative clock upon arrival at the partition actor.

6. **Edge Rate Limiting, Idempotency, and Bot Protection**:
   - In the final 10 seconds, bot spam could easily overwhelm ingress. Edge gateways enforce per-user token-bucket rate limiting (e.g., maximum 2 bids/sec per authenticated user) and require idempotency keys (`idempotency_key = UUID`) to prevent duplicate bid deduction if network packets retransmit.

---

## 🔌 API Specification

### 1. Create Auction
- **Endpoint**: `POST /auctions`
- **Body**:
  ```json
  {
    "id": "a1",
    "item": "VIP Cricket Match Ticket - Grand Finale",
    "startPrice": 5000,
    "duration": 120
  }
  ```
- **Response**: `201 Created`

### 2. Get Auction Details
- **Endpoint**: `GET /auctions/:id`
- **Response**:
  ```json
  {
    "id": "a1",
    "item": "VIP Cricket Match Ticket - Grand Finale",
    "startPrice": 5000,
    "currentPrice": 5000,
    "highestBidder": null,
    "endTime": 1735000000000,
    "status": "open",
    "serverTime": 1734999900000,
    "watchers": 42
  }
  ```

### 3. Place a Bid
- **Endpoint**: `POST /auctions/:id/bids`
- **Body**:
  ```json
  {
    "bidder": "Ravi",
    "amount": 5500
  }
  ```
- **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "currentPrice": 5500,
    "highestBidder": "Ravi",
    "endTime": 1735000030000,
    "extended": true,
    "serverTime": 1734999980000
  }
  ```
- **Failure Response (`400 Bad Request`)**:
  ```json
  {
    "success": false,
    "reason": "Bid amount ₹5500 must be strictly higher than current price of ₹5500",
    "currentPrice": 5500,
    "highestBidder": "Ravi"
  }
  ```

### 4. Live Stream (SSE)
- **Endpoint**: `GET /auctions/:id/stream`
- **Events**:
  - `INIT_STATE`: Initial auction snapshot on connection
  - `BID_ACCEPTED`: Price update, highest bidder, remaining time
  - `ANTI_SNIPING_EXTENDED`: Triggered when bid placed in last 30s
  - `AUCTION_CLOSED`: Winner announcement and final settlement
  - `WATCHER_COUNT`: Real-time count of active viewers

---

## 🧪 Quick Start & Verification Guide

### 1. Prerequisites
- Node.js v18 or newer (`node -v`)

### 2. Run the Server
```bash
npm start
```
Open **`http://localhost:3000`** in one or more browser tabs to view the live dashboard!

### 3. Run Core Unit Tests
```bash
npm run test:unit
```
Verifies pure business rules: validation, price escalation, anti-sniping extension, and winner determination.

---

## ⚡ Automated Concurrency Proof

To verify that the engine handles extreme simultaneous bid pressure without corrupting state or accepting duplicate bids, run:

```bash
npm test
```

### What this test does:
1. Creates an isolated test auction.
2. Generates **100 bids** comprising:
   - 40 strictly increasing bids
   - 30 duplicate price bids (competing at the exact same prices)
   - 30 under-market bids (lower than current price)
3. Shuffles all 100 bids randomly to simulate network chaos.
4. Fires all 100 HTTP requests **simultaneously** using `Promise.all`.
5. Verifies 5 critical invariants:
   - **Invariant 1**: Exactly matching number of accepted HTTP responses and stored bids.
   - **Invariant 2**: Bid history is strictly monotonic and sequential ($Seq_{i+1} = Seq_i + 1$, $Price_{i+1} > Price_i$).
   - **Invariant 3**: Final auction price equals the highest accepted bid.
   - **Invariant 4**: Exactly zero duplicate price collisions accepted.
   - **Invariant 5**: 100% of rejected bids receive explicit explanations.
