import { Client } from "colyseus.js";
const H1 = "trench-c1-1", H2 = "trench-c2-2";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = console.log;
const client = new Client("ws://localhost:2599");
const opts = (n, w) => ({ name: n, wallet: w, chain: "solana-testnet", city: "trench" });

const keeper = await client.joinOrCreate("world", opts("keeper", "wallet-keeper"));
const a = await client.joinOrCreate("world", opts("alice", "wallet-alice"));
const b = await client.joinOrCreate("world", opts("bob", "wallet-bob"));
const cr = { alice: 500, bob: 500 };
const inbox = { alice: [], bob: [] };
a.onMessage("bag-sync", (m) => { cr.alice = m.credits; });
b.onMessage("bag-sync", (m) => { cr.bob = m.credits; });
a.onMessage("message-new", (m) => inbox.alice.push(m));
b.onMessage("message-new", (m) => inbox.bob.push(m));
a.onMessage("home-result", (m) => log("   [alice]", JSON.stringify(m)));
b.onMessage("home-result", (m) => log("   [bob]  ", JSON.stringify(m)));
await wait(500);
const h = (id) => keeper.state.homes.get(id);
const st = (id, t) => { const x = h(id); log(`   ${t}: owner=${x?.ownerName||"-"} asking=${x?.askingPrice} dur=${x?.durationSeconds}s await=${x?.awaitingSeller} high=${x?.highBid} | alice=${cr.alice} bob=${cr.bob}`); };

log("A) no upper bound on asking price");
a.send("home-bid", { id: H1, city: "trench" });
await wait(6500); st(H1, "alice owns");
a.send("home-list", { id: H1, list: true, price: 5_000_000, duration: 120 });
await wait(800); st(H1, "listed at 5,000,000");

log("\nB) seller-chosen duration is honoured (120s, not the 86400 env default)");
b.send("home-bid", { id: H1, city: "trench" });
await wait(900);
const ends = h(H1)?.endsAt;
log(`   auction window = ${Math.round((ends - Date.now())/1000)}s (bob needed 5,000,000 cr, so this should have failed)`);

log("\nC) affordable listing -> accept/reject flow");
a.send("home-list", { id: H1, list: false });
await wait(500);
a.send("home-list", { id: H1, list: true, price: 100, duration: 60 });
await wait(700);
b.send("home-bid", { id: H1, city: "trench" });
await wait(900); st(H1, "bidding");
log("   waiting for the 60s auction... (checking it did NOT auto-transfer)");
