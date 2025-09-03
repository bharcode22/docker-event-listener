import { Controller, Get } from '@nestjs/common';
import * as os from 'os';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    const info = {
      message: 'hallo from docker event',
      hostname: os.hostname(),
    };
    return this.appService.getHello(info);
  }
}
