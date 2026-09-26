import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './media-tests', timeout: 45_000, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:15173', channel: process.env.CI ? undefined : 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--allow-loopback-in-peer-connection'] } },
  webServer: [
    { command: 'npm run dev -- --port 15173 --strictPort', url: 'http://127.0.0.1:15173', reuseExistingServer: false },
    { command: 'livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1 --rtc.enable_loopback_candidate --config-body "port: 17880\nlogging:\n  level: error\nrtc:\n  tcp_port: 0\n  udp_port: 17882\n  use_external_ip: false\n  stun_servers: []"',
      url: 'http://127.0.0.1:17880', reuseExistingServer: false, timeout: 20_000 },
  ],
});
