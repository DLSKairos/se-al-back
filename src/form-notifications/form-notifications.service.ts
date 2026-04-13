import { Injectable, Logger } from '@nestjs/common';
import {
  FormSubmission,
  FormTemplate,
  NotificationTrigger,
  UserRole,
} from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { ConfigService } from '@nestjs/config';

interface NotificationRecipients {
  type: 'role' | 'email' | 'department';
  value: string; // rol, email fijo o departmentId
}

interface NotificationPayload {
  channels: string[]; // 'push' | 'email'
  recipients: NotificationRecipients[];
  subject?: string;
  body?: string;
}

@Injectable()
export class FormNotificationsService {
  private readonly logger = new Logger(FormNotificationsService.name);
  private readonly mailer: nodemailer.Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly config: ConfigService,
  ) {
    this.mailer = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  /**
   * Busca notificaciones con trigger ON_SUBMIT habilitadas y las despacha.
   * Diseñado para ser llamado con fire-and-forget (no await en el caller).
   */
  async dispatchOnSubmit(
    submission: FormSubmission,
    template: FormTemplate,
  ): Promise<void> {
    const notifications = await this.prisma.formNotification.findMany({
      where: {
        template_id: template.id,
        trigger: NotificationTrigger.ON_SUBMIT,
        enabled: true,
      },
    });

    if (notifications.length === 0) return;

    for (const notification of notifications) {
      try {
        const payload = notification as unknown as NotificationPayload;
        const recipients = payload.recipients ?? [];
        const channels = (notification.channels as string[]) ?? [];

        // Resolver emails y userIds según tipo de destinatario
        const { emails, userIds } = await this.resolveRecipients(
          recipients,
          submission.org_id,
        );

        const subject =
          notification.subject ?? `Nuevo formulario enviado: ${template.name}`;
        const body =
          notification.body ??
          `Se ha enviado el formulario "${template.name}".`;

        if (channels.includes('push')) {
          await this.sendPushToUsers(userIds, template.name, body);
        }

        if (channels.includes('email')) {
          await this.sendEmails(emails, subject, body);
        }
      } catch (err) {
        this.logger.error(
          `[FormNotifications] Error procesando notificación ${notification.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Resolución de destinatarios ───────────────────────────────────────────

  private async resolveRecipients(
    recipients: NotificationRecipients[],
    orgId: string,
  ): Promise<{ emails: string[]; userIds: string[] }> {
    const emails: string[] = [];
    const userIds: string[] = [];

    for (const recipient of recipients) {
      if (recipient.type === 'email') {
        emails.push(recipient.value);
      } else if (recipient.type === 'role') {
        const users = await this.prisma.user.findMany({
          where: {
            org_id: orgId,
            role: recipient.value as UserRole,
            is_active: true,
          },
          select: { id: true },
        });
        userIds.push(...users.map((u) => u.id));
      } else if (recipient.type === 'department') {
        const dept = await this.prisma.department.findFirst({
          where: { id: recipient.value, org_id: orgId },
          select: { email: true },
        });
        if (dept?.email) {
          emails.push(dept.email);
        }
      }
    }

    return { emails, userIds };
  }

  // ─── Envío por canal ───────────────────────────────────────────────────────

  private async sendPushToUsers(
    userIds: string[],
    title: string,
    body: string,
  ): Promise<void> {
    await Promise.allSettled(
      userIds.map((userId) =>
        this.pushNotifications.sendToUser(userId, { title, body }),
      ),
    );
  }

  private async sendEmails(
    emails: string[],
    subject: string,
    body: string,
  ): Promise<void> {
    const from = this.config.get<string>('SMTP_FROM', 'noreply@senal.app');

    await Promise.allSettled(
      emails.map((to) =>
        this.mailer
          .sendMail({
            from,
            to,
            subject,
            text: body,
            html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
          })
          .catch((err) => {
            this.logger.error(
              `[FormNotifications] Error enviando email a ${to}: ${(err as Error).message}`,
            );
          }),
      ),
    );
  }
}
