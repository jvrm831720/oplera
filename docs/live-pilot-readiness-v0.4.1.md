# Oplera V0.4.1 — Live Pilot Readiness

V0.4.1 keeps the V0.4 Recovery Engine, scoring, Planner, Policy Engine, Task Queue and Operator Console intact. It adds a narrow live boundary for one CRM and one messaging provider:

- CRM: HubSpot
- Messaging: Meta WhatsApp Cloud API

The pilot path is:

```text
HubSpot allowlisted deal
→ RecoveryCandidate mapping
→ existing score
→ existing planner
→ existing Policy Engine
→ mandatory first-contact approval
→ WhatsApp Cloud API
→ signed incoming webhook
→ existing Conversation Agent / Recovery Engine
→ HubSpot note + recovery status writeback
```

## 1. HubSpot setup

Create a HubSpot private app for the pilot and keep its token server-side only. Grant only the scopes required by the account for the objects used here. The adapter reads deals, contacts, companies, notes, calls, emails and meetings and writes deal properties and notes. Typical scopes are:

- `crm.objects.deals.read`
- `crm.objects.deals.write`
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`
- `crm.objects.companies.read`
- `sales-email-read` when email activities are available to the account

Create these custom deal properties before enabling the adapter:

| Internal name | Type | Purpose |
| --- | --- | --- |
| `oplera_recovery_status` | single-line text | Oplera recovery lifecycle state |
| `oplera_recovery_attempts` | number | number of recovery contact attempts |
| `oplera_active_human_conversation` | boolean | hard suppression while a human owns the conversation |

If the account uses different internal property names, set the corresponding env vars instead of changing code.

`HUBSPOT_DEAL_IDS` is mandatory and is the CRM-side pilot allowlist. The adapter refuses reads or writes for any deal outside it.

Phone numbers on the associated HubSpot contact must be usable as E.164. `mobilephone` is preferred, with `phone` as fallback.

### HubSpot activity import

For every allowlisted deal the adapter imports associated:

- contacts;
- companies;
- notes;
- calls;
- emails;
- meetings.

These records become evidence and deterministic scoring signals. Oplera-created WhatsApp transcript notes use the exact prefixes `[OPLERA_INBOUND]` and `[OPLERA_OUTBOUND]`. Only these explicit WhatsApp transcript notes feed the existing WhatsApp service-window conversation state, so an unrelated email or internal note cannot accidentally open the 24-hour WhatsApp window.

### HubSpot writeback

After a confirmed live send, Oplera:

1. creates an `[OPLERA_OUTBOUND]` note;
2. increments `oplera_recovery_attempts`;
3. creates an `[OPLERA_ACTIVITY]` audit note with the provider message ID;
4. updates `oplera_recovery_status` to `awaiting_reply`.

Incoming WhatsApp messages are appended as `[OPLERA_INBOUND]` notes before the existing Conversation Agent updates recovery state.

## 2. WhatsApp Cloud API setup

Configure a Meta app with WhatsApp Cloud API and obtain:

- access token;
- WhatsApp phone number ID;
- app secret;
- a supported Graph API version;
- webhook verify token.

Create and approve a template named by `WHATSAPP_TEMPLATE_NAME`. V0.4.1 expects one BODY text variable containing the contact first name. Example intent:

```text
Olá, {{1}}. Estou retomando uma conversa comercial anterior. Podemos continuar por aqui?
```

Do not hardcode a Graph version in code. Set `WHATSAPP_GRAPH_VERSION` explicitly to a version currently supported by the Meta app.

Configure the callback URL:

```text
https://YOUR_OPLERA_HOST/api/v0.4.1/pilot/webhooks/whatsapp
```

The GET verification challenge uses `WHATSAPP_VERIFY_TOKEN`. POST deliveries are rejected unless `x-hub-signature-256` validates against `WHATSAPP_APP_SECRET`.

Only text messages are processed in V0.4.1. Other webhook message types are ignored rather than expanded into new product scope.

## 3. Environment

Copy `.env.pilot.example` and populate it only in the server runtime. Never expose these values to Vite/browser variables.

The safety defaults are deliberate:

```env
PILOT_DRY_RUN=true
PILOT_KILL_SWITCH=true
```

`PILOT_PHONE_ALLOWLIST` is mandatory. Even an allowlisted HubSpot deal cannot send to a number absent from this E.164 list.

`PILOT_ADMIN_TOKEN` protects preview, approval and execution endpoints. Use at least 32 random characters and rotate it after the pilot.

## 4. Dry-run before live

Start the API:

```bash
bun install --frozen-lockfile
bun run dev:api
```

Check safety state:

```bash
curl http://localhost:3001/api/v0.4.1/pilot/health
```

List only allowlisted opportunities:

```bash
curl -H "Authorization: Bearer $PILOT_ADMIN_TOKEN" \
  http://localhost:3001/api/v0.4.1/pilot/opportunities
```

Preview one opportunity. This runs real HubSpot import, scoring, planning and policy without sending:

```bash
curl -H "Authorization: Bearer $PILOT_ADMIN_TOKEN" \
  http://localhost:3001/api/v0.4.1/pilot/opportunities/DEAL_ID/preview
```

Approve the exact first-contact fingerprint:

```bash
curl -X POST \
  -H "Authorization: Bearer $PILOT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"approved_by":"operator@example.com"}' \
  http://localhost:3001/api/v0.4.1/pilot/opportunities/DEAL_ID/approve
```

Execute while `PILOT_DRY_RUN=true`:

```bash
curl -X POST \
  -H "Authorization: Bearer $PILOT_ADMIN_TOKEN" \
  http://localhost:3001/api/v0.4.1/pilot/opportunities/DEAL_ID/execute
```

Dry-run creates a durable idempotency result in the pilot SQLite state but performs no WhatsApp network call and no HubSpot writeback.

## 5. Enable one live contact

After reviewing the dry-run output:

1. keep exactly one HubSpot deal in `HUBSPOT_DEAL_IDS`;
2. keep exactly its E.164 phone number in `PILOT_PHONE_ALLOWLIST`;
3. set `PILOT_DRY_RUN=false`;
4. set `PILOT_KILL_SWITCH=false`;
5. restart the server;
6. preview again;
7. approve again if the fingerprint changed;
8. execute once.

The first contact always requires explicit human approval when `candidate.attempt === 0`. Approval never overrides Policy Engine blocks such as opt-out, active human conversation, max attempts, contact hours or weekdays.

When the existing 24-hour WhatsApp service window is open, the pilot sends the existing V0.4 free-form draft. When it is closed or unknown, the pilot selects the configured approved template and asks the existing Policy Engine to validate `approved_template` with provider support. There is no second 24-hour formula.

## 6. Idempotency

`PilotStateStore` uses SQLite and persists:

- outbound idempotency keys and provider message IDs;
- CRM writeback completion;
- processed inbound WhatsApp message IDs;
- first-contact approval fingerprints.

A retry with the same outbound key returns the original provider result. CRM writeback is also marked separately so a process failure after WhatsApp acceptance can retry the writeback without sending the message again.

For the pilot, run a single Oplera process against a persistent filesystem path. This SQLite state is not a distributed multi-node queue and does not replace the existing V0.4 Task Queue.

## 7. Kill switch

`PILOT_KILL_SWITCH=true` blocks any real WhatsApp network send. Dry-run may still calculate previews and idempotency records because it has no external messaging or CRM side effects.

In an incident, set the kill switch to true and restart the pilot process before investigating.

## 8. Error observability

Provider failures emit structured JSON logs with:

- component;
- timestamp;
- event;
- HTTP status when available;
- safe path / idempotency identifiers;
- truncated provider response body.

Access tokens, app secrets and admin tokens are never logged.

## 9. What V0.4.1 intentionally does not add

- no new dashboard;
- no new agent;
- no second CRM;
- no second messaging channel;
- no billing;
- no customer authentication;
- no multi-tenancy;
- no enrichment;
- no replacement of the V0.4 Operator Console;
- no replacement of Recovery Engine, scoring, Planner, Policy Engine or Task Queue.

The live pilot is deliberately narrow. Humans have invented enough ways to turn “one integration” into an ERP; this branch declines the invitation.
