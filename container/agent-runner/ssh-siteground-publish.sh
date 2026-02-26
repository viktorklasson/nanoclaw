#!/bin/bash
# Publish files to viktorklasson.com/s/ via git push.
# Files are copied into the site repo's s/ directory, committed, and pushed.
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

REPO_DIR="/workspace/extra/projects/viktorklasson.com"
PUBLISH_DIR="$REPO_DIR/s"
PUBLIC_URL="https://viktorklasson.com/s"

ACTION="$1"

if [ -z "$ACTION" ]; then
  echo "Usage:" >&2
  echo "  ssh-siteground-publish upload <local-file> [remote-name]" >&2
  echo "  ssh-siteground-publish list" >&2
  echo "  ssh-siteground-publish delete <remote-name>" >&2
  exit 1
fi

# Ensure s/ directory exists
mkdir -p "$PUBLISH_DIR"

# --- Block path traversal ---
validate_filename() {
  local name="$1"
  if echo "$name" | grep -qE '(\.\.)'; then
    echo "Error: filename cannot contain '..'" >&2
    exit 1
  fi
  if [ -z "$name" ]; then
    echo "Error: filename cannot be empty" >&2
    exit 1
  fi
  # Allow one level of subdirectory (e.g. assets/photo.jpg) but no deeper
  local depth
  depth=$(echo "$name" | tr -cd '/' | wc -c | tr -d ' ')
  if [ "$depth" -gt 1 ]; then
    echo "Error: only one subdirectory level allowed (e.g. assets/photo.jpg)" >&2
    exit 1
  fi
}

git_push() {
  cd "$REPO_DIR" || exit 1
  git add s/ 2>&1
  git commit -m "$1" 2>&1
  git push 2>&1
  local exit_code=$?
  cd - > /dev/null
  return $exit_code
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

    # Create subdirectory if needed (e.g. assets/photo.jpg)
    DEST_DIR=$(dirname "$PUBLISH_DIR/$REMOTE_NAME")
    mkdir -p "$DEST_DIR"

    # Copy file to publish directory
    cp "$LOCAL_FILE" "$PUBLISH_DIR/$REMOTE_NAME"

    # Commit and push
    git_push "publish: $REMOTE_NAME"
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
      echo "$PUBLIC_URL/$REMOTE_NAME"
    else
      echo "Error: git push failed" >&2
      exit $EXIT_CODE
    fi
    ;;

  list)
    ls -lh "$PUBLISH_DIR/" 2>/dev/null
    ;;

  delete)
    REMOTE_NAME="$2"
    if [ -z "$REMOTE_NAME" ]; then
      echo "Error: missing filename" >&2
      echo "Usage: ssh-siteground-publish delete <remote-name>" >&2
      exit 1
    fi

    validate_filename "$REMOTE_NAME"

    if [ ! -f "$PUBLISH_DIR/$REMOTE_NAME" ]; then
      echo "Error: file not found: $REMOTE_NAME" >&2
      exit 1
    fi

    rm -f "$PUBLISH_DIR/$REMOTE_NAME"

    cd "$REPO_DIR" || exit 1
    git add -A s/ 2>&1
    git commit -m "delete: $REMOTE_NAME" 2>&1
    git push 2>&1
    EXIT_CODE=$?
    cd - > /dev/null

    if [ $EXIT_CODE -eq 0 ]; then
      echo "Deleted: $REMOTE_NAME"
    else
      echo "Error: git push failed" >&2
      exit $EXIT_CODE
    fi
    ;;

  *)
    echo "Error: unknown action '$ACTION'" >&2
    echo "Valid actions: upload, list, delete" >&2
    exit 1
    ;;
esac
