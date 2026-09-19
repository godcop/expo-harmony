import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const expectScript = fileURLToPath(new URL('./release-ohpm.exp', import.meta.url));

export async function readOhpmPassphrase() {
  const probe = spawnSync('expect', ['-v'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) {
    throw new Error('OHPM 批量发布需要 expect（macOS 自带；Linux 请安装 expect）。');
  }
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  const controller = new AbortController();
  rl.once('SIGINT', () => controller.abort());
  rl.once('close', () => controller.abort());
  process.stdout.write('OHPM 私钥 passphrase（本次发布只需输入一次，输入隐藏）: ');
  try {
    const passphrase = await rl.question('', { signal: controller.signal });
    if (!passphrase) throw new Error('OHPM 私钥 passphrase 不能为空。');
    return passphrase;
  } finally {
    rl.close();
    output.destroy();
    process.stdout.write('\n');
  }
}

export function publishOhpm(command, args, passphrase, cwd) {
  // Use a pipe, never argv, environment variables, or a configuration file for the secret.
  const result = spawnSync('expect', [expectScript, command, ...args], {
    cwd,
    input: `${passphrase}\n`,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`OHPM 发布失败（${result.signal || result.status}）。`);
}
