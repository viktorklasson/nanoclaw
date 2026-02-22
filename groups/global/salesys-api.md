# SaleSys API

## Authentication

There are two authentication contexts. Always determine which one applies before making requests.

### 1. Global Token (Arbetsmallar and global operations)

Used for: creating/editing Arbetsmallar and any other global-scope endpoints.

Base URL: `https://admin.salesys.se/api`

Read token from environment:
```bash
SALESYS_API_TOKEN=$(grep '^SALESYS_API_TOKEN=' ~/nanoclaw/.env | cut -d= -f2-)
```

Include in every admin request:
```
Authorization: Bearer $SALESYS_API_TOKEN
Content-Type: application/json
```

If a request returns 401 (token rejected/expired), ask the user for a fresh token. Parse it from whatever format they provide (curl command, raw token, cookie header, etc.) to extract the Bearer value.

### 2. Customer Account Token (customer-specific operations)

Base URL: `https://app.salesys.se/api`

Used for: Orderarbeten, Samtalsarbeten, Webforms, and anything scoped to a specific customer account.

This requires a two-step MFA flow:

**Step 1 — Request MFA code**

<!-- Fill in the real endpoint and payload:

curl -X POST "$SALESYS_API_BASE_URL/auth/mfa/request" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "<customer_id>",
    "email": "viktor.klasson@hotmail.com"
  }'

-->

After this request, an MFA code is sent to viktor.klasson@hotmail.com.

**Step 2 — Submit MFA code to get customer token**

<!-- Fill in the real endpoint and payload:

curl -X POST "$SALESYS_API_BASE_URL/auth/mfa/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "<customer_id>",
    "code": "<mfa_code>"
  }'

Response:
{
  "token": "<customer_scoped_token>"
}

-->

Use the returned token as the Bearer token for all subsequent requests on that customer's account.

**MFA flow instructions for Agana:**
1. Ask the user which customer account to authenticate against (if not already specified)
2. Make the MFA request to trigger the code email
3. Immediately run the inbox poller to fetch the code automatically:
   ```bash
   node /app/fetch-mfa-code.mjs 60 salesys
   ```
   This polls viktor.klasson@hotmail.com for up to 60 seconds and prints the code.
   Pass a sender keyword (e.g. `salesys`) to filter by sender/subject.
4. Use the printed code to get the customer token
5. Proceed with the original request using that token
6. Do NOT store the customer token between sessions — re-authenticate each time it is needed

Do NOT ask the user to paste the MFA code — fetch it automatically from the inbox.

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
