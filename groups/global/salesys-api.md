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

The flow uses the admin token to request a customer token, which is delivered via email.

**Step 1 — Request token via Support Codes endpoint (uses admin token)**

```bash
curl -X POST 'https://admin.salesys.se/api/users/support-v1' \
  -H "Authorization: Bearer $SALESYS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username": "<salesys_username>"}'
```

Returns HTTP 201 on success. SaleSys sends an email (subject: "Serviceinlogg för ...") to agana@salesys.se containing a SafeLinks-wrapped URL. Following that URL yields the customer bearer token.

**Step 2 — Fetch token from inbox automatically**

```bash
node /app/fetch-mfa-code.mjs 60 salesys
```

This polls agana@salesys.se for up to 60 seconds and prints the `login-...` token.

**Step 3 — Verify the token**

```bash
curl 'https://app.salesys.se/api/users/organizations-v1/me' \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json'
```

A successful response confirms the token is valid and which organization is active.

**Step 4 — Use the token**

Use it as the Bearer token for all subsequent `https://app.salesys.se/api` requests.

**Instructions for Agana:**
1. If the username is not provided, list organizations first (`GET /api/users/organizations-v1?hidden=false`) and ask the user which one, then use its `simpleId` or the associated username
2. Call the Support Codes endpoint with the admin token
3. Immediately run the inbox poller — do NOT wait or ask the user
4. Verify the token with the `/me` endpoint
5. Proceed with the original request
6. Do NOT store the customer token between sessions — re-authenticate when needed

Do NOT ask the user to provide the token — fetch it automatically from the inbox.

---

## Important Constraints

**On customer accounts (authenticated via MFA token): READ and POST only.**
Never attempt PUT, PATCH, or DELETE requests on customer-scoped endpoints.
Creating new records (POST) is allowed. Modifying or deleting existing ones is not.

Global operations (using the global token, e.g. Arbetsmallar) have no such restriction.

---

## Orderarbeten

<!-- What is an Orderarbete? Describe the concept here. -->

### Endpoints

<!-- Example structure — fill in real paths, params, and response shapes:

GET    $SALESYS_API_BASE_URL/orderarbeten
POST   $SALESYS_API_BASE_URL/orderarbeten
GET    $SALESYS_API_BASE_URL/orderarbeten/{id}
PUT    $SALESYS_API_BASE_URL/orderarbeten/{id}
DELETE $SALESYS_API_BASE_URL/orderarbeten/{id}

-->

### Fields

<!-- List the fields for create/update payloads:

{
  "field_name": "type — description",
  ...
}

-->

### Examples

<!-- curl examples for common operations -->

---

## Samtalsarbeten

<!-- What is a Samtalsarbete? Describe the concept here. -->

### Endpoints

<!--
GET    $SALESYS_API_BASE_URL/samtalsarbeten
POST   $SALESYS_API_BASE_URL/samtalsarbeten
GET    $SALESYS_API_BASE_URL/samtalsarbeten/{id}
PUT    $SALESYS_API_BASE_URL/samtalsarbeten/{id}
DELETE $SALESYS_API_BASE_URL/samtalsarbeten/{id}
-->

### Fields

<!--
{
  "field_name": "type — description",
  ...
}
-->

### Examples

---

## Arbetsmallar (Global Templates)

<!-- Arbetsmallar are global templates used for both Orderarbeten and Samtalsarbeten. -->

### Endpoints

<!--
GET    $SALESYS_API_BASE_URL/arbetsmallar
POST   $SALESYS_API_BASE_URL/arbetsmallar
GET    $SALESYS_API_BASE_URL/arbetsmallar/{id}
PUT    $SALESYS_API_BASE_URL/arbetsmallar/{id}
DELETE $SALESYS_API_BASE_URL/arbetsmallar/{id}
-->

### Fields

<!--
{
  "field_name": "type — description",
  ...
}
-->

### Examples

---

## Webforms

<!-- Webforms are e-sign checkout pages built with HTML Handlebars templates. -->

### Endpoints

<!--
GET    $SALESYS_API_BASE_URL/webforms
POST   $SALESYS_API_BASE_URL/webforms
GET    $SALESYS_API_BASE_URL/webforms/{id}
PUT    $SALESYS_API_BASE_URL/webforms/{id}
DELETE $SALESYS_API_BASE_URL/webforms/{id}
-->

### Fields

<!--
{
  "field_name": "type — description",
  ...
}
-->

### Handlebars Variables

<!-- List the template variables available in the HTML:

{{variable_name}} — description

-->

### Examples

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
      "enabledOrderListHeadingIds": ["user", "serialId", "sum", "date", "tags", "businessDate", ...]
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

Generate a support login code for a given username. Uses the global token.

### Endpoint

```
POST https://admin.salesys.se/api/users/support-v1
```

### Request Body

```json
{
  "username": "<salesys_username>"
}
```

### Response

Returns `"Created"` (HTTP 201) on success.

### Example

```bash
curl -X POST 'https://admin.salesys.se/api/users/support-v1' \
  -H "Authorization: Bearer $SALESYS_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"username":"some_username"}'
```

---

## Common Patterns

<!-- Add any common patterns, pagination, filtering, error codes, etc. here -->

### Pagination

<!--
GET $SALESYS_API_BASE_URL/orderarbeten?page=1&per_page=50
-->

### Error Codes

<!--
400 — Bad request (missing/invalid fields)
401 — Invalid or expired token
404 — Resource not found
422 — Validation error (see response body for details)
-->
