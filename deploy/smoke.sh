#!/usr/bin/env bash
# Checks a running deployment. Never spends SerpApi credits: searches are sent with demo:true, which the server answers from built-in data.
#   deploy/smoke.sh                       # http://localhost
#   deploy/smoke.sh https://store.example.com
set -u
BASE="${1:-http://localhost}"; BASE="${BASE%/}"
pass=0; fail=0
ok()  { echo "  PASS  $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL  $1"; fail=$((fail + 1)); }
check() { local name="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi; }

echo "Smoke test: $BASE"
check "home page loads"                  bash -c "curl -fsS --max-time 15 '$BASE/' | grep -q 'Low-Poly Store'"
check "scripts are served (main.js)"     bash -c "curl -fsS --max-time 15 -o /dev/null '$BASE/js/main.js'"
check "a component is served (room.js)"  bash -c "curl -fsS --max-time 15 -o /dev/null '$BASE/js/components/room.js'"
check "API health"                       bash -c "curl -fsS --max-time 15 '$BASE/api/health' | grep -q '\"ok\":true'"
check "demo search returns products"     bash -c "curl -fsS --max-time 15 -X POST -H 'content-type: application/json' -d '{\"query\":{\"query\":\"mechanical keyboard\"},\"demo\":true}' '$BASE/api/search' | grep -q '\"products\":\[{'"
check "demo clothing search returns garments" bash -c "curl -fsS --max-time 15 -X POST -H 'content-type: application/json' -d '{\"query\":{\"query\":\"blue hoodie\"},\"demo\":true}' '$BASE/api/search' | grep -q 'demo-cl-'"
check "demo ideas for the corkboard"     bash -c "curl -fsS --max-time 15 -X POST -H 'content-type: application/json' -d '{\"query\":{\"query\":\"gaming mouse\"},\"demo\":true}' '$BASE/api/ideas' | grep -q '\"ideas\":\['"
check "the API is not served static files" bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' '$BASE/api/nope')\" != '200' ]"
check "security headers are set"         bash -c "curl -sI --max-time 15 '$BASE/' | grep -qi 'x-content-type-options: nosniff' && curl -sI --max-time 15 '$BASE/' | grep -qi 'permissions-policy'"
check "pages are revalidated (no-cache)" bash -c "curl -sI --max-time 15 '$BASE/js/main.js' | grep -qi 'cache-control: no-cache'"
case "$BASE" in
  https://*) ok "served over HTTPS (geolocation and the mic work)";;
  http://localhost*|http://127.0.0.1*) ok "localhost counts as a secure context";;
  *) bad "plain HTTP on a real address: browsers block geolocation and the microphone here";;
esac
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
