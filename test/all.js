// Прогоняет все сценарии на основном config.js и на каждом примере из examples/.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const configs = [null, ...readdirSync(new URL('../examples', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `examples/${f}`)];
let failed = 0;
for (const cfg of configs) {
  console.log(`\n━━━ ${cfg ?? 'tgcloud/lib/config.js'} ━━━`);
  const r = spawnSync(process.execPath, ['--import', './register.js', 'run.js'], {
    stdio: 'inherit', env: { ...process.env, ...(cfg ? { BOT_CONFIG: cfg } : {}) },
  });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n❌ Конфигураций с ошибками: ${failed}` : `\n🎉 Все ${configs.length} конфигурации прошли проверку`);
process.exit(failed ? 1 : 0);
