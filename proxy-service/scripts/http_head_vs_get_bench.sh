#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   PROXY="http://user:pass@host:port" ./scripts/http_head_vs_get_bench.sh -n 5 https://example.com https://foo.bar
# Optional:
#   UA="your user agent" REFERRER="https://ref.example" CONNECT_TO=2 REQ_TO=5

N=5
UA="${UA:-Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36}"
REFERRER="${REFERRER:-}"
CONNECT_TO="${CONNECT_TO:-2}"
REQ_TO="${REQ_TO:-5}"
CURL_OPTS=( -sS --http1.1 --max-redirs 0 --connect-timeout "$CONNECT_TO" --max-time "$REQ_TO" -A "$UA" )
[ -n "${REFERRER}" ] && CURL_OPTS+=( -e "$REFERRER" )
[ -n "${PROXY:-}" ] && CURL_OPTS+=( -x "$PROXY" )

print_help() {
  echo "Usage: PROXY=http://user:pass@host:port $0 [-n runs] url1 url2 ..."
  exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--runs) N="$2"; shift 2;;
    -h|--help) print_help;;
    *) break;;
  esac
done
[[ $# -lt 1 ]] && print_help

avg() { awk '{s+=$1} END{if(NR>0) printf "%.4f", s/NR; else print "nan"}'; }
median() {
  if [[ "$#" -eq 0 ]]; then echo "nan"; return; fi
  printf "%s\n" "$@" | sort -n | awk '{
    a[NR]=$1
  } END {
    if (NR==0) {print "nan"; exit}
    if (NR%2==1) {printf "%.4f", a[(NR+1)/2]}
    else {printf "%.4f", (a[NR/2] + a[NR/2+1])/2}
  }'
}

run_once() {
  local method="$1" url="$2"
  if [[ "$method" == "HEAD" ]]; then
    # HEAD: headers only
    curl "${CURL_OPTS[@]}" -I "$url" -o /dev/null \
      -w "%{time_total} %{http_code} %{remote_ip}\n"
  else
    # GET minimal body: range 0-0, identity
    curl "${CURL_OPTS[@]}" -H 'Range: bytes=0-0' -H 'Accept-Encoding: identity' "$url" -o /dev/null \
      -w "%{time_total} %{http_code} %{remote_ip}\n"
  fi
}

for url in "$@"; do
  head_times=()
  get_times=()
  head_codes=()
  get_codes=()

  echo "Testing: $url"
  for ((i=1;i<=N;i++)); do
    read -r t code _ip < <(run_once HEAD "$url" || true)
    head_times+=("${t:-10.0000}")
    head_codes+=("${code:-000}")
    echo "  [HEAD] iter $i: time=${t:-fail}s code=${code:-000}"
  done
  for ((i=1;i<=N;i++)); do
    read -r t code _ip < <(run_once GET "$url" || true)
    get_times+=("${t:-10.0000}")
    get_codes+=("${code:-000}")
    echo "  [GET0] iter $i: time=${t:-fail}s code=${code:-000}"
  done

  # Summaries
  head_avg=$(printf "%s\n" "${head_times[@]}" | avg)
  get_avg=$(printf "%s\n" "${get_times[@]}" | avg)
  head_p50=$(median "${head_times[@]}")
  get_p50=$(median "${get_times[@]}")

  # Success ratios (2xx/3xx)
  head_ok=$(printf "%s\n" "${head_codes[@]}" | awk '$1 ~ /^[23]/ {ok++} END{print ok+0}')
  get_ok=$(printf "%s\n" "${get_codes[@]}" | awk '$1 ~ /^[23]/ {ok++} END{print ok+0}')

  echo "Summary for $url:"
  printf "  HEAD   avg=%-7s p50=%-7s success=%d/%d\n" "$head_avg" "$head_p50" "$head_ok" "$N"
  printf "  GET0   avg=%-7s p50=%-7s success=%d/%d\n" "$get_avg" "$get_p50" "$get_ok" "$N"

  # Delta (negative means GET faster)
  awk -v a="$head_avg" -v b="$get_avg" 'BEGIN{
    d=b-a; pct=(a>0? d*100/a : 0);
    printf "  Δ(GET0-HEAD): %+0.4fs (%+0.1f%% vs HEAD)\n\n", d, pct
  }'

done
