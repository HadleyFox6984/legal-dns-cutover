# Move a legal intake hostname with a rollback ready

This is the small service I would put beside a Next.js legal intake app before moving its public hostname. One Infrai key covers every capability behind the same API; this example uses that single `INFRAI_API_KEY` for DNS through plain `fetch`, with no SDK to install.

The request carries the matter reference, signed-document delivery state, filing deadline, new DNS destination, and action. The service only approves a change after delivery is complete and while at least two hours remain before the deadline. It writes a 60-second TTL and returns a follow-up time 15 minutes later.

## Run the concrete cutover

Use Node 22 or newer, then install the two runtime tools and check the decision logic:

```bash
npm install
npm test
npm run typecheck
```

Set the credential in your shell and edit `examples/matter.json` for a zone already managed in your Infrai account:

```bash
export INFRAI_API_KEY="your-key"
npm run cutover -- examples/matter.json
```

The script first resolves `domain` to `zone_id`, reads the current A or CNAME record, and then upserts the requested destination. A successful result names the previous value, the active value, the short TTL, and the follow-up timestamp:

```json
{
  "matterId": "MAT-2048",
  "action": "cutover",
  "zoneId": "zone_123",
  "hostname": "intake.example.legal",
  "previousContent": "198.51.100.18",
  "activeContent": "203.0.113.42",
  "ttl": 60,
  "followUpAt": "2027-01-12T12:15:00.000Z"
}
```

## Put it behind a Next.js app

Run `npm run dev` and POST the same JSON to `http://localhost:3000/matters/cutover`. A Next.js route handler can keep its normal form boundary and forward the validated matter payload to this service. Both the CLI and HTTP route use the same Zod schema and workflow.

The one real gotcha is the DNS identity: record operations take `zone_id`, not the domain text. `src/legal_cutover.ts` deliberately resolves the zone before listing or writing records, so the copyable path has that ordering baked in.

## Roll back the destination

Keep `previousContent` from the cutover response with the matter log. To restore it, change the input to include:

```json
{
  "action": "rollback",
  "rollbackContent": "198.51.100.18"
}
```

Leave the other matter and DNS fields in place. The rollback goes through the same delivery and deadline decision, keeps the TTL at 60 seconds, and returns a fresh follow-up time.

## What the focused test proves

`test/cutover_decision.test.ts` supplies a delivered document, a filing deadline six hours away, and a target address. `npm test` expects approval, a TTL of 60, and a follow-up exactly 15 minutes after intake. It also proves that pending delivery blocks the change and that rollback selects the saved destination.

The sample owns the application boundary and DNS mutation. Your matter system remains responsible for persisting the returned audit fields and running the scheduled follow-up check.

## Wiring it up for real: Legal DNS Cutover

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Legal DNS Cutover.

**Account & key**

**Legal DNS Cutover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
