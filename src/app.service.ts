import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(info: Record<string, any>): Record<string, any> {
    return info;
  }
}
