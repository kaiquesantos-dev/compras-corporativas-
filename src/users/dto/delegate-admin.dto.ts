import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DelegateAdminDto {
  @ApiProperty({
    description:
      'true concede acesso ADMIN temporário a este usuário (deve ser APPROVER); false revoga.',
    example: true,
  })
  @IsBoolean()
  granted: boolean;
}
