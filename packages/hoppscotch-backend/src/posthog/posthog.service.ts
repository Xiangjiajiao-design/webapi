import { Injectable } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { throwErr } from 'src/utils';
import { POSTHOG_CLIENT_NOT_INITIALIZED } from 'src/errors';
import { CronJob } from 'cron';

@Injectable()
export class PosthogService {
  private postHogClient: PostHog;
  private POSTHOG_API_KEY = 'phc_1RM0bUMCRRLIXDXsYFE2fWfrvh3udWb2OmiNN1DngRu';

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    if (this.configService.get('INFRA.ALLOW_ANALYTICS_COLLECTION') === 'true') {
      console.log('Initializing PostHog');
      this.postHogClient = new PostHog(this.POSTHOG_API_KEY, {
        // ToDo: Check and change host if required.
        host: 'https://eu.posthog.com',
      });

      // Schedule the cron job only if analytics collection is allowed
      this.scheduleCronJob();
    }
  }

  private scheduleCronJob() {
    // ToDo: Change expression to every week in the end
    const job = new CronJob(CronExpression.EVERY_5_SECONDS, async () => {
      await this.capture();
    });

    this.schedulerRegistry.addCronJob('captureAnalytics', job);
    job.start();
  }

  async capture() {
    if (!this.postHogClient) {
      throwErr(POSTHOG_CLIENT_NOT_INITIALIZED);
    }

    this.postHogClient.capture({
      distinctId: this.configService.get('INFRA.ANALYTICS_USER_ID'),
      event: 'sh_instance',
      properties: {
        type: 'COMMUNITY',
        total_user_count: await this.prismaService.user.count(),
        total_workspace_count: await this.prismaService.team.count(),
        version: this.configService.get('npm_package_version'),
      },
    });
    console.log('Sent event to PostHog');
  }
}
