import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// Body esperado ao criar um departamento — só o nome, que precisa ser único
// (a unicidade é garantida pelo banco via @unique no schema.prisma).
export class CreateDepartmentDto {
  @ApiProperty({
    description: 'Nome único do departamento.',
    example: 'Tecnologia da Informação',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
