#!/bin/bash
# Publish files to viktorklasson.com/s/ via SiteGround SSH.
# Restricted to a single directory — cannot write anywhere else.
#
# Usage:
#   ssh-siteground-publish upload <local-file> [remote-name]
#   ssh-siteground-publish list
#   ssh-siteground-publish delete <remote-name>
#
# Examples:
#   ssh-siteground-publish upload /workspace/group/presentation.html slides.html
#   ssh-siteground-publish upload /workspace/group/pitch.html
#   ssh-siteground-publish list
#   ssh-siteground-publish delete old-file.html

SITEGROUND_HOST="c122990.sgvps.net"
SITEGROUND_PORT="18765"
SITEGROUND_USER="u4-agwza1fud06y"
SITEGROUND_KEY="/home/node/.ssh/siteground_id_ed25519"
PUBLISH_DIR="/home/u4-agwza1fud06y/www/viktorklasson.com/public_html/s"
PUBLIC_URL="https://viktorklasson.com/s"

ACTION="$1"

if [ -z "$ACTION" ]; then
  echo "Usage:" >&2
  echo "  ssh-siteground-publish upload <local-file> [remote-name]" >&2
  echo "  ssh-siteground-publish list" >&2
  echo "  ssh-siteground-publish delete <remote-name>" >&2
  exit 1
fi

# --- SSH agent setup ---
setup_ssh() {
  ASKPASS=$(mktemp /tmp/askpass-XXXXXX.sh)
  cat > "$ASKPASS" << 'ASKEOF'
#!/bin/sh
echo "$SITEGROUND_SSH_PASSPHRASE"
ASKEOF
  chmod +x "$ASKPASS"
  eval "$(ssh-agent -s)" > /dev/null 2>&1
  SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force ssh-add "$SITEGROUND_KEY" > /dev/null 2>&1
  rm -f "$ASKPASS"
}

cleanup_ssh() {
  kill "$SSH_AGENT_PID" > /dev/null 2>&1
}

run_ssh() {
  ssh \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR \
    -p "$SITEGROUND_PORT" \
    "$SITEGROUND_USER@$SITEGROUND_HOST" \
    "$@"
}

run_scp() {
  scp \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR \
    -P "$SITEGROUND_PORT" \
    "$@"
}

# --- Block path traversal ---
validate_filename() {
  local name="$1"
  if echo "$name" | grep -qE '(\.\.|\/)'; then
    echo "Error: filename cannot contain '..' or '/'" >&2
    exit 1
  fi
  if [ -z "$name" ]; then
    echo "Error: filename cannot be empty" >&2
    exit 1
  fi
}

case "$ACTION" in
  upload)
    LOCAL_FILE="$2"
    REMOTE_NAME="$3"

    if [ -z "$LOCAL_FILE" ]; then
      echo "Error: missing local file path" >&2
      echo "Usage: ssh-siteground-publish upload <local-file> [remote-name]" >&2
      exit 1
    fi

    if [ ! -f "$LOCAL_FILE" ]; then
      echo "Error: file not found: $LOCAL_FILE" >&2
      exit 1
    fi

    # Default remote name = local filename
    if [ -z "$REMOTE_NAME" ]; then
      REMOTE_NAME=$(basename "$LOCAL_FILE")
    fi

    validate_filename "$REMOTE_NAME"

    setup_ssh

    # Ensure publish directory exists
    run_ssh "mkdir -p '$PUBLISH_DIR'"

    # Upload
    run_scp "$LOCAL_FILE" "$SITEGROUND_USER@$SITEGROUND_HOST:$PUBLISH_DIR/$REMOTE_NAME"
    EXIT_CODE=$?

    cleanup_ssh

    if [ $EXIT_CODE -eq 0 ]; then
      echo "$PUBLIC_URL/$REMOTE_NAME"
    else
      echo "Error: upload failed" >&2
      exit $EXIT_CODE
    fi
    ;;

  list)
    setup_ssh
    run_ssh "ls -lh '$PUBLISH_DIR/' 2>/dev/null"
    EXIT_CODE=$?
    cleanup_ssh
    exit $EXIT_CODE
    ;;

  delete)
    REMOTE_NAME="$2"
    if [ -z "$REMOTE_NAME" ]; then
      echo "Error: missing filename" >&2
      echo "Usage: ssh-siteground-publish delete <remote-name>" >&2
      exit 1
    fi

    validate_filename "$REMOTE_NAME"

    setup_ssh
    run_ssh "rm -f '$PUBLISH_DIR/$REMOTE_NAME'"
    EXIT_CODE=$?
    cleanup_ssh

    if [ $EXIT_CODE -eq 0 ]; then
      echo "Deleted: $REMOTE_NAME"
    else
      echo "Error: delete failed" >&2
      exit $EXIT_CODE
    fi
    ;;

  *)
    echo "Error: unknown action '$ACTION'" >&2
    echo "Valid actions: upload, list, delete" >&2
    exit 1
    ;;
esac
