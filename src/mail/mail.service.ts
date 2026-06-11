import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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

/**
 * Servicio de email reutilizable para SEÑAL.
 * Usa nodemailer con SMTP configurado vía variables de entorno.
 * Si las variables SMTP faltan, registra un warning en el arranque y
 * los métodos de envío lanzan un error claro (no crashea el boot).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initTransporter();
  }

  // ─── Inicialización lazy ────────────────────────────────────────────────────

  private initTransporter(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');

    const missing = [
      !host && 'SMTP_HOST',
      !port && 'SMTP_PORT',
      !user && 'SMTP_USER',
      !pass && 'SMTP_PASS',
      !from && 'SMTP_FROM',
    ].filter(Boolean);

    if (missing.length > 0) {
      this.logger.warn(
        `MailService: variables de entorno faltantes [${missing.join(', ')}]. ` +
          'El envío de emails no estará disponible hasta que sean configuradas.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: Number(port) === 465,
      auth: { user, pass },
    });

    this.logger.log(`MailService: transporter inicializado (${host}:${port})`);
  }

  // ─── Validación ─────────────────────────────────────────────────────────────

  private ensureTransporter(): Transporter {
    if (!this.transporter) {
      throw new Error(
        'El servicio de email no está configurado. ' +
          'Completa las variables SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM en el .env.',
      );
    }
    return this.transporter;
  }

  // ─── Envío ──────────────────────────────────────────────────────────────────

  /**
   * Envía el email de primer acceso al administrador recién creado.
   * El link lleva a la pantalla donde el admin vincula su cuenta OAuth.
   */
  async sendMagicLinkFirstAccess(
    to: string,
    ctx: MagicLinkFirstAccessContext,
  ): Promise<void> {
    const transporter = this.ensureTransporter();
    const from = this.config.get<string>('SMTP_FROM');

    const html = buildFirstAccessTemplate(ctx);

    await transporter.sendMail({
      from,
      to,
      subject: `Tu acceso a SEÑAL está listo — ${ctx.orgName}`,
      html,
    });

    this.logger.log(`Email de primer acceso enviado a ${to} (org: ${ctx.orgName})`);
  }

  /**
   * Envía la invitación a un administrador existente.
   */
  async sendMagicLinkInvite(
    to: string,
    ctx: MagicLinkInviteContext,
  ): Promise<void> {
    const transporter = this.ensureTransporter();
    const from = this.config.get<string>('SMTP_FROM');

    const html = buildInviteTemplate(ctx);

    await transporter.sendMail({
      from,
      to,
      subject: `Has sido invitado/a como administrador de ${ctx.orgName} en SEÑAL`,
      html,
    });

    this.logger.log(`Email de invitación enviado a ${to} (org: ${ctx.orgName})`);
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
