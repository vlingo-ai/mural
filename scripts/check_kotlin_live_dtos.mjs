// Offline lightweight JVM check, not an Android/Gradle build. Missing cache fails.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle'), 'caches/modules-2/files-2.1');
function jar(group, name, version) {
  const directory = path.join(cache, group, name, version);
  const matches = fs.readdirSync(directory).flatMap(hash => fs.readdirSync(path.join(directory, hash))
    .filter(name => name.endsWith('.jar')).map(name => path.join(directory, hash, name)));
  if (matches.length !== 1) throw new Error(`Expected one cached ${name}:${version}`);
  return matches[0];
}
const std = jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20');
const annotations = jar('org.jetbrains', 'annotations', '13.0');
const runtime = [std, annotations, jar('org.jetbrains.kotlinx', 'kotlinx-serialization-core-jvm', '1.8.0'),
  jar('org.jetbrains.kotlinx', 'kotlinx-serialization-json-jvm', '1.8.0')];
const compiler = [jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'), std, annotations,
  jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'), jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
  jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'), jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0')];
const plugin = jar('org.jetbrains.kotlin', 'kotlin-serialization-compiler-plugin-embeddable', '2.1.20');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mural-live-dto-check-'));
try {
  execFileSync('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
    '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', runtime.join(path.delimiter), `-Xplugin=${plugin}`,
    'shared/contracts/generated/LiveDTOs.kt', 'shared/contracts/tests/LiveWireRoundTrip.kt', '-d', output], { cwd: root, stdio: 'inherit' });
  execFileSync('java', ['-cp', [output, ...runtime].join(path.delimiter), 'LiveWireRoundTripKt',
    'shared/contracts/tests/live-wire-fixtures.json'], { cwd: root, stdio: 'inherit' });
} finally {
  // Only the fresh generated-class directory owned by this invocation is removed.
  fs.rmSync(output, { recursive: true });
}
