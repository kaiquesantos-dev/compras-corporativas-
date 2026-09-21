import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ example: 'Tecnologia da Informação' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
