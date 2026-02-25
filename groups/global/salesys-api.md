# SaleSys API

## Authentication

There are two authentication contexts. Always determine which one applies before making requests.

### 1. Global Token (Arbetsmallar and global operations)

Used for: creating/editing Arbetsmallar and any other global-scope endpoints.

Base URL: `https://admin.salesys.se/api`

The token is available directly as an environment variable:

```
Authorization: Bearer $SALESYS_API_TOKEN
Content-Type: application/json
```

If a request returns 401 (token rejected/expired), ask the user for a fresh token. Parse it from whatever format they provide (curl command, raw token, cookie header, etc.) to extract the Bearer value.

### 2. Customer Account Token (customer-specific operations)

Base URL: `https://app.salesys.se/api`

Used for: Orderarbeten, Samtalsarbeten, Webforms, and anything scoped to a specific customer account.

The flow uses the admin token to obtain a customer token in a single command — no email needed.

**Get token in one command**

```bash
node /app/get-customer-token.mjs <username>
```

This POSTs to the Support Codes endpoint with the admin token, captures the session cookie from the response, exchanges it for the customer bearer token, and prints it to stdout. Done in under a second.

**Verify the token**

```bash
curl 'https://app.salesys.se/api/users/organizations-v1/me' \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json'
```

A successful response confirms the token is valid and which organization is active.

**Use the token**

Use it as the Bearer token for all subsequent `https://app.salesys.se/api` requests.

**Instructions for Agana:**
1. If the username is not provided, list organizations first (`GET /api/users/organizations-v1?hidden=false`) and ask the user which one, then look up its users (`GET /api/users/users-v1?organizationId=<id>`) to find the username
2. Run `node /app/get-customer-token.mjs <username>` ONCE — this script handles everything internally. Do NOT also call the support-v1 POST endpoint manually; the script already does it.
3. Verify the token with the `/me` endpoint
4. Proceed with the original request
5. Do NOT store the customer token between sessions — re-authenticate when needed

Do NOT ask the user to provide the token. Do NOT call the support-v1 endpoint manually — always use the script.

---

## Important Constraints

**On customer accounts (authenticated via MFA token): READ and POST only.**
Never attempt PUT, PATCH, or DELETE requests on customer-scoped endpoints.
Creating new records (POST) is allowed. Modifying or deleting existing ones is not.

Global operations (using the global token, e.g. Arbetsmallar) have no such restriction.

---

## Common Types

- **ObjectId**: 24-character hex string (e.g. `6980c8fb34b2f626dcb70c5d`)
- **date-time**: ISO 8601 datetime string

## Common Field Patterns

SaleSys uses a key-value field system. Orders, contacts, and offers store custom data as arrays of `{ fieldId, value }` pairs. You must first fetch the field definitions to know which `fieldId` maps to which label and type.

---

## Contacts

Contacts represent customers, prospects, or companies. There is no separate "company" entity — a contact can represent either a person or a company, depending on which fields are filled in.

Contact field values are encrypted (AES) at rest. Each contact has custom fields, tags, comments, and associated calls/orders.

### Contact Schema

```json
{
  "id": "ObjectId",
  "serialId": 1,
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "tagIds": ["ObjectId"],
  "comments": [{ "id": "ObjectId", "message": "string", "userId": "ObjectId", "date": "date-time" }],
  "projectId": "ObjectId",
  "date": "date-time",
  "callIds": ["ObjectId"]
}
```

### Contact Field Definition Schema

```json
{
  "id": "ObjectId",
  "label": "string (max 100)",
  "type": "plain | date | numeric | phoneNumber",
  "projectIds": ["ObjectId"] // null = available in all projects
}
```

### Endpoints

**List contacts:**
```
GET /api/contacts/contacts-v1
  ?ids=ObjectId,ObjectId          # filter by IDs
  &phoneNumbers=+46701234567      # filter by phone numbers
  &projectIds=ObjectId            # filter by project
  &dialGroupId=ObjectId           # filter by call list (ringlista)
  &count=50                       # limit
  &offset=0                       # offset
  &sortBy=fieldId                 # sort field
  &sortOrder=ascending            # ascending or descending
→ Contact[]
```

**Get single contact:**
```
GET /api/contacts/contacts-v1/{contactId}
→ Contact or 404
```

**Count contacts:**
```
GET /api/contacts/contacts-v1/count
  ?phoneNumbers=...&projectIds=...&ids=...
→ { "count": integer }
```

**Create contact:**
```
POST /api/contacts/contacts-v1
Body: {
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],  // required
  "tagIds": ["ObjectId"],
  "projectId": "ObjectId"
}
→ { "contactId": "ObjectId", "serialId": integer }
```

**Add comment to contact:**
```
POST /api/contacts/contacts-v1/{contactId}/comments
Body: { "message": "string" }
→ { "commentId": "ObjectId" }
```

### Contact Fields (definitions)

**List field definitions:**
```
GET /api/contacts/fields-v1?count=100&offset=0
→ { "fields": [ContactField] }
```

**Create field:**
```
POST /api/contacts/fields-v1
Body: {
  "label": "string (max 100)",
  "type": "plain | date | numeric | phoneNumber",
  "projectIds": ["ObjectId"] // null = global
}
→ { "fieldId": "ObjectId" }
```

### Contact Tags

**List tags:**
```
GET /api/contacts/tags-v1
→ { "tags": [{ "id": "ObjectId", "name": "string", "color": "string", "position": integer }] }
```

**Create tag:**
```
POST /api/contacts/tags-v1
Body: { "name": "string", "color": "#hex", "position": integer }
→ { "tagId": "ObjectId" }
```

### Contact Update History

```
GET /api/contacts/contact-updates-v1/{contactId}
  ?count=50&offset=0&sortOrder=descending
→ [{ "id": "ObjectId", "contactId": "ObjectId", "userId": "ObjectId", "beforeUpdate": {}, "date": "date-time" }]
```

### How to Find a Company's Contacts

SaleSys has no "company" entity. Contacts represent both individuals and companies. To find contacts for a specific company:

1. Fetch contact field definitions: `GET /api/contacts/fields-v1` — find the field with label like "Företag" or "Company"
2. List contacts and filter by that field value, or search by phone number using `phoneNumbers` parameter
3. The `dialGroupId` parameter filters contacts by call list (ringlista/samtalsarbete)

### Examples

```bash
# List contact field definitions
curl 'https://app.salesys.se/api/contacts/fields-v1?count=100' \
  -H "Authorization: Bearer $TOKEN"

# List contacts for a specific call list
curl 'https://app.salesys.se/api/contacts/contacts-v1?dialGroupId=<id>&count=100' \
  -H "Authorization: Bearer $TOKEN"

# Get a single contact
curl 'https://app.salesys.se/api/contacts/contacts-v1/<contactId>' \
  -H "Authorization: Bearer $TOKEN"
```

---

## Orderarbeten

Orders represent completed sales. Each order contains custom fields (configured by admin), products, tags, comments, and file attachments. Field definitions for orders are managed via the admin UI (not available as a separate API endpoint).

### Order Schema

```json
{
  "id": "ObjectId",
  "serialId": 1,
  "userId": "ObjectId",
  "organizationId": "ObjectId",
  "projectId": "ObjectId",
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "products": [{
    "productId": "ObjectId",
    "quantity": 1,
    "price": 100,
    "salaryBasis": 80,
    "vat": 25
  }],
  "tagIds": ["ObjectId"],
  "businessDate": "date-time or null",
  "files": [{ "id": "ObjectId", "name": "string", "type": "string", "url": "string" }],
  "comments": [{ "id": "ObjectId", "message": "string", "userId": "ObjectId", "date": "date-time" }],
  "isTest": false,
  "date": "date-time"
}
```

### Endpoints

**List orders:**
```
GET /api/orders/orders-v3
  ?ids=ObjectId,ObjectId
  &userId=ObjectId              # filter by seller
  &projectId=ObjectId           # filter by project
  &tagIds=ObjectId,ObjectId     # filter by tags
  &from=2026-01-01T00:00:00Z   # start date
  &to=2026-02-01T00:00:00Z     # end date
  &count=50
  &offset=0
  &sortBy=date
  &sortOrder=descending
  &isTest=false                 # true, false, or any
→ OrderV3[]
```

**Get single order:**
```
GET /api/orders/orders-v3/{orderId}
→ OrderV3 or 404
```

**Count orders:**
```
GET /api/orders/orders-v2/count
  ?groupBy=userId&from=...&to=...
→ { "count": integer | object }
```

**Sum order values:**
```
GET /api/orders/orders-v2/sum
  ?groupBy=userId&fieldId=ObjectId&from=...&to=...
→ { "sum": number | object }
```

**Create order:**
```
POST /api/orders/orders-v2
Body: {
  "userId": "ObjectId",
  "projectId": "ObjectId",
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "products": [{ "productId": "ObjectId", "quantity": 1, "price": 100, "salaryBasis": 80, "vat": 25 }],
  "tagIds": ["ObjectId"],
  "businessDate": "date-time"
}
→ { "orderId": "ObjectId", "serialId": integer, "fileToken": "string" }
```

**Add comment:**
```
POST /api/orders/orders-v1/{orderId}/comments
Body: { "message": "string" }
→ { "commentId": "ObjectId" }
```

**Attach file:**
```
POST /api/orders/orders-v1/{orderId}/files
Header: X-File-Token: <fileToken from create>  (optional)
Body: multipart/form-data with "file" field
→ AttachedFile
```

### Examples

```bash
# List recent orders
curl 'https://app.salesys.se/api/orders/orders-v3?count=10&sortOrder=descending' \
  -H "Authorization: Bearer $TOKEN"

# Create an order
curl -X POST 'https://app.salesys.se/api/orders/orders-v2' \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "...",
    "projectId": "...",
    "fields": [{ "fieldId": "...", "value": "Acme Corp" }],
    "products": [{ "productId": "...", "quantity": 1, "price": 299, "salaryBasis": 200, "vat": 25 }],
    "tagIds": [],
    "businessDate": "2026-02-25T00:00:00Z"
  }'
```

---

## Samtalsarbeten

Samtalsarbeten (call work items) are call lists used for outbound calling campaigns. They group contacts into dial groups that agents work through.

Samtalsarbeten do NOT have dedicated CRUD API endpoints. They are managed through the admin UI. However, the API provides filtering by call list via contacts:

### How to Work with Samtalsarbeten via API

**List contacts in a specific samtalsarbete/call list:**
```
GET /api/contacts/contacts-v1?dialGroupId=<samtalsarbeteId>&count=100&offset=0
→ Contact[]
```

**Create a contact and assign to a project (which associates with a samtalsarbete):**
```
POST /api/contacts/contacts-v1
Body: {
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "projectId": "ObjectId"
}
```

The `dialGroupId` is the ObjectId of the samtalsarbete. Use it to filter contacts belonging to a specific call list.

### Examples

```bash
# List contacts in a call list
curl 'https://app.salesys.se/api/contacts/contacts-v1?dialGroupId=<id>&count=100' \
  -H "Authorization: Bearer $TOKEN"
```

---

## Offers / Avtal

Digital documents sent to customers for signing. Lifecycle: pending → signed / declined / cancelled / expired.

Signing methods (configured in templates): None, Draw (digital signature), One-click, BankID, SMS reply.

### Offer Schema

```json
{
  "id": "ObjectId",
  "serialId": 1,
  "publicId": "string or null",
  "status": "pending | signed | declined | cancelled | expired",
  "userId": "ObjectId",
  "organizationId": "ObjectId",
  "templateId": "ObjectId",
  "recipient": { "name": "string", "email": "string", "phone": "string" },
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "products": [{ "productId": "ObjectId", "quantity": 1, "price": 100, "salaryBasis": 80, "vat": 25 }],
  "files": [{ "id": "ObjectId", "name": "string", "type": "string", "url": "string" }],
  "comments": [{ "id": "ObjectId", "message": "string", "userId": "ObjectId", "date": "date-time" }],
  "expireAt": "date-time or null",
  "isTest": false,
  "date": "date-time"
}
```

### Endpoints

**List offers:**
```
GET /api/offers/offers-v2
  ?ids=ObjectId,ObjectId
  &userId=ObjectId
  &status=pending
  &from=2026-01-01T00:00:00Z
  &to=2026-02-01T00:00:00Z
  &count=50
  &offset=0
  &isTest=false
→ OfferV2[]
```

**Get single offer:**
```
GET /api/offers/offers-v2/{offerId}
→ OfferV2 or 404
```

**Count offers:**
```
GET /api/offers/offers-v1/count
  ?status=signed&userId=ObjectId&from=...&to=...
→ { "count": integer }
```

**Create offer:**
```
POST /api/offers/offers-v2
Body: {
  "templateId": "ObjectId",
  "userId": "ObjectId",
  "recipient": { "name": "string", "email": "email", "phone": "string" },
  "fields": [{ "fieldId": "ObjectId", "value": "string" }],
  "products": [{ "productId": "ObjectId", "quantity": 1, "price": 100, "salaryBasis": 80, "vat": 25 }],
  "expireAt": "date-time or null"
}
→ { "offerId": "ObjectId", "serialId": integer, "publicId": "string", "linkId": "string", "linkUrl": "string" }
```

**Add comment:**
```
POST /api/offers/offers-v1/{offerId}/comments
Body: { "message": "string" }
→ { "commentId": "ObjectId" }
```

**Attach file:**
```
POST /api/offers/offers-v1/{offerId}/files
Body: multipart/form-data with "file" field
→ AttachedFile
```

---

## Products

Products belong to categories and are selected when creating orders or offers. Product field definitions are managed in the admin UI.

### Product Schema

```json
{
  "id": "ObjectId",
  "name": "string",
  "description": "string or null",
  "price": 100,
  "vat": 25,
  "imageUrl": "string or null",
  "categoryId": "ObjectId",
  "position": 1,
  "fields": [{ "fieldId": "ObjectId", "value": "string" }]
}
```

### Endpoints

**List products:**
```
GET /api/products/products-v1
  ?ids=ObjectId,ObjectId
  &categoryId=ObjectId
  &count=50
  &offset=0
→ Product[]
```

**Get single product:**
```
GET /api/products/products-v1/{productId}
→ Product
```

**Create product:**
```
POST /api/products/products-v1
Body: {
  "name": "string",
  "description": "string",
  "price": 100,
  "vat": 25,
  "categoryId": "ObjectId",
  "fields": [{ "fieldId": "ObjectId", "value": "string" }]
}
→ { "productId": "ObjectId" }
```

---

## Arbetsmallar (Global Templates)

Arbetsmallar are global templates managed via the admin API (`https://admin.salesys.se/api`). They define the structure for both orderarbeten and samtalsarbeten — fields, products, flows, and settings.

**Note:** Arbetsmallar endpoints are NOT part of the customer API (`app.salesys.se`). They use the global admin token. Template management endpoints are not exposed in the public swagger spec — they are admin-UI driven. Templates are referenced by `templateId` in offers.

---

## Webforms

Webforms are e-sign checkout pages that let customers fill in and create agreements directly from a website. They are configured in the admin UI under Settings > Offers > Web Forms.

**Note:** Webform management endpoints are NOT exposed in the public API. They are admin-UI only. Webforms use HTML Handlebars templates and support form elements like text inputs, field lists, product selections, checkboxes, and multi-step flows.

---

## Users

### Endpoints

**Current user:**
```
GET /api/users/me-v1
→ User
```

**Current user with organization:**
```
GET /api/users/me-v1/extended
→ { user: User, organization: Organization }
```

**List users:**
```
GET /api/users/users-v1
  ?ids=ObjectId,ObjectId
  &type=standard            # standard, admin, systemUser, privateUser
  &active=true
  &suspended=false
  &count=50
  &offset=0
→ User[]
```

### User Schema

```json
{
  "id": "ObjectId",
  "type": "standard | admin | systemUser | privateUser",
  "fullName": "string",
  "username": "string",
  "alias": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "teamId": "ObjectId",
  "supervisedTeamIds": ["ObjectId"],
  "roleIds": ["ObjectId"],
  "organizationId": "ObjectId",
  "rights": ["string"],
  "features": ["string"],
  "createdAt": "date-time",
  "suspended": false,
  "identityNumber": "string"
}
```

---

## Calendar Events

### Endpoints

**List events:**
```
GET /api/calendar/calendar-events-v2
  ?userIds=ObjectId,ObjectId
  &from=2026-01-01T00:00:00Z
  &to=2026-02-01T00:00:00Z
  &projectIds=ObjectId
  &count=50
  &offset=0
→ CalendarEvent[]
```

**Get single event:**
```
GET /api/calendar/calendar-events-v2/{eventId}
→ CalendarEvent
```

**Create event:**
```
POST /api/calendar/calendar-events-v1/{userId}
Body: {
  "title": "string",          // required
  "description": "string",
  "startAt": "date-time",     // required
  "endAt": "date-time",       // required
  "color": "#hex",
  "projectId": "ObjectId",
  "orderId": "ObjectId",
  "contactId": "ObjectId"
}
→ { "eventId": "ObjectId" }
```

### CalendarEvent Schema

```json
{
  "id": "ObjectId",
  "userId": "ObjectId",
  "title": "string",
  "description": "string or null",
  "startAt": "date-time",
  "endAt": "date-time",
  "color": "string or null",
  "isRecurring": false,
  "files": [],
  "projectId": "ObjectId",
  "orderId": "ObjectId or null",
  "contactId": "ObjectId or null"
}
```

---

## Webhooks

**List webhooks (admin):**
```
GET /api/events/webhooks-v1
→ Webhook[]
```

**Create webhook (admin):**
```
POST /api/events/webhooks-v1
Body: {
  "url": "https://example.com/hook",
  "events": [{ "name": "order-created-v1" }],
  "description": "string"
}
→ { "webhookId": "ObjectId" }
```

**Supported event names:**
- `order-created-v1`
- `order-updated-v1`
- `calendar-event-updated-v1`

---

## Exclude Lists (Sparrlistor)

Lists of phone numbers or strings to exclude from calling campaigns.

**List exclude lists:**
```
GET /api/contacts/exclude-lists-v1
→ ExcludeList[]
```

**Create exclude list:**
```
POST /api/contacts/exclude-lists-v1
Body: { "name": "string", "isGlobal": false }
→ { "listId": "ObjectId" }
```

**Add strings to list:**
```
POST /api/contacts/exclude-lists-v1/{listId}/strings
Body: { "strings": ["+46701234567", "+46709876543"], "reference": {} }
```

**List strings in lists:**
```
GET /api/contacts/exclude-lists-v1/strings?listIds=ObjectId&count=100&offset=0
→ ExcludeListString[]
```

**Check contacts against lists:**
```
GET /api/contacts/exclude-lists-v1/contacts?contactIds=ObjectId,ObjectId&listIds=ObjectId
→ [{ "contactId": "ObjectId", "listIds": ["ObjectId"] }]
```

---

## Organizations

List all organizations (non-hidden). Uses the global token.

### Endpoint

```
GET https://admin.salesys.se/api/users/organizations-v1?hidden=false
```

### Response

Array of organization objects:

```json
[
  {
    "id": "6980c8fb34b2f626dcb70c5d",
    "name": "Eleveight Sweden AB",
    "identityNumber": "5594668781",
    "address": "johan.svensson@eleveight.se",
    "postalCode": "41251",
    "city": "Göteborg",
    "createdFrom": "213.115.115.81",
    "phone": "0793366926",
    "features": [
      {
        "id": "6981ae614e9a8303d678c0a5",
        "feature": "dashboard",
        "since": "2026-02-03T08:14:25.000Z"
      }
    ],
    "defaultUserPreferences": {
      "enabledOrderListHeadingIds": ["user", "serialId", "sum", "date", "tags", "businessDate"]
    },
    "countries": ["se"],
    "createdAt": "2026-02-02T15:55:39.000Z",
    "type": "organization",
    "simpleId": "eleveightsweden"
  }
]
```

### Example

```bash
curl 'https://admin.salesys.se/api/users/organizations-v1?hidden=false' \
  -H "Authorization: Bearer $SALESYS_API_TOKEN" \
  -H 'Content-Type: application/json'
```

---

## Support Codes

> **Do not call this endpoint directly.** Use `node /app/get-customer-token.mjs <username>` instead — it calls this internally and handles the full token exchange.

This endpoint is used internally by `get-customer-token.mjs`. Calling it manually while also running the script will trigger duplicate support emails to the customer.

---

## Common Patterns

### Pagination

All list endpoints support `count` and `offset` query parameters:

```
GET /api/contacts/contacts-v1?count=50&offset=0    # first page
GET /api/contacts/contacts-v1?count=50&offset=50   # second page
```

### Sorting

```
GET /api/orders/orders-v3?sortBy=date&sortOrder=descending
```

`sortOrder` accepts `ascending` or `descending`.

### Error Codes

```
400 — Bad request (missing/invalid fields)
401 — Invalid or expired token
404 — Resource not found
422 — Validation error (see response body for details)
```
