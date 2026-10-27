# Transaction Ledger API

A Node.js, Express, MongoDB and Mongoose implementation of the Transaction Ledger API assessment.

## Requirements

- Node.js 20+
- MongoDB running as a **replica set** (MongoDB transactions require this), or MongoDB Atlas.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `MONGODB_URI`.
3. Start the API: `npm run dev` (or `npm start`).
4. Health check: `GET http://localhost:3000/health`

Example `.env` for a locally configured single-node replica set:
`MONGODB_URI=mongodb://127.0.0.1:27017/transaction_ledger?replicaSet=rs0`

If your local MongoDB is not configured as a replica set, configure one or use Atlas. Do not remove database transactions: atomicity is a core requirement of this assessment.

## API endpoints

### Create account

`POST /api/accounts`

```json
{ "name": "Asha" }
```

The server always initializes `balance` to `0`; a client-supplied balance is ignored. Returns `201`.

### Add a transaction

`POST /api/accounts/:accountId/transactions`

```json
{
  "type": "credit",
  "amount": 100,
  "description": "Opening deposit",
  "reference_id": "ref-001"
}
```

Use `type: "debit"` to withdraw. Amount must be a positive JSON number. A reference is unique within one account. Returns `201`; duplicate reference returns `409`; insufficient funds returns `422`.

### Get balance

`GET /api/accounts/:accountId/balance`
Response example:

```json
{ "data": { "account_id": "<id>", "balance": 100 } }
```

### Transaction history

`GET /api/accounts/:accountId/transactions?page=1&limit=10&type=credit`

- `type` is optional: `credit` or `debit`; omit it to return both.
- `page` defaults to 1; `limit` defaults to 10 and must be 1–100.
- Sorted newest first by `created_at` (with `_id` as a deterministic tie-breaker).
- Response includes `current_page`, `page_size`, `total_records`, and `total_pages`.

### Bonus: transfer

`POST /api/transfers`

```json
{
  "from_account_id": "<account-A-id>",
  "to_account_id": "<account-B-id>",
  "amount": 30,
  "reference_id": "transfer-001",
  "description": "Rent split"
}
```

Both accounts must exist and differ. The source must have sufficient funds. Source debit, destination credit, and both immutable ledger entries are in one database transaction; failure rolls everything back.

## Error format

```json
{
  "error": { "code": "INSUFFICIENT_BALANCE", "message": "Insufficient balance" }
}
```

Expected statuses include `400` validation error, `404` missing resource, `409` duplicate reference, and `422` insufficient balance.

## Data integrity choices / assumptions

- MongoDB ObjectId is used as the unique account and transaction `id`.
- Account balances start at zero; the API never accepts an opening balance.
- Transaction records are append-only from the API. No update/delete endpoints are exposed; immutable schema fields provide an extra safeguard.
- `reference_id` uniqueness is enforced with a database compound unique index on `(account_id, reference_id)` and checked in the transaction for a clearer error.
- Balance update and ledger insertion share a MongoDB session transaction. This requires a replica set or Atlas.
- Amounts are represented as JavaScript numbers for the scope of this assessment. For production financial systems, use integer minor units (e.g. paise/cents) or a decimal type to avoid floating-point rounding.
- The transaction history is sorted newest-first; `_id` breaks ties if timestamps match.

## Suggested manual test sequence

1. Create two accounts; save both IDs.
2. Credit account A by 100 with reference `a-1`; balance should be 100.
3. Debit 30 with reference `a-2`; balance should be 70.
4. Attempt debit 1000; expect `422`, balance remains 70, no ledger entry created.
5. Repeat reference `a-2` on account A; expect `409`, balance remains 70.
6. Use reference `a-2` on account B; it should be allowed because uniqueness is per account.
7. Transfer 20 from A to B; A becomes 50, B increases by 20.
8. Query history with `?page=1&limit=5`, then filter with `?type=debit`.

## Submission checklist

- Source code
- This README
- API documentation (endpoint and examples above)
- Assumptions section above
