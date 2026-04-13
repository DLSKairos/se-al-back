import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSignatureDto } from './dto/create-signature.dto';

@Injectable()
export class FormSignaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(submissionId: string, orgId: string, dto: CreateSignatureDto) {
    // Verify the submission exists and belongs to the org
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: orgId },
      select: { id: true },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    return this.prisma.formSignature.create({
      data: {
        submission_id: submissionId,
        signer_name: dto.signer_name,
        signer_role: dto.signer_role ?? null,
        signer_doc: dto.signer_doc ?? null,
        signature_url: dto.signature_url,
      },
    });
  }

  async findAll(submissionId: string, orgId: string) {
    // Verify the submission exists and belongs to the org
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, org_id: orgId },
      select: { id: true },
    });

    if (!submission) {
      throw new NotFoundException('Envío no encontrado');
    }

    return this.prisma.formSignature.findMany({
      where: { submission_id: submissionId },
      orderBy: { signed_at: 'asc' },
    });
  }
}
