import { v4 as uuidv4 } from 'uuid';
import { ITokenRepository } from '../interfaces/ITokenRepository';
import { IEmailService } from '../interfaces/IEmailService';
import { Token } from '../../domain/entities';
import { areaTokenInvitationTemplate } from '../../infrastructure/email/templates/areaTokenInvitationTemplate';

export class GerarTokenAreaUseCase {
  constructor(
    private readonly tokenRepository: ITokenRepository,
    private readonly emailService: IEmailService,
    private readonly tokenBaseUrl: string
  ) {}

  async execute(data: {
    area_id: string;
    email: string;
    areaName: string;
  }): Promise<{ success: true; token: string; link: string }> {
    const tokenId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token: Token = {
      id: tokenId,
      area_id: data.area_id,
      processo_id: null,
      email: data.email,
      tipo: 'area',
      usado: false,
      expires_at: expiresAt,
      created_at: new Date(),
    };

    await this.tokenRepository.save(token);

    const link = `${this.tokenBaseUrl}/avaliacao-area?token=${tokenId}`;

    await this.emailService.sendTokenEmail(
      data.email,
      `Avaliação BIA - ${data.areaName}`,
      areaTokenInvitationTemplate({
        areaName: data.areaName,
        link,
      })
    );

    return { success: true, token: tokenId, link };
  }
}
