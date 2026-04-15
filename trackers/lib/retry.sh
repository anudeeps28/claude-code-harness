#!/usr/bin/env bash
# retry.sh — Shared retry wrapper with exponential backoff for tracker scripts.
#
# Source this file in any tracker script, then wrap your API call with `with_retry`.
#
# Usage:
#   source "$(dirname "$0")/../lib/retry.sh"
#   with_retry az boards work-item show --id "$ID" --output json
#
# Behaviour:
#   - 3 attempts total (1 initial + 2 retries)
#   - Backoff: 1s after 1st failure, 3s after 2nd failure
#   - Retries on non-zero exit code only (not on valid empty output)
#   - Prints retry warnings to stderr so they don't corrupt JSON output

RETRY_MAX_ATTEMPTS="${RETRY_MAX_ATTEMPTS:-3}"
RETRY_BACKOFF_1="${RETRY_BACKOFF_1:-1}"
RETRY_BACKOFF_2="${RETRY_BACKOFF_2:-3}"

with_retry() {
  local attempt=1
  local output=""
  local exit_code=0

  while [ $attempt -le $RETRY_MAX_ATTEMPTS ]; do
    output=$("$@" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
      echo "$output"
      return 0
    fi

    if [ $attempt -lt $RETRY_MAX_ATTEMPTS ]; then
      local delay
      if [ $attempt -eq 1 ]; then
        delay=$RETRY_BACKOFF_1
      else
        delay=$RETRY_BACKOFF_2
      fi
      echo "retry.sh: attempt $attempt/$RETRY_MAX_ATTEMPTS failed (exit $exit_code). Retrying in ${delay}s..." >&2
      sleep "$delay"
    fi

    attempt=$((attempt + 1))
  done

  # All attempts exhausted — surface the last error to stderr (per contract:
  # adapter errors must go to stderr) and fail with the underlying exit code.
  echo "$output" >&2
  echo "retry.sh: all $RETRY_MAX_ATTEMPTS attempts failed." >&2
  return $exit_code
}
