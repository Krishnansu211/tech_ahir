# Live Auction Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, real-time live auction bidding engine with anti-sniping, race-condition protection under high concurrency, Server-Sent Events (SSE) broadcasting, an interactive demo dashboard, a 100-bid concurrency test, and a scaling design note.

**Architecture:** Business logic is isolated in a pure JavaScript core (`auction.js`) independent of web frameworks. State is stored in an in-memory `Map` with serialized per-auction bid execution (`store.js`) to guarantee zero race conditions. Live updates are pushed to all watchers via Server-Sent Events (`sse.js`), exposed via clean Express REST endpoints (`server.js`), and rendered on a responsive client dashboard (`public/index.html`).

**Tech Stack:** Node.js (v24), Express.js, Server-Sent Events (SSE), Vanilla HTML5/CSS3/ES6 JavaScript.

---

### Task 1: Project Setup & Dependencies

**Files:**
- Modify: `package.json`
- Create: `src/` directory, `public/` directory, `tests/` directory

- [ ] **Step 1: Initialize package.json with dependencies and scripts**
- [ ] **Step 2: Install express**
- [ ] **Step 3: Create directory structure (`src`, `public`, `tests`, `docs`)**
- [ ] **Step 4: Commit setup**

---

### Task 2: Core Auction Logic (`src/auction.js`)

**Files:**
- Create: `src/auction.js`
- Test: `tests/auction.test.js`

- [ ] **Step 1: Write unit tests for core auction rules**
  - Test valid bid increases price and sets highest bidder
  - Test lower or equal bid is rejected with clear reason
  - Test bid after end time is rejected and marks auction closed
  - Test bid in last 30 seconds triggers anti-sniping extension (+30s)
  - Test checkAuctionEnd closes auction and sets winner
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/auction.js`**
  - `createAuction({ id, item, startPrice, durationSeconds })`
  - `placeBid(auction, { bidder, amount, now })`
  - `checkAuctionEnd(auction, { now })`
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit core auction module**

---

### Task 3: In-Memory Storage & Concurrency Queue (`src/store.js`)

**Files:**
- Create: `src/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1: Write test for serialized bid execution**
- [ ] **Step 2: Implement `src/store.js`**
  - Map storage for auctions
  - Per-auction promise queue / single-writer lock for atomic serial execution
- [ ] **Step 3: Run test to verify it passes**
- [ ] **Step 4: Commit store module**

---

### Task 4: Real-Time SSE Broadcasting (`src/sse.js`)

**Files:**
- Create: `src/sse.js`

- [ ] **Step 1: Implement `src/sse.js`**
  - Maintain watchers per auction (`Map<auctionId, Set<Response>>`)
  - `addWatcher(auctionId, res)` with keep-alive and disconnect cleanup
  - `broadcast(auctionId, event, data)`
  - `getWatcherCount(auctionId)`
- [ ] **Step 2: Commit SSE module**

---

### Task 5: Express Server & API Endpoints (`src/server.js`)

**Files:**
- Create: `src/server.js`

- [ ] **Step 1: Implement Express REST routes**
  - `POST /auctions`: Create new auction
  - `GET /auctions/:id`: Fetch current state + server time
  - `POST /auctions/:id/bids`: Place bid with validation and SSE broadcast
  - `GET /auctions/:id/stream`: SSE watcher connection
  - Background interval timer for auction expiry
  - Seed default demo auction (`a1`, "Vintage Rolex Submariner", ₹10,000, 180s)
- [ ] **Step 2: Start server and verify endpoints via curl**
- [ ] **Step 3: Commit server implementation**

---

### Task 6: Concurrency Test Suite (`tests/concurrency.js`)

**Files:**
- Create: `tests/concurrency.js`

- [ ] **Step 1: Implement 100-bid concurrency test**
  - Creates fresh test auction
  - Fires 100 simultaneous bids using `Promise.all` with random/overlapping amounts
  - Verifies:
    1. Highest accepted bid matches final state
    2. Zero race conditions or duplicate prices
    3. Correct number of accepted vs rejected bids
    4. Anti-sniping extension triggered properly
- [ ] **Step 2: Run test against running server and confirm 100% pass**
- [ ] **Step 3: Commit concurrency test**

---

### Task 7: Interactive Demo Frontend (`public/index.html`)

**Files:**
- Create: `public/index.html`

- [ ] **Step 1: Build modern responsive dashboard UI**
  - Live item display with price pulse animation
  - Server-synchronized countdown timer with anti-sniping warning badge (<30s)
  - Active watchers counter
  - Bid placement form with quick bid increments (+₹100, +₹500, +₹1,000)
  - Real-time bid history feed
  - Winner announcement modal/banner
  - SSE listener with auto-reconnection
- [ ] **Step 2: Test frontend in browser and verify live updates**
- [ ] **Step 3: Commit UI**

---

### Task 8: Comprehensive README with 5-6 Point Scale Design Note & Push to GitHub

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write full documentation**
  - Project summary & architecture
  - Separation of concerns justification
  - Concurrency & race condition safety explanation
  - How to run & verify (`npm start`, `npm test`)
  - **Design Note (5-6 bullet points on scaling to 50k auctions & 200k watchers)**
- [ ] **Step 2: Commit and push all changes to GitHub (`Krishnansu211/tech_ahir`)**
- [ ] **Step 3: Final verification**
