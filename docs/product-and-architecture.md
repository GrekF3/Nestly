# YUU platform direction

## Product promise

YUU is a long-stay rental marketplace for people moving within Thailand or arriving from abroad. Search, compare and request a viewing must work before a user has to understand local rental jargon.

The product differentiates on evidence and total cost:

- A home passport shows each completed check separately: owner identity, right to list, location, media recency and lease terms. A missing check stays visibly missing. A generic verified badge must never be inferred from an owner-submitted listing.
- The move-in ledger shows first rent, security deposit, broker fee and any disclosed one-time fee as separate amounts, with the total calculated from stored terms. It must never imply that YUU guarantees a one-month deposit unless a real deposit product backs that claim.
- A move-in and move-out condition checklist can preserve dated evidence for deposit disputes. The first release can record and export a checklist; actual adjudication requires an operations process and terms.

Airbnb already offers monthly payment schedules and listing location verification, so those alone are not YUU differentiators. YUU should make the evidence, upfront cash need and exit obligations legible for a six-month-or-longer tenancy.

Reference points: [Airbnb monthly payments](https://www.airbnb.com/help/article/245) and [Airbnb listing location verification](https://www.airbnb.com/help/article/3542).

## Service boundaries

| Surface | Owns | Trust boundary |
| --- | --- | --- |
| Web app | Search, listing pages, renter and owner forms, admin and support UI | Browser input is untrusted. No secrets or authorization decisions. |
| API | Accounts, sessions, role checks, listings, verification decisions, viewings, support tickets and payment intent records | Validates every request and queries durable storage. |
| Workers | Queued notifications and a mock payment state machine | Only accepts signed service calls; mock mode never charges a card. |

The current Sites checkout is the web deployment. API route adapters may run with it during migration, but domain code must remain independent so the API can be deployed as a separate service. The notification/payment Worker is independently deployable. Production wiring needs explicit service credentials and a backend URL or service binding.

## Launch gates

Before calling the marketplace publicly production-ready, verify all of these against a deployed environment:

1. Persistent schema and migrations are applied; registration, login, logout, phone verification, session expiry and rate limits work across devices.
2. A non-admin cannot publish, verify, or view another person's private records. Every mutation validates input and protects against cross-site requests.
3. Submitted homes stay pending until a real operator reviews evidence. Audit records identify who changed each status and when.
4. Viewing and support requests persist, have recoverable error states, and reach an staffed queue or configured delivery channel. The intake can be available 24/7; human response time needs an operations commitment.
5. The payment experience is labeled as a simulation until a licensed provider is contracted, configured and legally reviewed. No card details are collected by YUU in mock mode.
6. Mobile and desktop flows, accessibility, build, type checks and dependency audit pass. Critical and high production dependency findings are resolved before public launch.
7. The private GitHub repository and deployment source point to the same reviewed commit. Secrets live in hosting configuration, never Git.

## Open operational decisions

- Select and contract a Thai-capable payment provider before enabling real charges or deposits.
- Select an SMS delivery provider and sender identity; without one, phone verification remains a local-development simulation and must be disabled in production.
- Staff and define hours, response targets and escalation for support. Ticket intake does not equal live human support.
- Confirm rental, consumer, privacy and payment terms with local counsel before opening the service to the public.
