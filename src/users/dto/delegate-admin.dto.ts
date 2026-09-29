import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DelegateAdminDto {
  @ApiProperty({
    description:
      'true concede acesso de administrador temporário a este usuário (deve ser um Aprovador, APPROVER); false revoga.',
    example: true,
  })
  @IsBoolean()
  granted: boolean;
}
