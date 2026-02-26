#!/bin/bash
# Safe SaleSys API wrapper — blocks destructive HTTP methods.
# Use this instead of curl for all SaleSys API requests.
#
# Allowed methods: GET, POST
# Blocked methods: PUT, DELETE, PATCH
#
# Usage (same as curl):
#   salesys-curl https://api.salesys.se/...
#   salesys-curl -X POST -d '{"name":"test"}' https://api.salesys.se/...

ALLOWED_METHODS="GET POST HEAD OPTIONS"

# Parse the method from arguments
METHOD="GET"
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X|--request)
      METHOD="${2^^}"  # uppercase
      ARGS+=("$1" "$2")
      shift 2
      ;;
    -d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form)
      # Presence of data implies POST if no -X given
      if [[ "$METHOD" == "GET" ]]; then
        METHOD="POST"
      fi
      ARGS+=("$1" "$2")
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

# Check if method is allowed
ALLOWED=false
for m in $ALLOWED_METHODS; do
  if [[ "$METHOD" == "$m" ]]; then
    ALLOWED=true
    break
  fi
done

if [[ "$ALLOWED" != "true" ]]; then
  echo "Error: HTTP method $METHOD is blocked. Only GET and POST are allowed for SaleSys." >&2
  echo "This is a safety measure to prevent accidental data modification or deletion." >&2
  exit 1
fi

exec curl "${ARGS[@]}"
