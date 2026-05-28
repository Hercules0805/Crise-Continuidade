import { v4 as uuidv4 } from 'uuid';
import { ITokenRepository } from '../interfaces/ITokenRepository';
import { IEmailService } from '../interfaces/IEmailService';
import { Token } from '../../domain/entities';
import { tokenInvitationTemplate } from '../../infrastructure/email/templates/tokenInvitationTemplate';

export class GerarTokenUseCase {
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly emailService: IEmailService,
    private readonly tokenBaseUrl: string
  ) {}

  async execute(data: {
    area_id: string;
    processo_id: string;
    email: string;
    areaName: string;
    processoName: string;
  }): Promise<{ success: true; token: string; link: string }> {
    const tokenId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token: Token = {
      id: tokenId,
      area_id: data.area_id,
      processo_id: data.processo_id,
      email: data.email,
      tipo: 'processo',
      usado: false,
      expires_at: expiresAt,
      created_at: new Date(),
    };

    await this.tokenRepository.save(token);

    const link = `${this.tokenBaseUrl}/avaliacao?token=${tokenId}`;

    await this.emailService.sendTokenEmail(
      data.email,
      `Avaliação BIA - ${data.areaName} - ${data.processoName}`,
      tokenInvitationTemplate({
        areaName: data.areaName,
        processoName: data.processoName,
        link,
      })
    );

    return { success: true, token: tokenId, link };
  }
}
