#!/bin/bash
# Read-only SSH access to SiteGround server.
# Blocks any command that could write, delete, or modify files.
#
# Usage:
#   ssh-siteground "cat /path/to/file.php"
#   ssh-siteground "ls -la /path/to/dir"
#   ssh-siteground "find /path -name '*.php'"
#   ssh-siteground "grep -r 'pattern' /path"

SITEGROUND_HOST="c122990.sgvps.net"
SITEGROUND_PORT="18765"
SITEGROUND_USER="u4-agwza1fud06y"
SITEGROUND_KEY="/home/node/.ssh/siteground_id_ed25519"

if [ -z "$1" ]; then
  echo "Usage: ssh-siteground \"<command>\"" >&2
  exit 1
fi

CMD="$*"

# Block write/destructive operations
if echo "$CMD" | grep -qE '(>>?[^>]|[^<]<[^<]|\brm\b|\bmv\b|\bcp\b|\bchmod\b|\bchown\b|\btouch\b|\bmkdir\b|\brmdir\b|\bwget\b|\bcurl\b|\bdd\b|\btruncate\b|\btee\b|\bsed -i\b|\bwrite\b|\binstall\b|\bapt\b|\byum\b|\bnpm\b|\bpip\b|\bchsh\b|\bpasswd\b|\bcrontab -[^l]\b)'; then
  echo "Error: only read operations are permitted on the SiteGround server" >&2
  exit 1
fi

# Only allow known-safe commands as the first command
FIRST_CMD=$(echo "$CMD" | awk '{print $1}' | tr -d '"'"'")
case "$FIRST_CMD" in
  cat|ls|find|grep|head|tail|wc|stat|file|echo|pwd|which|php|less|more|du|df|diff|sort|uniq|cut|awk|sed|tr|basename|dirname|realpath|readlink|env|printenv|id|whoami|uname|hostname|date|tree|zcat|gunzip|tar)
    ;;
  *)
    echo "Error: command '$FIRST_CMD' is not allowed (read-only access only)" >&2
    exit 1
    ;;
esac

# Set up SSH askpass for passphrase
ASKPASS=$(mktemp /tmp/askpass-XXXXXX.sh)
cat > "$ASKPASS" << 'ASKEOF'
#!/bin/sh
echo "$SITEGROUND_SSH_PASSPHRASE"
ASKEOF
chmod +x "$ASKPASS"

# Start ssh-agent and load the key
eval "$(ssh-agent -s)" > /dev/null 2>&1
SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force ssh-add "$SITEGROUND_KEY" > /dev/null 2>&1
rm -f "$ASKPASS"

# Run the command read-only
ssh \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o LogLevel=ERROR \
  -p "$SITEGROUND_PORT" \
  "$SITEGROUND_USER@$SITEGROUND_HOST" \
  "$CMD"

EXIT_CODE=$?
kill "$SSH_AGENT_PID" > /dev/null 2>&1
exit $EXIT_CODE
