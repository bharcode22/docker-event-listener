import { Logger } from '@nestjs/common';
import Docker = require('dockerode');
import * as os from 'os';
const { execSync } = require('child_process');
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

function getServerIp(): string {
  try {
    const ip = execSync('hostname -I | awk \'{print $2}\'').toString().trim();
    
    if (ip) {
      return ip;
    }
    
    throw new Error('Command returned empty');
  } catch (error) {
    const nets = os.networkInterfaces();

    for (const name of Object.keys(nets)) {
      const netInfos = nets[name];
      if (!netInfos) continue;

      for (const net of netInfos) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
    
    return '127.0.0.1';
  }
}

export class AdminListenerDocker {
  private readonly logger = new Logger(AdminListenerDocker.name);
  private messageTimers: Record<string, NodeJS.Timeout> = {};
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  async handle(channel: any, exchange: string) {
    await channel.assertExchange(exchange, 'fanout', { durable: true });

    const q = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(q.queue, exchange, '');

    this.logger.log(`📡 Listening for Docker commands on exchange "${exchange}"...`);

    await channel.consume(q.queue, async (msg: any) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        this.logger.debug(`📥 Message received: ${JSON.stringify(content)}`);

        const result = await this.processCommand(content);

        if (result) {
          const resultExchange = process.env.DOCKER_RESULTS || 'docker_results';
          await channel.assertExchange(resultExchange, 'fanout', { durable: true });

          const payload = {
            ...content,
            result,
            serverIp: getServerIp(),
            hostname: os.hostname(),
            timestamp: new Date().toISOString(),
          };

          channel.publish(resultExchange, '', Buffer.from(JSON.stringify(payload)));

          this.logger.log(
            `📤 Published result to ${resultExchange} from ${payload.hostname} (${payload.serverIp})`,
          );
        }

        channel.ack(msg);
      } catch (err) {
        this.logger.error(`❌ Failed to process message: ${err.message}`);
        channel.nack(msg, false, false);
      }
    });
  }

  private async processCommand(content: any) {
    const { command, payload } = content;

    try {
      switch (command) {
        case 'containers': {
          const containers = await this.docker.listContainers({ all: true });
          if (containers.length === 0) {
            return { message: '🚫 Tidak ada container.' };
          }

          const list = containers.map((c: any) => ({
            name: c.Names.join(','),
            id: c.Id.substring(0, 12),
            status: c.Status,
          }));
          return { message: '📦 Daftar container', containers: list };
        }

        case 'restart': {
          if (!payload?.containerId) {
            return { message: '⚠️ containerId tidak diberikan.' };
          }
          const container = this.docker.getContainer(payload.containerId);
          if (!container) {
            return { message: `⚠️ Container ${payload.containerId} tidak ditemukan.` };
          }
          this.logger.log(`🔄 Restarting container ${payload.containerId}...`);
          await container.restart();
          return { message: `🔄 Container ${payload.containerId} berhasil direstart.` };
        }

        case 'stop': {
          if (!payload?.containerId) {
            return { message: '⚠️ containerId tidak diberikan.' };
          }
          const container = this.docker.getContainer(payload.containerId);
          if (!container) {
            return { message: `⚠️ Container ${payload.containerId} tidak ditemukan.` };
          }
          this.logger.log(`🛑 Stopping container ${payload.containerId}...`);
          await container.stop();
          return { message: `🛑 Container ${payload.containerId} berhasil distop.` };
        }

        case 'reloadapps': {
          this.logger.log("reloadapps of" + payload.containerId)
            this.logger.log("IP KAMU ADALAH: "+getServerIp())
            if(payload.containerId === getServerIp()){
              fetch("http://localhost:3000/mobile-api/pod/reloadApi").catch(err => {
                this.logger.warn(`⚠️ Fire-and-forget request gagal: ${err.message}`);
              });
            }
          return { message: `🔄 Restarting apps for ${payload.containerId}` };
        }

        case 'runScript': {
          try {
            if(payload.containerId === getServerIp()){
              this.logger.log('▶️ Menjalankan auto-script.sh...');
              const { stdout, stderr } = await execAsync('~/auto-script.sh');
  
              if (stderr) {
                this.logger.warn(`⚠️ Script error: ${stderr}`);
              }
              return { message: '✅ auto-script.sh berhasil dijalankan.', output: stdout.trim() };
            }
          } catch (err) {
            return { message: `❌ Gagal menjalankan auto-script.sh: ${err.message}` };
          }
        }

        case 'killProcess': {
          try {
            if(payload.containerId === getServerIp()){
              this.logger.log('💀 Menjalankan kill-process.sh...');
              const { stdout, stderr } = await execAsync('~/kill-process.sh');
  
              if (stderr) {
                this.logger.warn(`⚠️ Script error: ${stderr}`);
              }
  
              return { message: '✅ kill-process.sh berhasil dijalankan.', output: stdout.trim() };
            }
          } catch (err) {
            return { message: `❌ Gagal menjalankan kill-process.sh: ${err.message}` };
          }
        }

        default:
          this.logger.warn(`⚠️ Anomali Tung Tung Tung Tung sahur: ${command}`);
          return { message: `⚠️ Command tidak dikenali: ${command}` };
      }
    } catch (error) {
      this.logger.error(`❌ Error executing command: ${error.message}`);
      return { message: `❌ Error: ${error.message}` };
    }
  }

  private resetTimer(exchange: string, cb: () => Promise<void>) {
    if (this.messageTimers[exchange]) {
      clearTimeout(this.messageTimers[exchange]);
    }
    this.messageTimers[exchange] = setTimeout(cb, 5000);
  }
}
