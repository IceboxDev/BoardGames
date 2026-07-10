// Standalone capture sink for the BGA bridge userscript.
//
//   node tools/bga-userscript/capture-sink.mjs [outfile] [port]
//
// Accepts the same `{token, events}` envelope the real /api/bga-ingest route
// takes, but requires no auth and no running app server. Every event is
// appended as one JSON line so the adapter can be developed against REAL BGA
// payloads (the checked-in fixture is synthetic).
//
// Point the userscript's ingest URL at http://localhost:3999/ingest, play a
// turn on your own BGA table, then inspect the JSONL.

import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const outFile = process.argv[2] ?? "bga-capture.jsonl";
const port = Number(process.argv[3] ?? 3999);

const seenKinds = new Map();

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    });
    return res.end();
  }
  if (req.method !== "POST") {
    res.writeHead(405).end("POST only");
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let events = [];
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      events = Array.isArray(body.events) ? body.events : [];
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: String(e) }));
    }

    let maxSeq = -1;
    for (const event of events) {
      appendFileSync(outFile, `${JSON.stringify(event)}\n`);
      maxSeq = Math.max(maxSeq, event.seq ?? -1);
      // Summarize what's arriving so the terminal doubles as a live monitor.
      const label =
        event.kind === "gamedatas"
          ? "gamedatas"
          : `notif:${event?.payload?.type ?? event?.payload?.source ?? "?"}`;
      seenKinds.set(label, (seenKinds.get(label) ?? 0) + 1);
    }

    console.log(
      `+${events.length} events (${[...seenKinds]
        .map(([k, n]) => `${k}×${n}`)
        .join(", ")}) → ${outFile}`,
    );

    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ ok: true, accepted: events.length, nextSeq: maxSeq + 1 }));
  });
});

server.listen(port, () => {
  console.log(`BGA capture sink listening on http://localhost:${port}/ingest`);
  console.log(`Writing to ${outFile}`);
});
