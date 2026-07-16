from __future__ import annotations

import hashlib
import sys


def normalize(value: str) -> str:
    return " ".join(value.strip().lower().split())


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python tools/hash_answer.py "ANSWER" "SALT"')

    answer, salt = sys.argv[1], sys.argv[2]
    digest = hashlib.sha256(f"{salt}:{normalize(answer)}".encode()).hexdigest()
    print(digest)


if __name__ == "__main__":
    main()
