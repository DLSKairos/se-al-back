import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MagicLinkFirstAccessContext {
  adminName: string;
  orgName: string;
  link: string;
}

export interface MagicLinkInviteContext {
  adminName: string;
  orgName: string;
  link: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    this.from = this.config.get<string>('RESEND_FROM', 'SEÑAL <no-reply@señal.kairosdls.com>');

    if (!apiKey) {
      this.logger.warn(
        'MailService: RESEND_API_KEY no configurada. El envío de emails no estará disponible.',
      );
    }

    this.resend = new Resend(apiKey);
    this.logger.log('MailService: Resend inicializado');
  }

  async sendMagicLinkFirstAccess(
    to: string,
    ctx: MagicLinkFirstAccessContext,
  ): Promise<void> {
    await this.send(to, `Tu acceso a SEÑAL está listo — ${ctx.orgName}`, buildFirstAccessTemplate(ctx));
    this.logger.log(`Email de primer acceso enviado a ${to} (org: ${ctx.orgName})`);
  }

  async sendMagicLinkInvite(
    to: string,
    ctx: MagicLinkInviteContext,
  ): Promise<void> {
    await this.send(
      to,
      `Has sido invitado/a como administrador de ${ctx.orgName} en SEÑAL`,
      buildInviteTemplate(ctx),
    );
    this.logger.log(`Email de invitación enviado a ${to} (org: ${ctx.orgName})`);
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    await this.send(to, subject, html, text);
  }

  private async send(to: string, subject: string, html: string, text?: string): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (error) {
      throw new Error(`Resend: ${error.message}`);
    }
  }
}

// ─── Templates HTML ──────────────────────────────────────────────────────────

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEÑAL</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0C1624; font-family: sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card {
      background-color: #111E30;
      border-radius: 12px;
      padding: 40px;
      border: 1px solid #1e3050;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #00D4FF;
      letter-spacing: 4px;
      margin-bottom: 32px;
      text-align: center;
    }
    h1 {
      color: #F0F4F8;
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px;
    }
    p {
      color: #94A3B8;
      font-size: 15px;
      line-height: 1.6;
      margin: 0 0 16px;
    }
    .cta-wrapper { text-align: center; margin: 32px 0; }
    .cta {
      display: inline-block;
      background-color: #00D4FF;
      color: #0C1624;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 8px;
      letter-spacing: 0.5px;
    }
    .divider {
      border: none;
      border-top: 1px solid #1e3050;
      margin: 28px 0;
    }
    .small {
      font-size: 12px;
      color: #64748B;
    }
    .expiry {
      background-color: #162238;
      border-left: 3px solid #00D4FF;
      padding: 10px 16px;
      border-radius: 4px;
      margin: 16px 0;
      color: #94A3B8;
      font-size: 13px;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      color: #4B5563;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="logo">SEÑAL</div>
      ${content}
    </div>
    <div class="footer">
      <p style="color:#4B5563;font-size:12px;">
        SEÑAL — Kairos DLS Group S.A.S.<br/>
        Si no solicitaste este acceso, puedes ignorar este mensaje.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildFirstAccessTemplate(ctx: MagicLinkFirstAccessContext): string {
  const content = `
    <h1>¡Bienvenido/a a SEÑAL, ${escapeHtml(ctx.adminName)}!</h1>
    <p>
      Tu cuenta de administrador en <strong style="color:#F0F4F8">${escapeHtml(ctx.orgName)}</strong>
      está lista. Para activarla, haz clic en el botón de abajo y vincula
      tu cuenta de Google o Microsoft.
    </p>
    <div class="expiry">
      Este enlace es válido por <strong>72 horas</strong> y solo puede usarse una vez.
    </div>
    <div class="cta-wrapper">
      <a href="${escapeHtml(ctx.link)}" class="cta">Activar mi cuenta</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
      <span style="color:#00D4FF;word-break:break-all;">${escapeHtml(ctx.link)}</span>
    </p>`;

  return baseLayout(content);
}

function buildInviteTemplate(ctx: MagicLinkInviteContext): string {
  const content = `
    <h1>Has sido invitado/a como administrador</h1>
    <p>
      <strong style="color:#F0F4F8">${escapeHtml(ctx.adminName)}</strong>, has recibido una invitación
      para unirte como administrador de
      <strong style="color:#F0F4F8">${escapeHtml(ctx.orgName)}</strong> en SEÑAL.
    </p>
    <p>
      Haz clic en el botón para aceptar la invitación y vincular tu cuenta de
      Google o Microsoft.
    </p>
    <div class="expiry">
      Este enlace es válido por <strong>48 horas</strong> y solo puede usarse una vez.
    </div>
    <div class="cta-wrapper">
      <a href="${escapeHtml(ctx.link)}" class="cta">Aceptar invitación</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
      <span style="color:#00D4FF;word-break:break-all;">${escapeHtml(ctx.link)}</span>
    </p>`;

  return baseLayout(content);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
