import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalDecision } from '../../../generated/prisma/client';

export class DecideApprovalDto {
  @ApiProperty({
    description: 'Decisão do aprovador.',
    enum: ApprovalDecision,
    example: 'APPROVED',
  })
  @IsEnum(ApprovalDecision)
  decision: ApprovalDecision;

  @ApiPropertyOptional({
    description: 'Comentário justificando a decisão.',
    example: 'Aprovado dentro do orçamento do trimestre.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
