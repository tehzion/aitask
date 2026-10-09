"""Reject credential-bearing QA artifacts without printing credential values."""
import io
import os
from pathlib import Path
import re
import sys
import zipfile

secrets = [value.encode() for key, value in os.environ.items()
           if re.search(r'(PASSWORD|SECRET|TOKEN|SERVICE_ROLE_KEY)', key) and len(value) >= 8]
failures = []

def inspect(data, label, depth=0):
    normalized = data.replace(b'\\"', b'"')
    credential_field = re.search(rb"(?i)[\"'](?:password|access_token|refresh_token|authorization)[\"']\s*:\s*[\"'][^\"']{8,}[\"']", normalized)
    if any(secret in data for secret in secrets) or credential_field:
        failures.append(label)
        return
    if data.startswith(b'PK\x03\x04'):
        if depth >= 4:
            failures.append(label + ' (archive nesting limit)')
            return
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = archive.infolist()
                if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 100 * 1024 * 1024:
                    failures.append(label + ' (archive size limit)')
                    return
                for entry in entries:
                    if not entry.is_dir():
                        inspect(archive.read(entry), label + '::' + entry.filename, depth + 1)
        except (zipfile.BadZipFile, RuntimeError, OSError):
            failures.append(label + ' (unreadable archive)')

for name in sys.argv[1:]:
    path = Path(name)
    if not path.exists():
        continue
    files = path.rglob('*') if path.is_dir() else [path]
    for item in files:
        if item.is_file():
            inspect(item.read_bytes(), str(item))
if failures:
    # Paths may themselves contain attacker-controlled text; redact any known secret.
    for label in failures:
        for secret in secrets:
            label = label.replace(secret.decode(errors='replace'), '[redacted]')
        print('Unsafe QA artifact rejected: ' + label, file=sys.stderr)
    sys.exit(1)
print('QA artifacts passed credential checks.')
