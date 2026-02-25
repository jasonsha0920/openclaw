#!/usr/bin/env python3
"""Check TLS certificate expiry for a list of hosts.

Usage:
  python3 scripts/ssl_expiry_check.py --hosts-file memory/ssl_hosts.txt --threshold-days 14

Outputs one line per expiring host (<= threshold), with days remaining and notAfter.
Exit codes:
  0: success (even if expiring found)
  2: unexpected error
"""

from __future__ import annotations

import argparse
import socket
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Tuple


@dataclass
class Result:
    host: str
    port: int
    ok: bool
    not_after: datetime | None = None
    days_left: int | None = None
    error: str | None = None


def parse_hostport(s: str) -> Tuple[str, int]:
    s = s.strip()
    if not s or s.startswith("#"):
        raise ValueError("empty")
    if ":" in s:
        host, port_s = s.rsplit(":", 1)
        return host.strip(), int(port_s.strip())
    return s, 443


def get_not_after(host: str, port: int, timeout: float = 8.0) -> datetime:
    ctx = ssl.create_default_context()
    # We want to verify the certificate chain, but some hosts may present a cert
    # whose SAN/CN doesn't match the exact hostname provided (common with redirects
    # or misconfigured virtual hosts). For expiry monitoring, disable hostname
    # checking while keeping CA validation.
    ctx.check_hostname = False
    with socket.create_connection((host, port), timeout=timeout) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as ssock:
            cert = ssock.getpeercert()

    not_after_str = cert.get("notAfter")
    if not not_after_str:
        raise RuntimeError("certificate missing notAfter")

    # Example format: 'Jun  5 12:00:00 2026 GMT'
    dt = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
    return dt.replace(tzinfo=timezone.utc)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hosts-file", required=True)
    ap.add_argument("--threshold-days", type=int, default=14)
    args = ap.parse_args()

    threshold_days: int = args.threshold_days
    now = datetime.now(timezone.utc)

    # Load hosts
    lines: List[str]
    with open(args.hosts_file, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f.readlines()]

    targets: List[Tuple[str, int]] = []
    for ln in lines:
        if not ln or ln.startswith("#"):
            continue
        host, port = parse_hostport(ln)
        targets.append((host, port))

    results: List[Result] = []
    for host, port in targets:
        try:
            not_after = get_not_after(host, port)
            seconds_left = (not_after - now).total_seconds()
            days_left = int(seconds_left // 86400)
            results.append(Result(host=host, port=port, ok=True, not_after=not_after, days_left=days_left))
        except Exception as e:
            results.append(Result(host=host, port=port, ok=False, error=str(e)))

    expiring = [r for r in results if r.ok and r.days_left is not None and r.days_left <= threshold_days]
    failed = [r for r in results if not r.ok]

    # Print report (machine-readable-ish)
    if expiring:
        print(f"EXPIRING_WITHIN_{threshold_days}_DAYS")
        for r in sorted(expiring, key=lambda x: (x.days_left or 10**9, x.host)):
            na = r.not_after.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if r.not_after else "?"
            print(f"- {r.host}:{r.port}  days_left={r.days_left}  notAfter={na}")

    if failed:
        print("FAILED_TO_CHECK")
        for r in failed:
            print(f"- {r.host}:{r.port}  error={r.error}")

    if not expiring and not failed:
        print(f"OK: no certs expiring within {threshold_days} days")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        raise SystemExit(2)
