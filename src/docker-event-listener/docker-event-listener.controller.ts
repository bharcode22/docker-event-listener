import { Controller } from '@nestjs/common';
import { DockerEventListenerService } from './docker-event-listener.service';

@Controller()
export class DockerEventListenerController {
  constructor(private readonly dockerEventListenerService: DockerEventListenerService) {}
}
