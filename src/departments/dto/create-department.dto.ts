import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({
    description: 'Nome único do departamento.',
    example: 'Tecnologia da Informação',
  })
  @IsString()
  @MinLength(2)
  name: string;
}
