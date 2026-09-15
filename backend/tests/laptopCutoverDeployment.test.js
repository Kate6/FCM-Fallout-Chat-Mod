const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-laptop-dev.yml'), 'utf8');
const deployScript = fs.readFileSync(path.join(root, '.github/scripts/deploy-laptop-dev.ps1'), 'utf8');

describe('laptop Dev auto-deployment safety gates', () => {
  test('runs only for dev pushes on the dedicated Windows runner', () => {
    expect(workflow).toContain('branches: [dev]');
    expect(workflow).toContain("vars.LAPTOP_DEV_AUTODEPLOY == 'true'");
    expect(workflow).toContain('runs-on: [self-hosted, Windows, X64, fcm-laptop-dev]');
    expect(workflow).toContain('cancel-in-progress: false');
  });

  test('requires an active cutover and rolls back failed health checks', () => {
    expect(deployScript).toContain("'CUTOVER_ACTIVE'");
    expect(deployScript).toContain("$_.Name -ne 'fcm-cutover-dev'");
    expect(deployScript).toContain("$checkpoint.status = 'rolled-back'");
    expect(deployScript).toContain("'http://127.0.0.1:17676/api/health'");
    expect(deployScript).toContain('docker compose --profile edge up -d --no-deps backend');
  });
});
