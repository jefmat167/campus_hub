import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as ejs from 'ejs';
import { join } from 'path';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class ResendService implements OnModuleInit {
  private readonly logger = new Logger(ResendService.name);
  private resend: Resend;
  private readonly fromEmail: string;
  private readonly templatesDir: string;

  constructor(private readonly configService: ConfigService) {
    this.fromEmail = this.configService.getOrThrow('RESEND_FROM_EMAIL');
    this.templatesDir = join(__dirname, 'templates');
  }

  onModuleInit() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not configured. Emails will be logged but not sent.',
      );
      return;
    }

    this.resend = new Resend(apiKey);
    this.logger.log('Resend service initialized');
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, template, context } = options;

    // Render the EJS template
    let html: string;
    try {
      html = await this.renderTemplate(template, context);
    } catch (error) {
      this.logger.error(`Failed to render template ${template}: ${error.message}`);
      return { success: false, error: `Template rendering failed: ${error.message}` };
    }

    // If Resend is not configured, log the email instead
    if (!this.resend) {
      this.logger.warn('Resend not configured. Email would be sent:');
      this.logger.debug({
        to,
        subject,
        template,
        context,
      });
      return { success: true, messageId: 'dev-mode-no-send' };
    }

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });

      if (response.error) {
        this.logger.error(`Resend API error: ${response.error.message}`);
        return { success: false, error: response.error.message };
      }

      this.logger.log(`Email sent successfully to ${to}, messageId: ${response.data?.id}`);
      return { success: true, messageId: response.data?.id };
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  private async renderTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const templatePath = join(this.templatesDir, `${templateName}.ejs`);
    return ejs.renderFile(templatePath, context);
  }
}
