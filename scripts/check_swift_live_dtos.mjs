// Lightweight DTO compilation only; no Xcode app build, signing or simulator.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mural-swift-dto-check-'));
try {
  for (const name of ['TransportRoundTrip', 'LiveWireRoundTrip']) {
    const output = path.join(directory, name);
    execFileSync('swiftc', ['shared/contracts/generated/LiveDTOs.swift', `shared/contracts/tests/${name}.swift`, '-o', output], { cwd: root, stdio: 'inherit' });
    execFileSync(output, ['shared/contracts/tests/live-wire-fixtures.json'], { cwd: root, stdio: 'inherit' });
  }
} finally {
  fs.rmSync(directory, { recursive: true }); // Fresh disposable artifacts only.
}
