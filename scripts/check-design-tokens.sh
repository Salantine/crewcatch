#!/usr/bin/env bash
#
# Enforces the CrewCatch visual mandate in CI.
#
# The banned-utility list is a hard product requirement, not a style preference.
# A reviewer who forgets to catch one rounded corner or one backdrop-blur is the
# failure mode this script exists to prevent. It fails the build.
#
# Usage: npm run lint:design

set -uo pipefail

SRC="src"
FAIL=0

violations() {
  local label="$1" pattern="$2" exclude="${3:-}"
  local -a args=(-rnE "$pattern" "$SRC"
                  --include='*.tsx' --include='*.ts' --include='*.css')
  # `--exclude` must be passed as its own argv element; splicing it inline
  # mangled the quoting and silently ignored it.
  [ -n "$exclude" ] && args+=(--exclude="$exclude")

  local results
  results=$(grep "${args[@]}" 2>/dev/null || true)

  if [ -n "$results" ]; then
    echo "✗ BANNED — $label"
    echo "$results" | sed 's/^/    /'
    echo
    FAIL=1
  fi
}

echo "Checking design mandate compliance..."

# Glassmorphism
violations "glassmorphism (backdrop-blur / backdrop-filter)" \
  'backdrop-(blur|filter)'

# Neon / gradient washes
violations "gradient wash (banned aesthetic)" \
  'gradient-to-|bg-gradient|from-\[|via-\[|to-\['

# Rounded corners — sharp corners are the identity. `rounded-none` and
# `rounded-[0]` are the sanctioned ways to say "square".
violations "rounded corners (design is square by default)" \
  '\brounded(-(sm|md|lg|xl|2xl|3xl|full))?\b' \
  'globals.css'

# Soft shadow / glow
violations "soft shadow or glow" \
  '\bshadow(-(sm|md|lg|xl|2xl|inner|none))?\b'

# Pastel / off-palette fills that break the monochrome industrial palette.
# globals.css is excluded: it is the single sanctioned home for raw hex, and it
# is where the measured token values live.
violations "pastel or off-palette color literal" \
  '#(f|e)[0-9a-f]{5}\b|purple|violet|fuchsia|indigo|pink-|teal-|rose-' \
  'globals.css'

# Raw Tailwind slate as TEXT — fails AA on our surfaces. Measured:
# slate-500 = 3.81 on navy; slate-400 = 2.56 on white.
violations "raw slate-* used as text (use --fg-muted instead)" \
  '\b(text|bg)-(slate|gray)-[0-9]{3}\b'

# Forbidden copy
violations "AI-slop marketing copy" \
  'unleash the power|revolutioni[sz]e your|synergi[sz]e|game-chang|seamless(ly)? (integrat|solution)|cutting-edge'

if [ "$FAIL" -eq 0 ]; then
  echo "✓ Design mandate holds — no banned utilities or copy."
else
  echo "✗ Design mandate violated. See above."
fi

exit "$FAIL"
