import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Igual ao CreateDepartmentDto, mas com o campo opcional — numa atualização
// parcial (PATCH), o cliente só precisa enviar o que quer mudar.
export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'Tecnologia da Informação' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}
